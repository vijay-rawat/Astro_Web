"""Company summary and members. Every query runs in a tenant session (RLS), and a company ID in the
path that isn't the caller's gets 403 before any query runs."""

import uuid
from datetime import datetime

from fastapi import APIRouter
from sqlalchemy import select

from app.auth.schemas import Camel, CompanyOut
from app.db.models import Company, User, role_label
from app.tenancy.deps import AdminCtx, CtxDep, TenantDb, ensure_same_company

router = APIRouter(prefix="/api/companies", tags=["companies"])


class MemberOut(Camel):
    id: uuid.UUID
    name: str
    email: str
    roles: list[str]
    role_label: str
    status: str
    email_verified: bool
    voice_enabled: bool
    last_login_at: datetime | None


@router.get("/{company_id}", response_model=CompanyOut)
async def get_company(company_id: uuid.UUID, ctx: CtxDep, db: TenantDb) -> CompanyOut:
    ensure_same_company(ctx, company_id)
    company = await db.get(Company, company_id)
    assert company is not None
    return CompanyOut(id=company.id, name=company.name, initials=company.initials, preset=company.domain_preset,
                      preset_label=company.preset_label)


@router.get("/{company_id}/members", response_model=list[MemberOut])
async def list_members(company_id: uuid.UUID, ctx: AdminCtx, db: TenantDb) -> list[MemberOut]:
    ensure_same_company(ctx, company_id)
    users = (await db.scalars(select(User).where(User.company_id == company_id).order_by(User.name))).all()
    return [MemberOut(id=u.id, name=u.name, email=u.email, roles=u.role_names, role_label=role_label(u.role_names),
                      status=u.status, email_verified=u.email_verified_at is not None, voice_enabled=u.voice_enabled,
                      last_login_at=u.last_login_at) for u in users]
