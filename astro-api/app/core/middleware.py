"""One pure-ASGI middleware for every request.

Pure ASGI (not Starlette's BaseHTTPMiddleware) because it adds almost no overhead and never
buffers the body, so Server-Sent Events stream straight through. In one pass it:

1. assigns a request ID (or keeps a valid incoming X-Request-ID) and binds it to the logs,
2. rejects writes whose Origin isn't the web app (CSRF defence on top of SameSite cookies),
3. rejects bodies larger than MAX_BODY_BYTES from Content-Length,
4. adds security headers to every response,
5. records latency and status in Prometheus and writes one access-log line.
"""

import json
import re
import time
import uuid

import structlog
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.core.logging import log
from app.core.metrics import LATENCY, REQUESTS

_SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}
_REQUEST_ID = re.compile(r"^[A-Za-z0-9._-]{8,64}$")

_BASE_HEADERS = [
    (b"x-content-type-options", b"nosniff"),
    (b"x-frame-options", b"DENY"),
    (b"referrer-policy", b"no-referrer"),
    (b"cross-origin-opener-policy", b"same-origin"),
    (b"permissions-policy", b"camera=(), geolocation=()"),
]
_API_CSP = (b"content-security-policy", b"default-src 'none'; frame-ancestors 'none'")
_HSTS = (b"strict-transport-security", b"max-age=63072000; includeSubDomains")
_NO_STORE = (b"cache-control", b"no-store")


def _json_error(status: int, code: str, message: str) -> tuple[dict, bytes]:
    body = json.dumps({"error": {"code": code, "message": message}}).encode()
    start = {
        "type": "http.response.start",
        "status": status,
        "headers": [(b"content-type", b"application/json"), (b"content-length", str(len(body)).encode())],
    }
    return start, body


class AstroMiddleware:
    def __init__(self, app: ASGIApp, *, allowed_origins: frozenset[str], max_body: int, hsts: bool,
                 docs_paths: frozenset[str] = frozenset()):
        self.app = app
        self.allowed = allowed_origins
        self.max_body = max_body
        self.extra = [_HSTS] if hsts else []
        self.docs_paths = docs_paths

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        started = time.perf_counter()
        headers = {k: v for k, v in scope["headers"]}
        incoming = headers.get(b"x-request-id", b"").decode("latin-1")
        request_id = incoming if _REQUEST_ID.match(incoming) else uuid.uuid4().hex
        structlog.contextvars.clear_contextvars()
        structlog.contextvars.bind_contextvars(request_id=request_id)
        method = scope["method"]
        path = scope["path"]
        status_holder = {"status": 500}

        async def send_wrapper(message: Message) -> None:
            if message["type"] == "http.response.start":
                status_holder["status"] = message["status"]
                h = list(message.get("headers", []))
                h.append((b"x-request-id", request_id.encode()))
                h.extend(_BASE_HEADERS)
                h.extend(self.extra)
                if path not in self.docs_paths and not any(k == b"content-security-policy" for k, _ in h):
                    h.append(_API_CSP)
                if path.startswith("/api/auth") or path == "/api/me":
                    h.append(_NO_STORE)
                message["headers"] = h
            await send(message)

        try:
            if method not in _SAFE_METHODS:
                origin = headers.get(b"origin")
                if origin is not None and origin.decode("latin-1").rstrip("/") not in self.allowed:
                    start, body = _json_error(403, "bad_origin", "This request came from a site Astro doesn't trust.")
                    await send_wrapper(start)
                    await send({"type": "http.response.body", "body": body})
                    return
                length = headers.get(b"content-length")
                if length is not None and length.isdigit() and int(length) > self.max_body:
                    start, body = _json_error(413, "too_large", "That request is too large.")
                    await send_wrapper(start)
                    await send({"type": "http.response.body", "body": body})
                    return
            await self.app(scope, receive, send_wrapper)
        finally:
            elapsed = time.perf_counter() - started
            route = scope.get("route")
            template = getattr(route, "path", "unmatched")
            status = status_holder["status"]
            REQUESTS.labels(method, template, str(status)).inc()
            LATENCY.labels(method, template).observe(elapsed)
            if not path.startswith(("/healthz", "/readyz", "/metrics")):
                log.info("request", method=method, path=template, status=status, ms=round(elapsed * 1000, 1))
