"""Every account rule in one place: sign-up, email verification, password and voice sign-in,
sign-out, password reset and voice passphrase setup.

Patterns used throughout:

* **Hash outside the transaction.** Argon2id takes tens of milliseconds; it runs before a
  transaction opens, so no database connection sits idle while the CPU works.
* **One transaction per action.** The change, its session and its audit row commit together.
* **Email after commit.** Messages are queued only once the data they refer to exists.
* **No account enumeration.** Sign-up, resend and forgot-password answer the same way for every
  address; failed sign-ins always say "Email or password is incorrect."
"""

from dataclasses import dataclass
from datetime import timedelta

from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError

from app.audit.log import record
from app.auth import sessions, voice
from app.auth.domains import domain_of, is_public
from app.auth.passwords import hash_secret, needs_rehash, password_problem, verify_secret
from app.auth.tokens import hash_token, new_token
from app.core.errors import ApiError, too_many
from app.core.ratelimit import Limit
from app.db.base import utcnow
from app.db.models import ROLE_NAMES, AuthToken, Company, Role, User, UserRole
from app.email import templates
from app.state import AppState
from app.tenancy.context import RequestCtx


@dataclass(frozen=True, slots=True)
class Client:
    ip: str | None
    user_agent: str | None


@dataclass(frozen=True, slots=True)
class SignedIn:
    user: User
    company: Company
    token: str
    remember: bool


# ---------------------------------------------------------------------------- limits (roadmap §3.4)
def _limits(state: AppState) -> dict[str, Limit]:
    s = state.settings
    return {
        "login_fail": Limit("login_fail", s.login_max_failures, s.login_window_seconds),
        "login_ip": Limit("login_ip", 30, 15 * 60),
        "signup_ip": Limit("signup_ip", 10, 3600),
        "email_msg": Limit("email_msg", 3, 3600),
        "email_msg_ip": Limit("email_msg_ip", 10, 3600),
        "voice_fail": Limit("voice_fail", s.voice_max_failures, s.login_window_seconds),
        "voice_ip": Limit("voice_ip", 20, 15 * 60),
        "sensitive": Limit("sensitive", 10, 15 * 60),
    }


async def _hit_or_raise(state: AppState, name: str, key: str) -> None:
    ok, retry = await state.limiter.hit(_limits(state)[name], key)
    if not ok:
        raise too_many(retry)


async def _check_or_raise(state: AppState, name: str, key: str) -> None:
    ok, retry = await state.limiter.check(_limits(state)[name], key)
    if not ok:
        raise too_many(retry)


def _link(state: AppState, mode: str, token: str) -> str:
    return f"{state.settings.web_origin}/login?mode={mode}&token={token}"


def _invalid(field: str, message: str, code: str = "invalid_input") -> ApiError:
    return ApiError(422, code, message, fields={field: message})


INVALID_CREDENTIALS = ApiError(401, "invalid_credentials", "Email or password is incorrect.")
VOICE_NOT_RECOGNIZED = ApiError(401, "voice_not_recognized", "Access phrase not recognized.")
INVALID_LINK = ApiError(400, "invalid_link", "This link has expired or was already used.")


async def _find_user(state: AppState, email: str) -> User | None:
    async with state.db.system() as db:
        return await db.scalar(select(User).where(User.email == email))


# ---------------------------------------------------------------------------- sign-up
async def signup(state: AppState, *, name: str, email: str, password: str, company_name: str | None,
                 client: Client) -> None:
    await _hit_or_raise(state, "signup_ip", client.ip or "?")
    if problem := password_problem(password, email, name):
        raise _invalid("password", problem, "weak_password")

    password_hash = await hash_secret(password)  # also equalizes timing for existing emails
    s = state.settings
    outgoing: templates.Email | None = None
    try:
        async with state.db.system() as db, db.begin():
            existing = await db.scalar(select(User).where(User.email == email))
            if existing is not None:
                outgoing = templates.existing_account(email, existing.name, f"{s.web_origin}/login",
                                                      f"{s.web_origin}/login?mode=forgot")
                record(db, company_id=existing.company_id, user_id=existing.id, event="auth.signup_existing",
                       ip=client.ip)
            else:
                outgoing = await _create_account(db, state, name=name, email=email, password_hash=password_hash,
                                                 company_name=company_name, client=client)
    except IntegrityError:
        # Two sign-ups for the same address at once: the second loses the race and gets the same reply.
        return
    if outgoing:
        await state.jobs.send_email(outgoing)


