"""/api/auth/* and /api/me. Thin on purpose: parse the request, call the service, set or clear the
cookie, shape the reply. The rules live in service.py."""

import uuid

from fastapi import APIRouter, Request, Response, status
from sqlalchemy import delete, select

from app.auth import service, sessions
from app.auth.cookies import clear_session_cookie, set_session_cookie
from app.auth.schemas import (
    AcceptedOut,
    CompanyOut,
    EmailIn,
    LoginIn,
    MeOut,
    PasswordIn,
    ResetIn,
    SessionOut,
    SignupIn,
    TokenIn,
    UserOut,
    VoiceLoginIn,
    VoiceSetupIn,
)
from app.core.errors import ApiError
from app.db.models import AuthSession, Company, User, role_label
from app.tenancy.deps import CtxDep, StateDep, TenantDb

router = APIRouter(prefix="/api", tags=["auth"])
ACCEPTED = AcceptedOut(status="accepted")


def _client(request: Request) -> service.Client:
    return service.Client(ip=request.client.host if request.client else None,
                          user_agent=request.headers.get("user-agent"))


def me_out(user: User, company: Company) -> MeOut:
    roles = user.role_names
    initials = "".join(p[0] for p in user.name.split()[:2]).upper() or user.email[:2].upper()
    return MeOut(
        user=UserOut(id=user.id, name=user.name, email=user.email, initials=initials, roles=roles,
                     role_label=role_label(roles), can_manage="admin" in roles, voice_enabled=user.voice_enabled),
        company=CompanyOut(id=company.id, name=company.name, initials=company.initials,
                           preset=company.domain_preset, preset_label=company.preset_label),
    )


def _signed_in(response: Response, state, result: service.SignedIn) -> MeOut:
    set_session_cookie(response, result.token, result.remember, state.settings)
    return me_out(result.user, result.company)


@router.post("/auth/signup", status_code=status.HTTP_202_ACCEPTED, response_model=AcceptedOut)
async def signup(body: SignupIn, request: Request, state: StateDep) -> AcceptedOut:
    await service.signup(state, name=body.name, email=body.email, password=body.password,
                         company_name=body.company_name, client=_client(request))
    return ACCEPTED


@router.post("/auth/verify-email", response_model=MeOut)
async def verify_email(body: TokenIn, request: Request, response: Response, state: StateDep) -> MeOut:
    return _signed_in(response, state, await service.verify_email(state, token=body.token, client=_client(request)))


@router.post("/auth/resend-verification", status_code=status.HTTP_202_ACCEPTED, response_model=AcceptedOut)
async def resend_verification(body: EmailIn, request: Request, state: StateDep) -> AcceptedOut:
    await service.resend_verification(state, email=body.email, client=_client(request))
    return ACCEPTED


@router.post("/auth/login", response_model=MeOut)
async def login(body: LoginIn, request: Request, response: Response, state: StateDep) -> MeOut:
    result = await service.login(state, email=body.email, password=body.password, remember=body.remember,
                                 client=_client(request))
    return _signed_in(response, state, result)


@router.post("/auth/voice-login", response_model=MeOut)
async def voice_login(body: VoiceLoginIn, request: Request, response: Response, state: StateDep) -> MeOut:
    result = await service.voice_login(state, email=body.email, transcripts=body.transcripts,
                                       remember=body.remember, client=_client(request))
    return _signed_in(response, state, result)


@router.post("/auth/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(ctx: CtxDep, request: Request, response: Response, state: StateDep) -> None:
    await service.logout(state, ctx, _client(request))
    clear_session_cookie(response, state.settings)


@router.post("/auth/logout-all", status_code=status.HTTP_204_NO_CONTENT)
async def logout_all(ctx: CtxDep, request: Request, response: Response, state: StateDep) -> None:
    await service.logout_all(state, ctx, _client(request))
    clear_session_cookie(response, state.settings)


@router.post("/auth/forgot-password", status_code=status.HTTP_202_ACCEPTED, response_model=AcceptedOut)
async def forgot_password(body: EmailIn, request: Request, state: StateDep) -> AcceptedOut:
    await service.forgot_password(state, email=body.email, client=_client(request))
    return ACCEPTED


@router.post("/auth/reset-password", response_model=MeOut)
async def reset_password(body: ResetIn, request: Request, response: Response, state: StateDep) -> MeOut:
    result = await service.reset_password(state, token=body.token, password=body.password, client=_client(request))
    return _signed_in(response, state, result)


@router.put("/auth/voice-passphrase", status_code=status.HTTP_204_NO_CONTENT)
async def set_voice_passphrase(body: VoiceSetupIn, ctx: CtxDep, request: Request, state: StateDep) -> None:
    await service.set_voice_passphrase(state, ctx, password=body.password, phrase=body.phrase, confirm=body.confirm,
                                       client=_client(request))


@router.delete("/auth/voice-passphrase", status_code=status.HTTP_204_NO_CONTENT)
async def remove_voice_passphrase(body: PasswordIn, ctx: CtxDep, request: Request, state: StateDep) -> None:
    await service.remove_voice_passphrase(state, ctx, password=body.password, client=_client(request))


@router.get("/auth/sessions", response_model=list[SessionOut])
async def list_sessions(ctx: CtxDep, db: TenantDb) -> list[SessionOut]:
    rows = (await db.scalars(
        select(AuthSession).where(AuthSession.user_id == ctx.user_id).order_by(AuthSession.last_seen_at.desc())
    )).all()
    return [SessionOut(id=r.id, current=r.id == ctx.session_id, method=r.method, created_at=r.created_at,
                       last_seen_at=r.last_seen_at, expires_at=r.expires_at, ip=r.ip, user_agent=r.user_agent)
            for r in rows]


@router.delete("/auth/sessions/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_session(session_id: uuid.UUID, ctx: CtxDep, db: TenantDb, state: StateDep) -> None:
    token_hash = await db.scalar(select(AuthSession.token_hash).where(
        AuthSession.id == session_id, AuthSession.user_id == ctx.user_id))
    if token_hash is None:
        raise ApiError(404, "not_found", "That session doesn't exist.")
    await db.execute(delete(AuthSession).where(AuthSession.id == session_id))
    await db.commit()
    await sessions.forget_cached(state, token_hash)


@router.get("/me", response_model=MeOut)
async def me(ctx: CtxDep, state: StateDep) -> MeOut:
    user, company = await service.load_me(state, ctx)
    return me_out(user, company)
