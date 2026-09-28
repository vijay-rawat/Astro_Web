import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import ForeignKey, Index, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, created_column, id_column


class AuditLog(Base):
    """Who did what, when (roadmap §4.5). Written in the same transaction as the action it records."""

    __tablename__ = "audit_log"
    __table_args__ = (Index("ix_audit_log_company_created", "company_id", "created_at"),)

    id: Mapped[uuid.UUID] = id_column()
    company_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("companies.id", ondelete="CASCADE"))
    user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    event: Mapped[str] = mapped_column(String(64))
    agent_id: Mapped[str | None] = mapped_column(String(32))
    detail_json: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    ip: Mapped[str | None] = mapped_column(String(64))
    created_at: Mapped[datetime] = created_column()
