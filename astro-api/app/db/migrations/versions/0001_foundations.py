"""Phase 0: companies, users, roles, sessions, one-time tokens, audit log, row-level security.

Revision ID: 0001_foundations
Revises:
Create Date: 2026-09-28
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0001_foundations"
down_revision = None
branch_labels = None
depends_on = None

TS = sa.DateTime(timezone=True)

# Tables whose rows belong to one company. Each gets RLS and the two policies below.
TENANT_TABLES = ("users", "roles", "user_roles", "sessions", "auth_tokens", "audit_log")
AUTH_TABLES = ("users", "roles", "user_roles", "sessions", "auth_tokens")

GRANTS = {
    "companies": {"astro_app": "SELECT, UPDATE", "astro_auth": "SELECT, INSERT, UPDATE"},
    "users": {"astro_app": "SELECT, INSERT, UPDATE, DELETE", "astro_auth": "SELECT, INSERT, UPDATE, DELETE"},
    "roles": {"astro_app": "SELECT, INSERT, UPDATE, DELETE", "astro_auth": "SELECT, INSERT, UPDATE, DELETE"},
    "user_roles": {"astro_app": "SELECT, INSERT, UPDATE, DELETE", "astro_auth": "SELECT, INSERT, UPDATE, DELETE"},
    "sessions": {"astro_app": "SELECT, DELETE", "astro_auth": "SELECT, INSERT, UPDATE, DELETE"},
    "auth_tokens": {"astro_app": "SELECT", "astro_auth": "SELECT, INSERT, UPDATE, DELETE"},
    "audit_log": {"astro_app": "SELECT, INSERT", "astro_auth": "INSERT"},
}

TENANT_MATCH = "company_id = NULLIF(current_setting('app.company_id', true), '')::uuid"


def _company_fk() -> sa.Column:
    return sa.Column("company_id", sa.Uuid(), sa.ForeignKey("companies.id", ondelete="CASCADE"), nullable=False)


def upgrade() -> None:
    op.create_table(
        "companies",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("domain_preset", sa.String(32), nullable=False),
        sa.Column("email_domain", sa.String(255), unique=True),
        sa.Column("allow_domain_join", sa.Boolean(), nullable=False),
        sa.Column("retention_days", sa.Integer(), nullable=False),
        sa.Column("created_at", TS, nullable=False),
    )
    op.create_table(
        "users",
        sa.Column("id", sa.Uuid(), primary_key=True),
        _company_fk(),
        sa.Column("email", sa.String(320), nullable=False, unique=True),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("password_hash", sa.String(255)),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("email_verified_at", TS),
        sa.Column("password_changed_at", TS),
        sa.Column("last_login_at", TS),
        sa.Column("voice_phrase_hash", sa.String(255)),
        sa.Column("voice_enabled_at", TS),
        sa.Column("voice_failures", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("voice_locked_at", TS),
        sa.Column("created_at", TS, nullable=False),
    )
    op.create_index("ix_users_company_id", "users", ["company_id"])
    op.create_table(
        "roles",
        sa.Column("id", sa.Uuid(), primary_key=True),
        _company_fk(),
        sa.Column("name", sa.String(32), nullable=False),
        sa.UniqueConstraint("company_id", "name", name="uq_roles_company_id_name"),
    )
    op.create_index("ix_roles_company_id", "roles", ["company_id"])
    op.create_table(
        "user_roles",
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("role_id", sa.Uuid(), sa.ForeignKey("roles.id", ondelete="CASCADE"), primary_key=True),
        _company_fk(),
    )
    op.create_index("ix_user_roles_company_id", "user_roles", ["company_id"])
    op.create_table(
        "sessions",
        sa.Column("id", sa.Uuid(), primary_key=True),
        _company_fk(),
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("token_hash", sa.String(64), nullable=False, unique=True),
        sa.Column("remember", sa.Boolean(), nullable=False),
        sa.Column("method", sa.String(16), nullable=False),
        sa.Column("created_at", TS, nullable=False),
        sa.Column("last_seen_at", TS, nullable=False),
        sa.Column("expires_at", TS, nullable=False),
        sa.Column("ip", sa.String(64)),
        sa.Column("user_agent", sa.String(255)),
    )
    op.create_index("ix_sessions_company_id", "sessions", ["company_id"])
    op.create_index("ix_sessions_user_id", "sessions", ["user_id"])
    op.create_index("ix_sessions_expires_at", "sessions", ["expires_at"])
    op.create_table(
        "auth_tokens",
        sa.Column("id", sa.Uuid(), primary_key=True),
        _company_fk(),
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("kind", sa.String(24), nullable=False),
        sa.Column("token_hash", sa.String(64), nullable=False, unique=True),
        sa.Column("created_at", TS, nullable=False),
        sa.Column("expires_at", TS, nullable=False),
        sa.Column("used_at", TS),
    )
    op.create_index("ix_auth_tokens_company_id", "auth_tokens", ["company_id"])
    op.create_index("ix_auth_tokens_user_id", "auth_tokens", ["user_id"])
    op.create_table(
        "audit_log",
        sa.Column("id", sa.Uuid(), primary_key=True),
        _company_fk(),
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("event", sa.String(64), nullable=False),
        sa.Column("agent_id", sa.String(32)),
        sa.Column("detail_json", postgresql.JSONB(), nullable=False),
        sa.Column("ip", sa.String(64)),
        sa.Column("created_at", TS, nullable=False),
    )
    op.create_index("ix_audit_log_company_created", "audit_log", ["company_id", "created_at"])

    # Grants: each role gets only what it needs (roadmap §4).
    for table, roles in GRANTS.items():
        for role, privileges in roles.items():
            op.execute(f"GRANT {privileges} ON {table} TO {role}")

    # Row-level security (roadmap §4.1). FORCE applies it to the table owner too.
    for table in TENANT_TABLES:
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
        op.execute(f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY")
        op.execute(
            f"CREATE POLICY tenant_isolation ON {table} TO astro_app "
            f"USING ({TENANT_MATCH}) WITH CHECK ({TENANT_MATCH})"
        )
    for table in AUTH_TABLES:
        op.execute(f"CREATE POLICY auth_lookup ON {table} TO astro_auth USING (true) WITH CHECK (true)")
    op.execute("CREATE POLICY auth_insert ON audit_log FOR INSERT TO astro_auth WITH CHECK (true)")


def downgrade() -> None:
    for table in ("audit_log", "auth_tokens", "sessions", "user_roles", "roles", "users", "companies"):
        op.drop_table(table)
