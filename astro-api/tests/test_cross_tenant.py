"""CP0: signed in as company A, nothing about company B is reachable through any endpoint.

Routes are read from the app itself, so an endpoint added later is covered automatically.
"""

import pytest
from conftest import api_routes, signup_verified


@pytest.fixture
async def two_companies(app, client, new_client):
    a = await signup_verified(app, client, "admin@alpha.example.com", "Alice Admin", "Alpha")
    b_client = new_client()
    b = await signup_verified(app, b_client, "admin@beta.example.com", "Bob Admin", "Beta")
    return a, b, b_client


async def test_every_company_route_refuses_another_company(app, client, two_companies):
    _, b, _ = two_companies
    routes = [(m, p) for m, p in api_routes(app) if "{company_id}" in p]
    assert routes, "expected company-scoped routes"
    for method, template in routes:
        r = await client.request(method, template.replace("{company_id}", b["company"]["id"]), json={})
        assert r.status_code == 403, f"{method} {template} returned {r.status_code}"
        assert b["company"]["name"] not in r.text


async def test_members_and_audit_only_show_own_company(app, client, two_companies):
    a, b, b_client = two_companies
    members = (await client.get(f"/api/companies/{a['company']['id']}/members")).json()
    assert [m["email"] for m in members] == ["admin@alpha.example.com"]

    audit = (await client.get("/api/audit")).json()["items"]
    assert audit and {row["userId"] for row in audit} <= {a["user"]["id"]}
    b_audit = (await b_client.get("/api/audit")).json()["items"]
    assert {row["userId"] for row in b_audit} <= {b["user"]["id"]}


async def test_session_of_another_user_cannot_be_deleted(app, client, two_companies):
    _, _, b_client = two_companies
    b_sessions = (await b_client.get("/api/auth/sessions")).json()
    r = await client.delete(f"/api/auth/sessions/{b_sessions[0]['id']}")
    assert r.status_code == 404
    assert (await b_client.get("/api/me")).status_code == 200


async def test_members_list_needs_admin(app, client, new_client):
    admin = await signup_verified(app, client, "boss@gamma.example.com", "Boss", "Gamma")
    member_client = new_client()
    await signup_verified(app, member_client, "crew@gamma.example.com", "Crew")
    r = await member_client.get(f"/api/companies/{admin['company']['id']}/members")
    assert r.status_code == 403
