"""Time-ordered UUIDv7 ids. New rows land at the end of the primary-key index instead of at random
places, which keeps inserts fast as tables grow (UUIDv4 scatters them)."""

import uuid

from uuid_utils.compat import uuid7


def new_id() -> uuid.UUID:
    return uuid7()
