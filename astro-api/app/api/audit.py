"""GET /api/audit: the company's audit log, newest first, for admins.

Cursor pagination on (created_at, id): each page asks for rows older than the last one seen. It
stays fast however large the table gets, unlike OFFSET, which rescans every skipped row.
"""

import base64
import uuid
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Query
from sqlalchemy import and_, or_, select

from app.auth.schemas import Camel
from app.core.errors import ApiError
from app.db.models import AuditLog
from app.tenancy.deps import AdminCtx, TenantDb

router = APIRouter(prefix="/api", tags=["audit"])


class AuditRow(Camel):
    id: uuid.UUID
    event: str
    user_id: uuid.UUID | None
    agent_id: str | None
    detail: dict[str, Any]
    ip: str | None
    created_at: datetime


class AuditPage(Camel):
    items: list[AuditRow]
    next_cursor: str | None


def _encode(row: AuditLog) -> str:
    return base64.urlsafe_b64encode(f"{row.created_at.isoformat()}|{row.id}".encode()).decode()


def _decode(cursor: str) -> tuple[datetime, uuid.UUID]:
    try:
        stamp, row_id = base64.urlsafe_b64decode(cursor.encode()).decode().split("|")
        return datetime.fromisoformat(stamp), uuid.UUID(row_id)
    except (ValueError, UnicodeDecodeError) as exc:
        raise ApiError(400, "invalid_cursor", "That page link is no longer valid.") from exc


@router.get("/audit", response_model=AuditPage)
async def list_audit(ctx: AdminCtx, db: TenantDb, limit: int = Query(50, ge=1, le=200),
                     cursor: str | None = None) -> AuditPage:
    query = select(AuditLog).where(AuditLog.company_id == ctx.company_id)
    if cursor:
        stamp, row_id = _decode(cursor)
        query = query.where(or_(AuditLog.created_at < stamp,
                                and_(AuditLog.created_at == stamp, AuditLog.id < row_id)))
    rows = (await db.scalars(query.order_by(AuditLog.created_at.desc(), AuditLog.id.desc()).limit(limit + 1))).all()
    page = rows[:limit]
    return AuditPage(
        items=[AuditRow(id=r.id, event=r.event, user_id=r.user_id, agent_id=r.agent_id, detail=r.detail_json,
                        ip=r.ip, created_at=r.created_at) for r in page],
        next_cursor=_encode(page[-1]) if len(rows) > limit else None,
    )
