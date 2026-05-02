"""platform frontend url

Revision ID: 0006
Revises: 0005
Create Date: 2026-05-02

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "0006"
down_revision: Union[str, None] = "0005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "platform_settings",
        sa.Column(
            "frontend_url",
            sa.String(length=512),
            nullable=False,
            server_default="http://localhost:3000",
        ),
    )


def downgrade() -> None:
    op.drop_column("platform_settings", "frontend_url")
