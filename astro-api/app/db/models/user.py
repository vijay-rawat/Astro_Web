import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, created_column, id_column

# Section 4.4 of the roadmap. Every company gets all six.
ROLE_NAMES = ("member", "lead", "hr", "finance", "leadership", "admin")
ROLE_LABELS = {
    "admin": "Workspace admin",
    "leadership": "Leadership",
    "hr": "People team",
    "finance": "Finance",
    "lead": "Team lead",
    "member": "Member",
}


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = id_column()
    company_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("companies.id", ondelete="CASCADE"), index=True)
    email: Mapped[str] = mapped_column(String(320), unique=True)  # stored lowercased; one account per address
    name: Mapped[str] = mapped_column(String(120))
    password_hash: Mapped[str | None] = mapped_column(String(255))
    status: Mapped[str] = mapped_column(String(16), default="active")  # active | disabled
    email_verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    password_changed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # Voice passphrase: an Argon2id hash of the normalized phrase, like a second password.
    voice_phrase_hash: Mapped[str | None] = mapped_column(String(255))
    voice_enabled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    voice_failures: Mapped[int] = mapped_column(Integer, default=0)
    voice_locked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = created_column()

    roles: Mapped[list["Role"]] = relationship(secondary="user_roles", lazy="selectin", viewonly=True)

    @property
    def role_names(self) -> list[str]:
        return sorted(r.name for r in self.roles)

    @property
    def voice_enabled(self) -> bool:
        return self.voice_phrase_hash is not None


class Role(Base):
    __tablename__ = "roles"
    __table_args__ = (UniqueConstraint("company_id", "name"),)

    id: Mapped[uuid.UUID] = id_column()
    company_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("companies.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(32))


class UserRole(Base):
    __tablename__ = "user_roles"

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    role_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("roles.id", ondelete="CASCADE"), primary_key=True)
    company_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("companies.id", ondelete="CASCADE"), index=True)


def role_label(roles: list[str]) -> str:
    for name in ("admin", "leadership", "hr", "finance", "lead"):
        if name in roles:
            return ROLE_LABELS[name]
    return ROLE_LABELS["member"]
