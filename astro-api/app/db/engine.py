"""Async database access with tenant isolation built in.

Two engines, one per Postgres role:

* `tenant(company_id)` sessions connect as **astro_app**. Every transaction they open starts with
  `set_config('app.company_id', ..., true)` (the same as SET LOCAL: it ends with the transaction),
  and row-level security then hides every other company's rows. The setting lives exactly as long
  as the transaction, which is what makes this safe behind PgBouncer's transaction pooling.
* `system()` sessions connect as **astro_auth**, whose policies cover only the auth tables. The
  auth service uses them for the few lookups that happen before the company is known: finding a
  user by email and resolving a session cookie.

Each process keeps its own connection pool; PgBouncer (in production) multiplexes all of them onto
a few dozen Postgres connections.
"""

import uuid
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from sqlalchemy import event, text
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import Session

from app.config import Settings


class TenantSession(Session):
    """Sync-side session class for astro_app sessions; the hook below keys off it."""


@event.listens_for(TenantSession, "after_begin")
def _apply_company(session: Session, _transaction, connection) -> None:
    company_id = session.info.get("company_id")
    if company_id is None:
        raise RuntimeError("Tenant session without a company_id")
    connection.execute(text("SELECT set_config('app.company_id', :cid, true)"), {"cid": str(company_id)})


def _engine(url: str, settings: Settings, name: str) -> AsyncEngine:
    connect_args: dict = {}
    parsed = make_url(url)
    if settings.db_behind_pgbouncer:
        # PgBouncer in transaction mode can't keep prepared statements per client.
        connect_args["statement_cache_size"] = 0
        parsed = parsed.update_query_dict({"prepared_statement_cache_size": "0"})
    else:
        connect_args["server_settings"] = {"application_name": f"astro-api:{name}"}
    return create_async_engine(
        parsed,
        pool_size=settings.db_pool_size,
        max_overflow=settings.db_max_overflow,
        pool_timeout=settings.db_pool_timeout,
        pool_pre_ping=True,
        pool_recycle=1800,
        connect_args=connect_args,
    )


class Database:
    def __init__(self, settings: Settings):
        self.app_engine = _engine(settings.database_url, settings, "app")
        self.auth_engine = _engine(settings.auth_database_url, settings, "auth")
        self._tenant = async_sessionmaker(self.app_engine, expire_on_commit=False, sync_session_class=TenantSession)
        self._system = async_sessionmaker(self.auth_engine, expire_on_commit=False)

    @asynccontextmanager
    async def tenant(self, company_id: uuid.UUID) -> AsyncIterator[AsyncSession]:
        async with self._tenant(info={"company_id": company_id}) as session:
            yield session

    @asynccontextmanager
    async def system(self) -> AsyncIterator[AsyncSession]:
        async with self._system() as session:
            yield session

    async def ping(self) -> None:
        async with self.auth_engine.connect() as conn:
            await conn.execute(text("SELECT 1"))

    async def dispose(self) -> None:
        await self.app_engine.dispose()
        await self.auth_engine.dispose()
