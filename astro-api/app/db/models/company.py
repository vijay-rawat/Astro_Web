import uuid
from datetime import datetime

from sqlalchemy import Boolean, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, created_column, id_column

PRESET_LABELS = {"technology": "Technology", "finance": "Finance", "healthcare": "Healthcare", "retail": "Retail"}


class Company(Base):
    """A tenant. The only table without company_id and RLS: it is reached through the signed-in
    user's company_id, and the API checks every company ID in a path against it."""

    __tablename__ = "companies"

    id: Mapped[uuid.UUID] = id_column()
    name: Mapped[str] = mapped_column(String(120))
    domain_preset: Mapped[str] = mapped_column(String(32), default="technology")
    # Claimed only after the creator verifies an address on it. Verified sign-ups on a claimed
    # domain then join this company as members.
    email_domain: Mapped[str | None] = mapped_column(String(255), unique=True)
    allow_domain_join: Mapped[bool] = mapped_column(Boolean, default=True)
    retention_days: Mapped[int] = mapped_column(Integer, default=90)
    created_at: Mapped[datetime] = created_column()

    @property
    def initials(self) -> str:
        words = [w for w in self.name.replace("'", "").split() if w[:1].isalnum()]
        return ("".join(w[0] for w in words[:2]) or self.name[:2]).upper()

    @property
    def preset_label(self) -> str:
        return PRESET_LABELS.get(self.domain_preset, self.domain_preset.title())
