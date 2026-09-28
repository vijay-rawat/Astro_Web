import re
import uuid

from conftest import PASSWORD, api_routes, signup_verified

PUBLIC = {
    "/api/auth/signup", "/api/auth/verify-email", "/api/auth/resend-verification", "/api/auth/login",
    "/api/auth/voice-login", "/api/auth/forgot-password", "/api/auth/reset-password",
    "/healthz", "/readyz", "/metrics",
}


async def test_every_private_route_needs_a_session(app, client):
    """CP0: an unauthenticated request to any endpoint returns 401."""
    checked = 0
    for method, template in api_routes(app):
        if template in PUBLIC:
            continue
        path = re.sub(r"{[^}]+}", lambda _: str(uuid.uuid4()), template)
        r = await client.request(method, path, json={})
        assert r.status_code == 401, f"{method} {template} returned {r.status_code}"
        checked += 1
    assert checked >= 8


async def test_security_headers(client):
    r = await client.get("/api/me")
    for header in ("x-content-type-options", "x-frame-options", "referrer-policy", "content-security-policy",
                   "x-request-id"):
        assert header in r.headers
    assert r.headers["cache-control"] == "no-store"


async def test_writes_from_another_origin_are_refused(client):
    r = await client.post("/api/auth/login", json={"email": "a@b.example.com", "password": "x" * 10},
                          headers={"Origin": "https://evil.example"})
    assert r.status_code == 403
    assert r.json()["error"]["code"] == "bad_origin"
    ok = await client.post("/api/auth/login", json={"email": "a@b.example.com", "password": "x" * 10},
                           headers={"Origin": "http://localhost:5173"})
    assert ok.status_code == 401


async def test_session_cookie_flags(app, client):
    await signup_verified(app, client, "flags@orbital.example.com")
    r = await client.post("/api/auth/login", json={"email": "flags@orbital.example.com", "password": PASSWORD})
    cookie = r.headers["set-cookie"].lower()
    assert "httponly" in cookie and "samesite=lax" in cookie and "path=/" in cookie


async def test_failed_logins_are_rate_limited(app, client):
    await signup_verified(app, client, "limit@orbital.example.com")
    for _ in range(5):
        r = await client.post("/api/auth/login", json={"email": "limit@orbital.example.com", "password": "wrong-password"})
        assert r.status_code == 401
    r = await client.post("/api/auth/login", json={"email": "limit@orbital.example.com", "password": PASSWORD})
    assert r.status_code == 429
    assert "retry-after" in r.headers


async def test_oversized_bodies_are_refused(client):
    r = await client.post("/api/auth/login", content=b"x" * 1_100_000, headers={"content-type": "application/json"})
    assert r.status_code == 413
