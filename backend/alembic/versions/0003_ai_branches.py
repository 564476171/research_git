"""ai branches

Revision ID: 0003
Revises: 0002
Create Date: 2026-05-02

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision: str = "0003"
down_revision: Union[str, None] = "0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    ai_output_kind = postgresql.ENUM(
        "diff_summary", "cumulative_summary", name="ai_output_kind", create_type=False
    )
    ai_output_kind.create(op.get_bind(), checkfirst=True)

    ai_message_role = postgresql.ENUM(
        "user", "assistant", name="ai_message_role", create_type=False
    )
    ai_message_role.create(op.get_bind(), checkfirst=True)

    op.create_table(
        "project_branches",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "project_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("projects.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column(
            "head_commit_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("commits.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "created_from_commit_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("commits.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "created_by_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("is_default", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=False),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.UniqueConstraint("project_id", "name", name="uq_project_branch_name"),
    )
    op.create_index("ix_project_branches_project_id", "project_branches", ["project_id"])

    op.add_column(
        "commits",
        sa.Column(
            "branch_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("project_branches.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index("ix_commits_branch_id", "commits", ["branch_id"])

    op.create_table(
        "ai_outputs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "project_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("projects.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "commit_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("commits.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("kind", ai_output_kind, nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column(
            "model_config_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("model_configs.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=False),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index("ix_ai_outputs_project_id", "ai_outputs", ["project_id"])
    op.create_index("ix_ai_outputs_commit_id", "ai_outputs", ["commit_id"])
    op.create_index("ix_ai_outputs_user_id", "ai_outputs", ["user_id"])

    op.create_table(
        "ai_conversations",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "project_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("projects.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
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
        sa.UniqueConstraint("project_id", "user_id", name="uq_ai_conversation_project_user"),
    )
    op.create_index("ix_ai_conversations_project_id", "ai_conversations", ["project_id"])
    op.create_index("ix_ai_conversations_user_id", "ai_conversations", ["user_id"])

    op.create_table(
        "ai_messages",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "conversation_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("ai_conversations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("role", ai_message_role, nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=False),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index("ix_ai_messages_conversation_id", "ai_messages", ["conversation_id"])


def downgrade() -> None:
    op.drop_index("ix_ai_messages_conversation_id", table_name="ai_messages")
    op.drop_table("ai_messages")

    op.drop_index("ix_ai_conversations_user_id", table_name="ai_conversations")
    op.drop_index("ix_ai_conversations_project_id", table_name="ai_conversations")
    op.drop_table("ai_conversations")

    op.drop_index("ix_ai_outputs_user_id", table_name="ai_outputs")
    op.drop_index("ix_ai_outputs_commit_id", table_name="ai_outputs")
    op.drop_index("ix_ai_outputs_project_id", table_name="ai_outputs")
    op.drop_table("ai_outputs")

    op.drop_index("ix_commits_branch_id", table_name="commits")
    op.drop_column("commits", "branch_id")

    op.drop_index("ix_project_branches_project_id", table_name="project_branches")
    op.drop_table("project_branches")

    op.execute("DROP TYPE IF EXISTS ai_message_role")
    op.execute("DROP TYPE IF EXISTS ai_output_kind")
