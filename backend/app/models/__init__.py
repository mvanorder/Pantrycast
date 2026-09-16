"""ORM models package.

Importing this package registers every model's table on ``app.db.Base``'s
shared ``MetaData``, which is what Alembic autogenerate (see
``alembic/env.py``) diffs against.
"""

from app.models.audit import AuditLog
from app.models.rbac import Permission, Role, RolePermission, UserRole
from app.models.user import AuthIdentity, RefreshToken, User
from app.models.verification_token import VerificationToken

__all__ = [
    "AuditLog",
    "AuthIdentity",
    "Permission",
    "RefreshToken",
    "Role",
    "RolePermission",
    "User",
    "UserRole",
    "VerificationToken",
]
