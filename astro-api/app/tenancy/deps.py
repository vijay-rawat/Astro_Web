"""FastAPI dependencies for identity and tenancy.

    @router.get("/companies/{company_id}/members")
    async def members(company_id: UUID, ctx: AdminCtx, db: TenantDb): ...

* `current_ctx` turns the session cookie into a RequestCtx or answers 401.
* `tenant_db` opens a session that can only see the caller's company (see db/engine.py).
* `require_roles(...)` answers 403 unless the caller has one of the roles.
* `ensure_same_company` answers 403 when a path names another company.
"""

import uuid
from collections.abc import AsyncIterator
from typing import Annotated

import structlog
from fastapi import Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import sessions
from app.core.errors import forbidden, unauthenticated
from app.state import AppState, get_state
from app.tenancy.context import RequestCtx

StateDep = Annotated[AppState, Depends(get_state)]


async def current_ctx(request: Request, state: StateDep) -> RequestCtx:
    token = request.cookies.get(state.settings.session_cookie_name)
    if not token:
        raise unauthenticated()
    ctx = await sessions.resolve(state, token)
    if ctx is None:
        raise unauthenticated()
    structlog.contextvars.bind_contextvars(user_id=str(ctx.user_id), company_id=str(ctx.company_id))
    return ctx


CtxDep = Annotated[RequestCtx, Depends(current_ctx)]


async def tenant_db(ctx: CtxDep, state: StateDep) -> AsyncIterator[AsyncSession]:
    async with state.db.tenant(ctx.company_id) as session:
        yield session


TenantDb = Annotated[AsyncSession, Depends(tenant_db)]


def require_roles(*roles: str):
    async def _check(ctx: CtxDep) -> RequestCtx:
        if not ctx.has_any(*roles):
            raise forbidden()
        return ctx

    return _check


AdminCtx = Annotated[RequestCtx, Depends(require_roles("admin"))]


def ensure_same_company(ctx: RequestCtx, company_id: uuid.UUID) -> None:
    if company_id != ctx.company_id:
        raise forbidden()
