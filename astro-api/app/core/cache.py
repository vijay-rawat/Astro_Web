"""A tiny key-value cache with TTLs: Redis in production, a dict in local development.

Used for resolved sessions (so most requests don't touch Postgres to check the cookie). Values are
short JSON strings; every key has a TTL, so the cache can never grow without bound.
"""

import time
from typing import Protocol

from redis.asyncio import Redis


class Cache(Protocol):
    async def get(self, key: str) -> str | None: ...
    async def set(self, key: str, value: str, ttl: int) -> None: ...
    async def delete(self, *keys: str) -> None: ...


class RedisCache:
    def __init__(self, redis: Redis):
        self._r = redis

    async def get(self, key: str) -> str | None:
        return await self._r.get(key)

    async def set(self, key: str, value: str, ttl: int) -> None:
        await self._r.set(key, value, ex=max(1, ttl))

    async def delete(self, *keys: str) -> None:
        if keys:
            await self._r.delete(*keys)


class MemoryCache:
    """Single-process only. Production refuses to start without Redis."""

    def __init__(self, max_items: int = 10_000):
        self._data: dict[str, tuple[float, str]] = {}
        self._max = max_items

    async def get(self, key: str) -> str | None:
        item = self._data.get(key)
        if item is None:
            return None
        if item[0] < time.monotonic():
            self._data.pop(key, None)
            return None
        return item[1]

    async def set(self, key: str, value: str, ttl: int) -> None:
        if len(self._data) >= self._max:
            now = time.monotonic()
            for k in [k for k, (exp, _) in self._data.items() if exp < now] or list(self._data)[: self._max // 10]:
                self._data.pop(k, None)
        self._data[key] = (time.monotonic() + ttl, value)

    async def delete(self, *keys: str) -> None:
        for k in keys:
            self._data.pop(k, None)
