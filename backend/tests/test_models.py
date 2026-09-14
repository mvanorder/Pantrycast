from app import models
from app.db import Base
from app.models.audit import AuditLog
from app.models.rbac import Permission, Role, RolePermission, UserRole
from app.models.user import AuthIdentity, RefreshToken, User
from app.models.verification_token import VerificationToken


def test_all_uac_tables_registered_on_base_metadata() -> None:
    """Verify every §5 table is registered on ``Base.metadata`` once imported."""
    assert models  # keep the import "used" — it's what registers the tables

    assert set(Base.metadata.tables) == {
        "users",
        "auth_identities",
        "refresh_tokens",
        "verification_tokens",
        "roles",
        "permissions",
        "role_permissions",
        "user_roles",
        "audit_log",
    }


def test_users_table_shape() -> None:
    """Verify the ``users`` table's primary key, uniqueness, and email type."""
    table = User.__table__

    assert table.primary_key.columns.keys() == ["id"]
    assert table.c.email.unique
    assert not table.c.email.nullable
    assert table.c.email.type.__class__.__name__ == "CITEXT"
    assert table.c.is_active.nullable is False
    assert table.c.last_login_at.nullable is True


def test_auth_identities_constraints() -> None:
    """Verify ``auth_identities`` cascades on user delete and constrains provider."""
    table = AuthIdentity.__table__
    fk = next(iter(table.c.user_id.foreign_keys))

    assert fk.column.table.name == "users"
    assert fk.ondelete == "CASCADE"
    unique_constraints = [
        set(uc.columns.keys())
        for uc in table.constraints
        if uc.__class__.__name__ == "UniqueConstraint"
    ]
    assert {"provider", "provider_user_id"} in unique_constraints
    check_names = [
        ck.name for ck in table.constraints if ck.__class__.__name__ == "CheckConstraint"
    ]
    assert "ck_auth_identities_provider_valid" in check_names


def test_refresh_tokens_cascades_and_unique_hash() -> None:
    """Verify ``refresh_tokens`` cascades on user delete and hashes are unique."""
    table = RefreshToken.__table__
    fk = next(iter(table.c.user_id.foreign_keys))

    assert fk.column.table.name == "users"
    assert fk.ondelete == "CASCADE"
    assert table.c.token_hash.unique


def test_verification_tokens_table_shape() -> None:
    """Verify ``verification_tokens`` cascades on user delete, hashes are unique, purpose is checked."""
    table = VerificationToken.__table__
    fk = next(iter(table.c.user_id.foreign_keys))

    assert table.primary_key.columns.keys() == ["id"]
    assert fk.column.table.name == "users"
    assert fk.ondelete == "CASCADE"
    assert table.c.token_hash.unique
    assert table.c.purpose.nullable is False
    assert table.c.expires_at.nullable is False
    assert table.c.consumed_at.nullable is True
    check_names = [
        ck.name for ck in table.constraints if ck.__class__.__name__ == "CheckConstraint"
    ]
    assert "ck_verification_tokens_purpose_valid" in check_names


def test_user_backpopulates_verification_tokens() -> None:
    """Verify ``User.verification_tokens`` is wired as a cascade-delete relationship."""
    rel = User.__mapper__.relationships["verification_tokens"]

    assert rel.mapper.class_ is VerificationToken
    assert "delete-orphan" in rel.cascade


def test_rbac_join_tables_have_composite_primary_keys() -> None:
    """Verify ``role_permissions``/``user_roles`` use composite PKs, no surrogate id."""
    assert RolePermission.__table__.primary_key.columns.keys() == ["role_id", "permission_id"]
    assert UserRole.__table__.primary_key.columns.keys() == ["user_id", "role_id"]
    assert "id" not in RolePermission.__table__.c
    assert "id" not in UserRole.__table__.c


def test_roles_and_permissions_uniqueness() -> None:
    """Verify ``roles.name`` and ``permissions(resource, action)`` are unique."""
    assert Role.__table__.c.name.unique

    permission_unique = [
        set(uc.columns.keys())
        for uc in Permission.__table__.constraints
        if uc.__class__.__name__ == "UniqueConstraint"
    ]
    assert {"resource", "action"} in permission_unique


def test_audit_log_actor_is_nullable_and_set_null_on_delete() -> None:
    """Verify a deleted user's audit rows survive with ``actor_user_id`` cleared."""
    table = AuditLog.__table__
    fk = next(iter(table.c.actor_user_id.foreign_keys))

    assert table.c.actor_user_id.nullable
    assert fk.ondelete == "SET NULL"


def test_audit_log_metadata_column_uses_reserved_attribute_workaround() -> None:
    """Verify the ``metadata_`` attribute maps to the DB column literally named ``metadata``."""
    assert "metadata" in AuditLog.__table__.c
    assert AuditLog.metadata_.property.columns[0].name == "metadata"
