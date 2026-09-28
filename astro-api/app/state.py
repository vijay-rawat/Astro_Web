"""Everything shared by all requests in a process, created once at startup (see main.py lifespan).

Handlers get it through `get_state`, so tests can build an app with a different state and nothing
reaches for module-level globals.
"""

from dataclasses import dataclass, field
from typing import TYPE_CHECKING

from fastapi import Request
from redis.asyncio import Redis

from app.config import Settings
from app.core.cache import Cache
from app.core.ratelimit import RateLimiter
from app.db.engine import Database

if TYPE_CHECKING:
    from app.email.sender import Mailer
    from app.workers.queue import JobQueue


@dataclass
class AppState:
    settings: Settings
    db: Database
    cache: Cache
    limiter: RateLimiter
    mailer: "Mailer"
    jobs: "JobQueue"
    redis: Redis | None = None
    extras: dict = field(default_factory=dict)


def get_state(request: Request) -> AppState:
    return request.app.state.astro
