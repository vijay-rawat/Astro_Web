"""Who is asking: resolved once per request from the session cookie, then passed to everything."""

import uuid
from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class RequestCtx:
    user_id: uuid.UUID
    company_id: uuid.UUID
    session_id: uuid.UUID
    session_hash: str
    roles: frozenset[str]
    email: str
    name: str

    @property
    def is_admin(self) -> bool:
        return "admin" in self.roles

    def has_any(self, *roles: str) -> bool:
        return not self.roles.isdisjoint(roles)

    def to_cache(self) -> dict:
        return {
            "u": str(self.user_id),
            "c": str(self.company_id),
            "s": str(self.session_id),
            "r": sorted(self.roles),
            "e": self.email,
            "n": self.name,
        }

    @classmethod
    def from_cache(cls, data: dict, session_hash: str) -> "RequestCtx":
        return cls(
            user_id=uuid.UUID(data["u"]),
            company_id=uuid.UUID(data["c"]),
            session_id=uuid.UUID(data["s"]),
            session_hash=session_hash,
            roles=frozenset(data["r"]),
            email=data["e"],
            name=data["n"],
        )
