"""The Arq worker: `arq app.workers.worker.WorkerSettings`.

Runs queued jobs with retries and a nightly cleanup. Scale it separately from the API: add worker
containers when the queue grows.
"""

from arq import cron
from arq.connections import RedisSettings
from sqlalchemy import delete, or_

from app.config import get_settings
from app.core.logging import log, setup_logging
from app.db.base import utcnow
from app.db.engine import Database
from app.db.models import AuthSession, AuthToken
from app.email.sender import Mailer
from app.email.templates import Email


async def send_email(ctx: dict, payload: dict) -> None:
    await ctx["mailer"].send(Email(**payload))


async def purge_expired(ctx: dict) -> None:
    """Delete expired sessions, and one-time tokens that expired or were already used."""
    now = utcnow()
    db: Database = ctx["db"]
    async with db.system() as s, s.begin():
        sessions = await s.execute(delete(AuthSession).where(AuthSession.expires_at < now))
        done = or_(AuthToken.expires_at < now, AuthToken.used_at.is_not(None))
        tokens = await s.execute(delete(AuthToken).where(done))
    log.info("purge.done", sessions=sessions.rowcount, tokens=tokens.rowcount)


async def startup(ctx: dict) -> None:
    settings = get_settings()
    setup_logging(settings.log_level, json=settings.is_production)
    ctx["db"] = Database(settings)
    ctx["mailer"] = Mailer(settings)


async def shutdown(ctx: dict) -> None:
    await ctx["db"].dispose()


class WorkerSettings:
    functions = [send_email]
    cron_jobs = [cron(purge_expired, hour=3, minute=17)]
    on_startup = startup
    on_shutdown = shutdown
    max_tries = 5
    job_timeout = 60
    redis_settings = RedisSettings.from_dsn(get_settings().redis_url or "redis://localhost:6379")
