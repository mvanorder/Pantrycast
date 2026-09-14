"""add verification_tokens table

Revision ID: ceec9dedc42b
Revises: 0e452124ee78
Create Date: 2026-09-08 19:39:57.589154

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "ceec9dedc42b"
down_revision: str | Sequence[str] | None = "0e452124ee78"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "verification_tokens",
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("token_hash", sa.String(length=255), nullable=False),
        sa.Column("purpose", sa.String(length=32), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("consumed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "purpose IN ('email_verify', 'password_reset')",
            name=op.f("ck_verification_tokens_purpose_valid"),
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_verification_tokens_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_verification_tokens")),
        sa.UniqueConstraint("token_hash", name=op.f("uq_verification_tokens_token_hash")),
    )
    op.create_index(
        op.f("ix_verification_tokens_user_id"),
        "verification_tokens",
        ["user_id"],
        unique=False,
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f("ix_verification_tokens_user_id"), table_name="verification_tokens")
    op.drop_table("verification_tokens")
