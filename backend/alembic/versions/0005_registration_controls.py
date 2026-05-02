"""registration controls

Revision ID: 0005
Revises: 0004
Create Date: 2026-05-02

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision: str = "0005"
down_revision: Union[str, None] = "0004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    registration_mode = postgresql.ENUM(
        "open",
        "invite_code",
        "closed",
        name="registration_mode",
        create_type=False,
    )
    registration_mode.create(op.get_bind(), checkfirst=True)

    op.create_table(
        "platform_settings",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "registration_mode",
            registration_mode,
            nullable=False,
            server_default="open",
        ),
        sa.Column(
            "updated_by_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=False),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=False),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.CheckConstraint("id = 1", name="ck_platform_settings_singleton"),
    )
    op.execute("INSERT INTO platform_settings (id, registration_mode) VALUES (1, 'open')")

    op.create_table(
        "invite_codes",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("code_hash", sa.String(64), nullable=False, unique=True),
        sa.Column("active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("max_uses", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("use_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("expires_at", sa.DateTime(timezone=False), nullable=True),
        sa.Column("last_used_at", sa.DateTime(timezone=False), nullable=True),
        sa.Column(
            "created_by_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=False),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.CheckConstraint("max_uses > 0", name="ck_invite_codes_max_uses_positive"),
        sa.CheckConstraint("use_count >= 0", name="ck_invite_codes_use_count_nonnegative"),
        sa.CheckConstraint("use_count <= max_uses", name="ck_invite_codes_use_count_max"),
    )
    op.create_index("ix_invite_codes_code_hash", "invite_codes", ["code_hash"])


def downgrade() -> None:
    op.drop_index("ix_invite_codes_code_hash", table_name="invite_codes")
    op.drop_table("invite_codes")
    op.drop_table("platform_settings")
    op.execute("DROP TYPE IF EXISTS registration_mode")
