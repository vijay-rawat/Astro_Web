"""Audit rows (roadmap §4.5). Added to the caller's open transaction, so the record and the action
commit together or not at all."""

import uuid
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.metrics import AUTH_EVENTS
from app.db.models import AuditLog


def record(db: AsyncSession, *, company_id: uuid.UUID, event: str, user_id: uuid.UUID | None = None,
           ip: str | None = None, **detail: Any) -> None:
    db.add(AuditLog(company_id=company_id, user_id=user_id, event=event, ip=ip, detail_json=detail))
    if event.startswith("auth."):
        AUTH_EVENTS.labels(event).inc()
