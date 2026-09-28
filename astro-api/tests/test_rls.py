"""Row-level security, tested below the app: raw SQL as the astro_app role.

Even if a query in the app forgot its company filter, Postgres would still return only the rows of
the company set for the transaction, and nothing when none is set.
"""

import os

import asyncpg
import pytest
from conftest import signup_verified
from sqlalchemy.engine import make_url


def _dsn(env: str) -> str:
    url = make_url(os.environ[env])
    return url.set(drivername="postgresql").render_as_string(hide_password=False)


async def test_app_role_sees_only_the_company_it_is_set_to(app, client, new_client):
    a = await signup_verified(app, client, "one@alpha.example.com", "One", "Alpha")
    b = await signup_verified(app, new_client(), "two@beta.example.com", "Two", "Beta")
    conn = await asyncpg.connect(_dsn("DATABASE_URL"))
    try:
        assert await conn.fetchval("SELECT count(*) FROM users") == 0  # nothing without a company
        async with conn.transaction():
            await conn.execute("SELECT set_config('app.company_id', $1, true)", a["company"]["id"])
            emails = [r["email"] for r in await conn.fetch("SELECT email FROM users")]
            assert emails == ["one@alpha.example.com"]
            assert await conn.fetchval("SELECT count(*) FROM sessions") >= 1
            assert await conn.fetchval("SELECT count(*) FROM audit_log WHERE company_id = $1::uuid",
                                       b["company"]["id"]) == 0
        # The setting ended with the transaction.
        assert await conn.fetchval("SELECT count(*) FROM users") == 0
    finally:
        await conn.close()


async def test_app_role_cannot_write_into_another_company(app, client, new_client):
    a = await signup_verified(app, client, "three@alpha.example.com", "Three", "Alpha")
    b = await signup_verified(app, new_client(), "four@beta.example.com", "Four", "Beta")
    conn = await asyncpg.connect(_dsn("DATABASE_URL"))
    try:
        with pytest.raises(asyncpg.InsufficientPrivilegeError):
            async with conn.transaction():
                await conn.execute("SELECT set_config('app.company_id', $1, true)", a["company"]["id"])
                await conn.execute(
                    "INSERT INTO audit_log (id, company_id, event, detail_json, created_at) "
                    "VALUES (gen_random_uuid(), $1::uuid, 'x', '{}', now())", b["company"]["id"])
    finally:
        await conn.close()


async def test_no_app_role_can_bypass_rls():
    conn = await asyncpg.connect(_dsn("DATABASE_URL"))
    try:
        rows = await conn.fetch("SELECT rolname, rolsuper, rolbypassrls FROM pg_roles "
                                "WHERE rolname IN ('astro_app', 'astro_auth', 'astro_owner')")
        assert len(rows) == 3
        assert all(not r["rolsuper"] and not r["rolbypassrls"] for r in rows)
        forced = await conn.fetch("SELECT relname FROM pg_class WHERE relrowsecurity AND relforcerowsecurity "
                                  "AND relnamespace = 'public'::regnamespace")
        assert {r["relname"] for r in forced} == {"users", "roles", "user_roles", "sessions", "auth_tokens",
                                                  "audit_log"}
    finally:
        await conn.close()