async def _create_account(db, state: AppState, *, name: str, email: str, password_hash: str,
                          company_name: str | None, client: Client) -> templates.Email:
    domain = domain_of(email)
    company = None
    if not is_public(domain):
        company = await db.scalar(
            select(Company).where(Company.email_domain == domain, Company.allow_domain_join.is_(True))
        )
    joining = company is not None
    if company is None:
        first = name.split()[0]
        company = Company(name=(company_name or f"{first}'s workspace")[:120], domain_preset="technology",
                          allow_domain_join=True, retention_days=90)
        db.add(company)
        await db.flush()
        role_rows = [Role(company_id=company.id, name=n) for n in ROLE_NAMES]
        db.add_all(role_rows)
        await db.flush()
        role_ids = {r.name: r.id for r in role_rows}
        grant = ("admin", "member")
    else:
        role_ids = dict((await db.execute(select(Role.name, Role.id).where(Role.company_id == company.id))).all())
        grant = ("member",)

    user = User(company_id=company.id, email=email, name=name, password_hash=password_hash, status="active",
                voice_failures=0)
    db.add(user)
    await db.flush()
    db.add_all([UserRole(user_id=user.id, role_id=role_ids[r], company_id=company.id) for r in grant])
    token = new_token()
    hours = state.settings.verify_token_hours
    db.add(AuthToken(company_id=company.id, user_id=user.id, kind="verify_email", token_hash=hash_token(token),
                     expires_at=utcnow() + timedelta(hours=hours)))
    record(db, company_id=company.id, user_id=user.id, event="auth.signup", ip=client.ip, joined=joining)
    return templates.verify_email(email, name, _link(state, "verify", token), company.name, joining, hours)


# ---------------------------------------------------------------------------- email verification
async def verify_email(state: AppState, *, token: str, client: Client) -> SignedIn:
    now = utcnow()
    async with state.db.system() as db, db.begin():
        row = await db.scalar(
            select(AuthToken).where(AuthToken.token_hash == hash_token(token), AuthToken.kind == "verify_email")
            .with_for_update()
        )
        if row is None or row.used_at is not None or row.expires_at < now:
            raise INVALID_LINK
        row.used_at = now
        user = await db.get(User, row.user_id)
        company = await db.get(Company, row.company_id)
        if user is None or company is None or user.status != "active":
            raise INVALID_LINK
        user.email_verified_at = user.email_verified_at or now
        user.last_login_at = now

        # The company claims the creator's domain once they prove they own an address on it.
        domain = domain_of(user.email)
        if company.email_domain is None and not is_public(domain) and "admin" in user.role_names:
            try:
                async with db.begin_nested():
                    company.email_domain = domain
                    await db.flush()
                record(db, company_id=company.id, user_id=user.id, event="auth.domain_claimed", domain=domain)
            except IntegrityError:
                company.email_domain = None  # another company already owns it

        session_token = await sessions.create(db, state, user, remember=False, method="link", ip=client.ip,
                                              user_agent=client.user_agent)
        record(db, company_id=company.id, user_id=user.id, event="auth.email_verified", ip=client.ip)
    return SignedIn(user, company, session_token, False)


async def resend_verification(state: AppState, *, email: str, client: Client) -> None:
    await _hit_or_raise(state, "email_msg_ip", client.ip or "?")
    await _hit_or_raise(state, "email_msg", f"verify:{email}")
    now = utcnow()
    hours = state.settings.verify_token_hours
    async with state.db.system() as db, db.begin():
        user = await db.scalar(select(User).where(User.email == email))
        if user is None or user.email_verified_at is not None or user.status != "active":
            return
        await db.execute(update(AuthToken).where(AuthToken.user_id == user.id, AuthToken.kind == "verify_email",
                                                 AuthToken.used_at.is_(None)).values(used_at=now))
        token = new_token()
        db.add(AuthToken(company_id=user.company_id, user_id=user.id, kind="verify_email",
                         token_hash=hash_token(token), expires_at=now + timedelta(hours=hours)))
        company = await db.get(Company, user.company_id)
        outgoing = templates.verify_email(email, user.name, _link(state, "verify", token), company.name,
                                          "admin" not in user.role_names, hours)
    await state.jobs.send_email(outgoing)


