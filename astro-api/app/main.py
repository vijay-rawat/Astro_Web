"""The app factory: `uvicorn app.main:app`.

Startup (lifespan) builds everything a process shares, once: the two database engines, Redis (or
in-memory fallbacks), the rate limiter, the mailer and the job queue. Shutdown drains queued jobs
and closes connections, so rolling deploys lose nothing.
"""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from redis.asyncio import Redis

from app.api import audit, companies, health
from app.auth import passwords
from app.auth import router as auth_router
from app.config import Settings, get_settings
from app.core.cache import MemoryCache, RedisCache
from app.core.errors import install_error_handlers
from app.core.logging import log, setup_logging
from app.core.middleware import AstroMiddleware
from app.core.ratelimit import MemoryRateLimiter, RedisRateLimiter
from app.db.engine import Database
from app.email.sender import Mailer
from app.state import AppState
from app.workers.queue import JobQueue

DOCS_PATHS = frozenset({"/docs", "/docs/oauth2-redirect", "/redoc"})


async def build_state(settings: Settings) -> AppState:
    db = Database(settings)
    mailer = Mailer(settings)
    redis = None
    arq = None
    if settings.redis_url:
        from arq import create_pool
        from arq.connections import RedisSettings

        redis = Redis.from_url(settings.redis_url, decode_responses=True, health_check_interval=30)
        arq = await create_pool(RedisSettings.from_dsn(settings.redis_url))
        cache, limiter = RedisCache(redis), RedisRateLimiter(redis)
    else:
        cache, limiter = MemoryCache(), MemoryRateLimiter()
    state = AppState(settings=settings, db=db, cache=cache, limiter=limiter, mailer=mailer,
                     jobs=JobQueue(mailer, arq), redis=redis)
    state.extras["arq"] = arq
    return state


async def close_state(state: AppState) -> None:
    await state.jobs.drain()
    if state.extras.get("arq") is not None:
        await state.extras["arq"].aclose()
    if state.redis is not None:
        await state.redis.aclose()
    await state.db.dispose()


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    settings.check_production()
    setup_logging(settings.log_level, json=settings.is_production)

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        state = await build_state(settings)
        passwords.warm_up()
        app.state.astro = state
        log.info("startup", env=settings.app_env, redis=bool(settings.redis_url), email="console"
                 if settings.console_email else "smtp")
        try:
            yield
        finally:
            await close_state(state)

    docs = not settings.is_production
    app = FastAPI(
        title="Astro API",
        version="0.1.0",
        lifespan=lifespan,
        docs_url="/docs" if docs else None,
        redoc_url=None,
        openapi_url="/openapi.json" if docs else None,
    )
    install_error_handlers(app)
    app.add_middleware(AstroMiddleware, allowed_origins=settings.allowed_origins, max_body=settings.max_body_bytes,
                       hsts=settings.is_production, docs_paths=DOCS_PATHS)

    app.include_router(health.router)
    app.include_router(auth_router.router)
    app.include_router(companies.router)
    app.include_router(audit.router)
    if settings.is_dev:
        from app.dev import outbox

        app.include_router(outbox.router)
    return app


app = create_app()
