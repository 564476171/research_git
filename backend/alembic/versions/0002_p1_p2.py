"""p1 p2

Revision ID: 0002
Revises: 0001
Create Date: 2026-05-01

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from pgvector.sqlalchemy import Vector
from sqlalchemy.dialects import postgresql


revision: str = "0002"
down_revision: Union[str, None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ---- Enums ----
    model_scope = postgresql.ENUM(
        "workspace", "user", name="model_scope", create_type=False
    )
    model_scope.create(op.get_bind(), checkfirst=True)

    commit_status = postgresql.ENUM(
        "pending", "ready", "failed", name="commit_status", create_type=False
    )
    commit_status.create(op.get_bind(), checkfirst=True)

    review_status = postgresql.ENUM(
        "open", "resolved", name="review_status", create_type=False
    )
    review_status.create(op.get_bind(), checkfirst=True)

    # ---- model_configs ----
    op.create_table(
        "model_configs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "workspace_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("workspaces.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "owner_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=True,
        ),
        sa.Column("scope", model_scope, nullable=False),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("base_url", sa.String(512), nullable=False),
        sa.Column("model", sa.String(120), nullable=False),
        sa.Column("embedding_model", sa.String(120), nullable=True),
        sa.Column("api_key_enc", sa.Text(), nullable=False),
        sa.Column("is_default", sa.Boolean(), server_default="false", nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=False),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index("ix_model_configs_workspace", "model_configs", ["workspace_id"])

    # ---- user_model_prefs ----
    op.create_table(
        "user_model_prefs",
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column(
            "workspace_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("workspaces.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column(
            "active_model_config_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("model_configs.id", ondelete="CASCADE"),
            nullable=False,
        ),
    )

    # ---- commits ----
    op.create_table(
        "commits",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "project_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("projects.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "parent_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("commits.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "author_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("message", sa.String(500), nullable=True),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("embedding", Vector(1536), nullable=True),
        sa.Column("llm_summary", sa.Text(), nullable=True),
        sa.Column("status", commit_status, server_default="pending", nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=False),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index("ix_commits_project_id", "commits", ["project_id"])
    op.create_index(
        "ix_commits_project_created",
        "commits",
        ["project_id", sa.text("created_at DESC")],
    )

    # pgvector ivfflat 索引（数据量起来后再考虑用 hnsw）
    op.execute(
        "CREATE INDEX ix_commits_embedding ON commits "
        "USING ivfflat (embedding vector_cosine_ops) WITH (lists = 10)"
    )

    # ---- reviews ----
    op.create_table(
        "reviews",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "commit_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("commits.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "reviewer_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("anchor_paragraph_ord", sa.Integer(), nullable=True),
        sa.Column("status", review_status, server_default="open", nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=False),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("resolved_at", sa.DateTime(timezone=False), nullable=True),
    )
    op.create_index("ix_reviews_commit", "reviews", ["commit_id"])


def downgrade() -> None:
    op.drop_index("ix_reviews_commit", table_name="reviews")
    op.drop_table("reviews")

    op.execute("DROP INDEX IF EXISTS ix_commits_embedding")
    op.drop_index("ix_commits_project_created", table_name="commits")
    op.drop_index("ix_commits_project_id", table_name="commits")
    op.drop_table("commits")

    op.drop_table("user_model_prefs")

    op.drop_index("ix_model_configs_workspace", table_name="model_configs")
    op.drop_table("model_configs")

    op.execute("DROP TYPE IF EXISTS review_status")
    op.execute("DROP TYPE IF EXISTS commit_status")
    op.execute("DROP TYPE IF EXISTS model_scope")