# ---------------------------------------------------------------------------- password sign-in
async def login(state: AppState, *, email: str, password: str, remember: bool, client: Client) -> SignedIn:
    fail_key = f"{email}|{client.ip}"
    await _check_or_raise(state, "login_fail", fail_key)
    await _hit_or_raise(state, "login_ip", client.ip or "?")

    user = await _find_user(state, email)
    valid = await verify_secret(user.password_hash if user else None, password)
    if not valid or user is None or user.status != "active":
        await state.limiter.hit(_limits(state)["login_fail"], fail_key)
        if user is not None:
            async with state.db.system() as db, db.begin():
                record(db, company_id=user.company_id, user_id=user.id, event="auth.login_failed", ip=client.ip)
        raise INVALID_CREDENTIALS
    if user.email_verified_at is None:
        raise ApiError(403, "email_unverified", "Confirm your email first. We can send the link again.")

    await state.limiter.reset(_limits(state)["login_fail"], fail_key)
    await state.limiter.reset(_limits(state)["voice_fail"], email)  # a password sign-in unlocks voice
    new_hash = await hash_secret(password) if needs_rehash(user.password_hash or "") else None
    return await _open_session(state, user, remember=remember, method="password", client=client,
                               extra={"password_hash": new_hash} if new_hash else {}, unlock_voice=True)


async def _open_session(state: AppState, user: User, *, remember: bool, method: str, client: Client,
                        extra: dict | None = None, unlock_voice: bool = False) -> SignedIn:
    now = utcnow()
    values: dict = {"last_login_at": now, **(extra or {})}
    if unlock_voice or method == "voice":
        values |= {"voice_failures": 0, "voice_locked_at": None}
    async with state.db.system() as db, db.begin():
        await db.execute(update(User).where(User.id == user.id).values(**values))
        token = await sessions.create(db, state, user, remember=remember, method=method, ip=client.ip,
                                      user_agent=client.user_agent)
        company = await db.get(Company, user.company_id)
        record(db, company_id=user.company_id, user_id=user.id, event=f"auth.login_{method}", ip=client.ip,
               remember=remember)
    return SignedIn(user, company, token, remember)


# ---------------------------------------------------------------------------- voice sign-in
async def voice_login(state: AppState, *, email: str, transcripts: list[str], remember: bool,
                      client: Client) -> SignedIn:
    await _hit_or_raise(state, "voice_ip", client.ip or "?")
    await _check_or_raise(state, "voice_fail", email)
    options = voice.candidates(transcripts)
    if not options:
        raise ApiError(400, "no_speech", "Astro didn't catch that. Try again.")

    user = await _find_user(state, email)
    eligible = (user is not None and user.status == "active" and user.email_verified_at is not None
                and user.voice_phrase_hash is not None and user.voice_locked_at is None)
    matched = False
    for option in options:  # the same number of hashes whether or not the account exists
        if await verify_secret(user.voice_phrase_hash if eligible and user else None, option):
            matched = True
            break

    if not matched or user is None:
        await state.limiter.hit(_limits(state)["voice_fail"], email)
        if eligible and user is not None:
            failures = user.voice_failures + 1
            locked = failures >= state.settings.voice_max_failures
            async with state.db.system() as db, db.begin():
                await db.execute(update(User).where(User.id == user.id).values(
                    voice_failures=failures, voice_locked_at=utcnow() if locked else None))
                record(db, company_id=user.company_id, user_id=user.id,
                       event="auth.voice_locked" if locked else "auth.voice_failed", ip=client.ip)
        raise VOICE_NOT_RECOGNIZED
    await state.limiter.reset(_limits(state)["voice_fail"], email)
    return await _open_session(state, user, remember=remember, method="voice", client=client)


async def set_voice_passphrase(state: AppState, ctx: RequestCtx, *, password: str, phrase: str, confirm: str,
                               client: Client) -> None:
    await _hit_or_raise(state, "sensitive", str(ctx.user_id))
    first, second = voice.normalize_phrase(phrase), voice.normalize_phrase(confirm)
    if not first:
        raise _invalid("phrase", "Astro didn't catch a phrase. Try again.")
    if first != second:
        raise _invalid("confirm", "The two recordings didn't match. Say the same phrase both times.",
                       "phrases_differ")
    if problem := voice.phrase_problem(first, ctx.email):
        raise _invalid("phrase", problem, "weak_phrase")
    if voice.normalize_phrase(password) == first:
        raise _invalid("phrase", "Use a phrase that's different from your password.", "weak_phrase")

    user = await _find_user(state, ctx.email)
    if user is None or not await verify_secret(user.password_hash, password):
        raise _invalid("password", "That password isn't right.", "invalid_credentials")
    phrase_hash = await hash_secret(first)
    async with state.db.system() as db, db.begin():
        await db.execute(update(User).where(User.id == ctx.user_id).values(
            voice_phrase_hash=phrase_hash, voice_enabled_at=utcnow(), voice_failures=0, voice_locked_at=None))
        record(db, company_id=ctx.company_id, user_id=ctx.user_id, event="auth.voice_enabled", ip=client.ip)
    await state.jobs.send_email(templates.voice_enabled(ctx.email, ctx.name))


