"""All models, imported here so Base.metadata knows every table."""

from app.db.models.audit import AuditLog
from app.db.models.auth import AuthSession, AuthToken
from app.db.models.company import PRESET_LABELS, Company
from app.db.models.user import ROLE_LABELS, ROLE_NAMES, Role, User, UserRole, role_label

TENANT_TABLES = ("users", "roles", "user_roles", "sessions", "auth_tokens", "audit_log")

__all__ = [
    "PRESET_LABELS",
    "ROLE_LABELS",
    "ROLE_NAMES",
    "TENANT_TABLES",
    "AuditLog",
    "AuthSession",
    "AuthToken",
    "Company",
    "Role",
    "User",
    "UserRole",
    "role_label",
]
