"""Tests run against a real Postgres (the astro_test database, same roles as development).

Once per run: migrate astro_test from scratch. Before each test: truncate every table and build a
fresh app, so tests never see each other's data or rate-limit counters. Argon2 runs with light
parameters here so the suite stays fast; production uses the real ones.
"""

import os
import re
from collections.abc import AsyncIterator

import pytest
from sqlalchemy.engine import make_url

from app.config import Settings

_base = Settings()


def _test_url(url: str) -> str:
    return make_url(url).set(database=_base.test_database_name).render_as_string(hide_password=False)


os.environ.update({
    "APP_ENV": "test",
    "DATABASE_URL": _test_url(_base.database_url),
    "AUTH_DATABASE_URL": _test_url(_base.auth_database_url),
    "MIGRATIONS_DATABASE_URL": _test_url(_base.migrations_database_url),
    "REDIS_URL": "",
    "SMTP_HOST": "",
    "ARGON2_TIME_COST": "1",
    "ARGON2_MEMORY_KIB": "8192",
    "ARGON2_PARALLELISM": "1",
    "LOG_LEVEL": "WARNING",
})

from app.config import get_settings  # noqa: E402

get_settings.cache_clear()

import httpx  # noqa: E402
from alembic import command  # noqa: E402
from alembic.config import Config  # noqa: E402
from sqlalchemy import text  # noqa: E402
from sqlalchemy.ext.asyncio import create_async_engine  # noqa: E402

from app.main import create_app  # noqa: E402

TABLES = "audit_log, auth_tokens, sessions, user_roles, roles, users, companies"
PASSWORD = "correct-horse-battery"


@pytest.fixture(scope="session", autouse=True)
def migrated() -> None:
    cfg = Config("alembic.ini")
    cfg.attributes["configure_logger"] = False
    cfg.set_main_option("sqlalchemy.url", os.environ["MIGRATIONS_DATABASE_URL"])
    command.downgrade(cfg, "base")
    command.upgrade(cfg, "head")


@pytest.fixture
async def app():
    engine = create_async_engine(os.environ["MIGRATIONS_DATABASE_URL"])
    async with engine.begin() as conn:
        await conn.execute(text(f"TRUNCATE {TABLES} CASCADE"))
    await engine.dispose()
    application = create_app(get_settings())
    async with application.router.lifespan_context(application):
        yield application


@pytest.fixture
async def client(app) -> AsyncIterator[httpx.AsyncClient]:
    transport = httpx.ASGITransport(app=app, client=("203.0.113.7", 4000))
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


@pytest.fixture
async def new_client(app):
    """Another browser: separate cookies, same app."""
    clients: list[httpx.AsyncClient] = []

    def _make(ip: str = "203.0.113.8") -> httpx.AsyncClient:
        c = httpx.AsyncClient(transport=httpx.ASGITransport(app=app, client=(ip, 4000)), base_url="http://test")
        clients.append(c)
        return c

    yield _make
    for c in clients:
        await c.aclose()


async def outbox(app) -> list:
    state = app.state.astro
    await state.jobs.drain()
    return [email for _, email in state.mailer.outbox]


def token_from(email) -> str:
    match = re.search(r"token=([A-Za-z0-9_\-]+)", email.text)
    assert match, email.text
    return match.group(1)


async def signup_verified(app, client: httpx.AsyncClient, email: str, name: str = "Test Person",
                          company: str | None = "Test Co", password: str = PASSWORD) -> dict:
    r = await client.post("/api/auth/signup", json={"name": name, "email": email, "password": password,
                                                    "companyName": company})
    assert r.status_code == 202, r.text
    mail = next(m for m in await outbox(app) if m.to == email and "Confirm" in m.subject)
    r = await client.post("/api/auth/verify-email", json={"token": token_from(mail)})
    assert r.status_code == 200, r.text
    return r.json()


def api_routes(app) -> list[tuple[str, str]]:
    """(method, path) for every endpoint, from the OpenAPI schema so nested routers are included."""
    methods = {"get", "post", "put", "patch", "delete"}
    return [(m.upper(), path) for path, ops in app.openapi()["paths"].items() for m in ops if m in methods]
