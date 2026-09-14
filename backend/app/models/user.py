"""ORM models for user accounts, login identities, and refresh tokens.

The related single-use email-verification / password-reset tokens live in
``app/models/verification_token.py``; ``User`` back-populates them here.
"""
# pylint: disable=unsubscriptable-object
# `Mapped[...]` (SQLAlchemy 2.0's typed ORM annotations) is a real generic at
# runtime, but astroid's inference for it breaks down once pylint also has
# the sibling models in `app/models/` loaded in the same run - a known
# astroid/pylint limitation with this pattern, not an actual subscript error.

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import CITEXT, INET, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base
from app.models._mixins import HashedTokenColumns

if TYPE_CHECKING:
    from app.models.verification_token import VerificationToken


class User(Base):  # pylint: disable=too-few-public-methods
    """A user account. Login credentials live on ``AuthIdentity``, not here."""

    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    email: Mapped[str] = mapped_column(CITEXT, unique=True, nullable=False)
    display_name: Mapped[str | None] = mapped_column(String(255))
    avatar_url: Mapped[str | None] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("true"))
    email_verified: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=text("false")
    )
    is_superuser: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=text("false")
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("now()"),
        onupdate=text("now()"),
    )
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # No equivalent relationship() to AuditLog here: DB-level ON DELETE SET
    # NULL (see audit.py) already covers referential integrity for it, and
    # this keeps app.models.user free of an import from app.models.audit.
    auth_identities: Mapped[list["AuthIdentity"]] = relationship(
        back_populates="user", cascade="all, delete-orphan", passive_deletes=True
    )
    refresh_tokens: Mapped[list["RefreshToken"]] = relationship(
        back_populates="user", cascade="all, delete-orphan", passive_deletes=True
    )
    # Defined in app/models/verification_token.py; imported by app.models's
    # __init__ before mapper configuration, so the string reference resolves.
    verification_tokens: Mapped[list["VerificationToken"]] = relationship(
        back_populates="user", cascade="all, delete-orphan", passive_deletes=True
    )


class AuthIdentity(Base):  # pylint: disable=too-few-public-methods
    """A single login method (password or an OAuth provider) linked to a user."""

    __tablename__ = "auth_identities"
    __table_args__ = (
        UniqueConstraint("provider", "provider_user_id"),
        CheckConstraint("provider IN ('password', 'google')", name="provider_valid"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    provider: Mapped[str] = mapped_column(String(32), nullable=False)
    provider_user_id: Mapped[str] = mapped_column(String(255), nullable=False)
    secret_hash: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )

    user: Mapped["User"] = relationship(back_populates="auth_identities")


class RefreshToken(HashedTokenColumns, Base):  # pylint: disable=too-few-public-methods
    """An opaque, hashed refresh token issued for one user session/device."""

    __tablename__ = "refresh_tokens"

    # id / user_id / token_hash / created_at come from HashedTokenColumns.
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    user_agent: Mapped[str | None] = mapped_column(Text)
    ip_address: Mapped[str | None] = mapped_column(INET)

    user: Mapped["User"] = relationship(back_populates="refresh_tokens")
