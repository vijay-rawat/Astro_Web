"""Server-side sessions.

Creating one stores a hashed random token and returns the token for the cookie. Resolving a
cookie is the hot path (every authenticated request), so it goes:

    cookie -> SHA-256 -> cache (Redis, 60 s) -> Postgres as astro_auth -> RequestCtx

Most requests are answered from the cache without touching Postgres. Revoking deletes the rows
and the cache keys together, so sign-out takes effect immediately rather than after the TTL.

Sessions without "remember me" slide: each use pushes expiry to now + SESSION_TTL_HOURS, but the
write happens at most every 5 minutes so reads don't turn into writes.
"""

import json
import uuid
from datetime import datetime, timedelta

from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.tokens import hash_token, new_token
from app.db.base import utcnow
from app.db.models import AuthSession, User
from app.state import AppState
from app.tenancy.context import RequestCtx

SLIDE_EVERY = timedelta(minutes=5)


def _cache_key(token_hash: str) -> str:
    return f"sess:{token_hash}"


def expiry_for(remember: bool, state: AppState, now: datetime) -> datetime:
    s = state.settings
    return now + (timedelta(days=s.session_remember_days) if remember else timedelta(hours=s.session_ttl_hours))


async def create(db: AsyncSession, state: AppState, user: User, *, remember: bool, method: str,
                 ip: str | None, user_agent: str | None) -> str:
    """Add a session to the open transaction and return the cookie token."""
    token = new_token()
    now = utcnow()
    db.add(AuthSession(
        company_id=user.company_id, user_id=user.id, token_hash=hash_token(token), remember=remember,
        method=method, created_at=now, last_seen_at=now, expires_at=expiry_for(remember, state, now),
        ip=ip, user_agent=(user_agent or "")[:255] or None,
    ))
    return token


async def resolve(state: AppState, token: str) -> RequestCtx | None:
    if len(token) > 128:
        return None
    token_hash = hash_token(token)
    cached = await state.cache.get(_cache_key(token_hash))
    if cached:
        return RequestCtx.from_cache(json.loads(cached), token_hash)

    now = utcnow()
    async with state.db.system() as db:
        row = (await db.execute(
            select(AuthSession, User)
            .join(User, User.id == AuthSession.user_id)
            .where(AuthSession.token_hash == token_hash, AuthSession.expires_at > now, User.status == "active")
        )).first()
        if row is None:
            return None
        session, user = row
        if not session.remember and now - session.last_seen_at > SLIDE_EVERY:
            await db.execute(
                update(AuthSession).where(AuthSession.id == session.id)
                .values(last_seen_at=now, expires_at=expiry_for(False, state, now))
            )
            await db.commit()
        ctx = RequestCtx(
            user_id=user.id, company_id=user.company_id, session_id=session.id, session_hash=token_hash,
            roles=frozenset(user.role_names), email=user.email, name=user.name,
        )
    ttl = min(state.settings.session_cache_seconds, int((session.expires_at - now).total_seconds()))
    if ttl > 0:
        await state.cache.set(_cache_key(token_hash), json.dumps(ctx.to_cache()), ttl)
    return ctx


async def revoke_hashes(state: AppState, db: AsyncSession, hashes: list[str]) -> None:
    if not hashes:
        return
    await db.execute(delete(AuthSession).where(AuthSession.token_hash.in_(hashes)))
    await state.cache.delete(*[_cache_key(h) for h in hashes])


async def revoke_user(state: AppState, db: AsyncSession, user_id: uuid.UUID, keep: str | None = None) -> int:
    """End every session of a user (optionally except one). Returns how many ended."""
    hashes = list((await db.execute(
        select(AuthSession.token_hash).where(AuthSession.user_id == user_id)
    )).scalars())
    hashes = [h for h in hashes if h != keep]
    await revoke_hashes(state, db, hashes)
    return len(hashes)


async def forget_cached(state: AppState, token_hash: str) -> None:
    await state.cache.delete(_cache_key(token_hash))
