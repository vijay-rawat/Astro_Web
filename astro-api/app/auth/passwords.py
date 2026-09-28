"""Argon2id password hashing, off the event loop.

Argon2id is deliberately slow and memory-hard (~50 ms and 64 MB per hash with the defaults), which
is what makes stolen hashes expensive to crack. Running it on the event loop would freeze every
other request in the process for that long, so each hash runs in a worker thread, and a limiter
caps how many run at once (HASH_CONCURRENCY). A burst of sign-ins then queues briefly instead of
exhausting memory.

Unknown emails still pay for one verification against a dummy hash, so response time doesn't
reveal whether an account exists.
"""

from functools import lru_cache
from pathlib import Path

import anyio
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError

from app.config import get_settings

MIN_LENGTH = 8
MAX_LENGTH = 128


@lru_cache
def _hasher() -> PasswordHasher:
    s = get_settings()
    return PasswordHasher(time_cost=s.argon2_time_cost, memory_cost=s.argon2_memory_kib,
                          parallelism=s.argon2_parallelism)


@lru_cache
def _limiter() -> anyio.CapacityLimiter:
    return anyio.CapacityLimiter(get_settings().hash_concurrency)


@lru_cache
def _dummy_hash() -> str:
    return _hasher().hash("astro-dummy-password-for-timing")


@lru_cache
def _common() -> frozenset[str]:
    path = Path(__file__).with_name("common_passwords.txt")
    return frozenset(line.strip().lower() for line in path.read_text(encoding="utf-8").splitlines() if line.strip())


async def hash_secret(secret: str) -> str:
    return await anyio.to_thread.run_sync(_hasher().hash, secret, limiter=_limiter())


def _verify_sync(stored: str, secret: str) -> bool:
    try:
        return _hasher().verify(stored, secret)
    except (VerifyMismatchError, VerificationError, InvalidHashError):
        return False


async def verify_secret(stored: str | None, secret: str) -> bool:
    """True if `secret` matches `stored`. With no stored hash, burns the same time and returns False."""
    target = stored or _dummy_hash()
    ok = await anyio.to_thread.run_sync(_verify_sync, target, secret, limiter=_limiter())
    return ok and stored is not None


def needs_rehash(stored: str) -> bool:
    try:
        return _hasher().check_needs_rehash(stored)
    except InvalidHashError:
        return True


def password_problem(password: str, email: str, name: str) -> str | None:
    """A reason the password can't be used, or None."""
    if len(password) < MIN_LENGTH:
        return f"Use at least {MIN_LENGTH} characters."
    if len(password) > MAX_LENGTH:
        return f"Use at most {MAX_LENGTH} characters."
    lowered = password.lower()
    if lowered in _common():
        return "That password is too common. Try a longer phrase."
    local = email.split("@", 1)[0].lower()
    if len(local) >= 4 and local in lowered:
        return "Don't include your email address in your password."
    for part in name.lower().split():
        if len(part) >= 4 and part in lowered:
            return "Don't include your name in your password."
    if len(set(password)) < 4:
        return "Use a mix of different characters."
    return None


def warm_up() -> None:
    """Compute the dummy hash at startup instead of on the first failed sign-in."""
    _dummy_hash()
