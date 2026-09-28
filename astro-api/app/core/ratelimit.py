"""Fixed-window rate limits shared by every container (Redis), or per process in development.

A limit is "at most N hits per window". One Redis round trip per check: INCR the window's counter
and set its expiry in the same pipeline. For sign-in we count failures only: `check` before doing
the work, `hit` when it fails, `reset` on success.
"""

import time
from dataclasses import dataclass
from typing import Protocol

from redis.asyncio import Redis


@dataclass(frozen=True, slots=True)
class Limit:
    name: str
    max: int
    window: int  # seconds


class RateLimiter(Protocol):
    async def hit(self, limit: Limit, key: str) -> tuple[bool, int]: ...
    async def check(self, limit: Limit, key: str) -> tuple[bool, int]: ...
    async def reset(self, limit: Limit, key: str) -> None: ...


def _window(limit: Limit, now: float) -> tuple[int, int]:
    index = int(now // limit.window)
    retry_after = int(limit.window - (now % limit.window)) + 1
    return index, retry_after


class RedisRateLimiter:
    def __init__(self, redis: Redis):
        self._r = redis

    def _key(self, limit: Limit, key: str, index: int) -> str:
        return f"rl:{limit.name}:{key}:{index}"

    async def hit(self, limit: Limit, key: str) -> tuple[bool, int]:
        index, retry = _window(limit, time.time())
        k = self._key(limit, key, index)
        async with self._r.pipeline(transaction=False) as p:
            p.incr(k)
            p.expire(k, limit.window + 1)
            count, _ = await p.execute()
        return count <= limit.max, retry

    async def check(self, limit: Limit, key: str) -> tuple[bool, int]:
        index, retry = _window(limit, time.time())
        count = int(await self._r.get(self._key(limit, key, index)) or 0)
        return count < limit.max, retry

    async def reset(self, limit: Limit, key: str) -> None:
        index, _ = _window(limit, time.time())
        await self._r.delete(self._key(limit, key, index))


class MemoryRateLimiter:
    def __init__(self) -> None:
        self._counts: dict[tuple[str, str, int], int] = {}

    def _prune(self, now: float) -> None:
        if len(self._counts) > 50_000:
            self._counts.clear()

    async def hit(self, limit: Limit, key: str) -> tuple[bool, int]:
        now = time.time()
        self._prune(now)
        index, retry = _window(limit, now)
        k = (limit.name, key, index)
        self._counts[k] = self._counts.get(k, 0) + 1
        return self._counts[k] <= limit.max, retry

    async def check(self, limit: Limit, key: str) -> tuple[bool, int]:
        index, retry = _window(limit, time.time())
        return self._counts.get((limit.name, key, index), 0) < limit.max, retry

    async def reset(self, limit: Limit, key: str) -> None:
        index, _ = _window(limit, time.time())
        self._counts.pop((limit.name, key, index), None)