async def remove_voice_passphrase(state: AppState, ctx: RequestCtx, *, password: str, client: Client) -> None:
    await _hit_or_raise(state, "sensitive", str(ctx.user_id))
    user = await _find_user(state, ctx.email)
    if user is None or not await verify_secret(user.password_hash, password):
        raise _invalid("password", "That password isn't right.", "invalid_credentials")
    async with state.db.system() as db, db.begin():
        await db.execute(update(User).where(User.id == ctx.user_id).values(
            voice_phrase_hash=None, voice_enabled_at=None, voice_failures=0, voice_locked_at=None))
        record(db, company_id=ctx.company_id, user_id=ctx.user_id, event="auth.voice_disabled", ip=client.ip)


# ---------------------------------------------------------------------------- sign-out
async def logout(state: AppState, ctx: RequestCtx, client: Client) -> None:
    async with state.db.system() as db, db.begin():
        await sessions.revoke_hashes(state, db, [ctx.session_hash])
        record(db, company_id=ctx.company_id, user_id=ctx.user_id, event="auth.logout", ip=client.ip)


async def logout_all(state: AppState, ctx: RequestCtx, client: Client) -> int:
    async with state.db.system() as db, db.begin():
        ended = await sessions.revoke_user(state, db, ctx.user_id)
        record(db, company_id=ctx.company_id, user_id=ctx.user_id, event="auth.logout_all", ip=client.ip,
               sessions=ended)
    return ended


# ---------------------------------------------------------------------------- password reset
async def forgot_password(state: AppState, *, email: str, client: Client) -> None:
    await _hit_or_raise(state, "email_msg_ip", client.ip or "?")
    await _hit_or_raise(state, "email_msg", f"reset:{email}")
    now = utcnow()
    minutes = state.settings.reset_token_minutes
    async with state.db.system() as db, db.begin():
        user = await db.scalar(select(User).where(User.email == email))
        if user is None or user.status != "active":
            return
        await db.execute(update(AuthToken).where(AuthToken.user_id == user.id, AuthToken.kind == "reset_password",
                                                 AuthToken.used_at.is_(None)).values(used_at=now))
        token = new_token()
        db.add(AuthToken(company_id=user.company_id, user_id=user.id, kind="reset_password",
                         token_hash=hash_token(token), expires_at=now + timedelta(minutes=minutes)))
        record(db, company_id=user.company_id, user_id=user.id, event="auth.reset_requested", ip=client.ip)
        outgoing = templates.reset_password(email, user.name, _link(state, "reset", token), minutes)
    await state.jobs.send_email(outgoing)


async def reset_password(state: AppState, *, token: str, password: str, client: Client) -> SignedIn:
    token_hash = hash_token(token)
    now = utcnow()
    async with state.db.system() as db:
        row = await db.scalar(select(AuthToken).where(AuthToken.token_hash == token_hash,
                                                      AuthToken.kind == "reset_password"))
        user = await db.get(User, row.user_id) if row else None
    if row is None or user is None or row.used_at is not None or row.expires_at < now:
        raise INVALID_LINK
    if problem := password_problem(password, user.email, user.name):
        raise _invalid("password", problem, "weak_password")
    new_hash = await hash_secret(password)

    async with state.db.system() as db, db.begin():
        locked = await db.scalar(select(AuthToken).where(AuthToken.id == row.id).with_for_update())
        if locked is None or locked.used_at is not None:
            raise INVALID_LINK
        locked.used_at = now
        # A reset also turns voice sign-in off: if the account was taken over, the attacker's
        # phrase goes with the old password.
        await db.execute(update(User).where(User.id == user.id).values(
            password_hash=new_hash, password_changed_at=now, email_verified_at=user.email_verified_at or now,
            voice_phrase_hash=None, voice_enabled_at=None, voice_failures=0, voice_locked_at=None,
            last_login_at=now))
        await sessions.revoke_user(state, db, user.id)
        session_token = await sessions.create(db, state, user, remember=False, method="link", ip=client.ip,
                                              user_agent=client.user_agent)
        company = await db.get(Company, user.company_id)
        record(db, company_id=user.company_id, user_id=user.id, event="auth.password_reset", ip=client.ip)
    await state.jobs.send_email(templates.password_changed(user.email, user.name,
                                                           f"{state.settings.web_origin}/login"))
    return SignedIn(user, company, session_token, False)


# ---------------------------------------------------------------------------- helpers for /me
async def load_me(state: AppState, ctx: RequestCtx) -> tuple[User, Company]:
    async with state.db.tenant(ctx.company_id) as db:
        user = await db.get(User, ctx.user_id)
        company_row = await db.get(Company, ctx.company_id)
    if user is None or company_row is None:
        raise ApiError(401, "unauthenticated", "Please sign in.")
    return user, company_row
