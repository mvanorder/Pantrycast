"""Declarative mixins holding column sets shared by more than one ORM model."""
# pylint: disable=unsubscriptable-object,too-few-public-methods
# Same astroid/pylint `Mapped[...]` limitation as documented in
# app/models/user.py.

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column


class HashedTokenColumns:
    """The `id` / `user_id` / `token_hash` / `created_at` columns common to the token tables.

    ``refresh_tokens`` and ``verification_tokens`` both store a random secret
    only as its hash, keyed by a UUID PK and a cascading `user_id` FK. Each
    table keeps its own naming-convention-derived constraint names, its own
    extra columns, and its own ``user`` relationship.
    """

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    token_hash: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )
