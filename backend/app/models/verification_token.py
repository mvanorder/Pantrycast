"""ORM model for single-use email-verification and password-reset tokens."""
# pylint: disable=unsubscriptable-object
# Same astroid/pylint limitation with `Mapped[...]` as documented in
# app/models/user.py — a known inference gap, not a real subscript error.

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import CheckConstraint, DateTime, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base
from app.models._mixins import HashedTokenColumns

if TYPE_CHECKING:
    from app.models.user import User


class VerificationToken(HashedTokenColumns, Base):  # pylint: disable=too-few-public-methods
    """A single-use token backing the email-verification / password-reset flows.

    Stored the same way as ``RefreshToken`` (``app/models/user.py``): the raw
    value only ever leaves the server in an email link, and only its SHA-256
    hash is persisted, looked up on redemption by exact equality. ``purpose``
    is constrained at the DB level, mirroring ``auth_identities.provider``, so
    a bad value can't reach the table even from a bug or a manual ``INSERT``.
    ``consumed_at`` is set when the token is redeemed, making reuse detectable.
    """

    __tablename__ = "verification_tokens"
    __table_args__ = (
        CheckConstraint(
            "purpose IN ('email_verify', 'password_reset')", name="purpose_valid"
        ),
    )

    # id / user_id / token_hash / created_at come from HashedTokenColumns.
    purpose: Mapped[str] = mapped_column(String(32), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    consumed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    user: Mapped["User"] = relationship(back_populates="verification_tokens")
