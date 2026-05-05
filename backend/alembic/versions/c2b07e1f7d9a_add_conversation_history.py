"""add conversation history

Revision ID: c2b07e1f7d9a
Revises: 7effd58d4c06
Create Date: 2026-05-04 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "c2b07e1f7d9a"
down_revision: Union[str, Sequence[str], None] = "7effd58d4c06"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conversation_status = postgresql.ENUM(
        "regular",
        "archived",
        "deleted",
        name="conversation_status",
        create_type=False,
    )
    conversation_status.create(op.get_bind(), checkfirst=True)

    op.create_table(
        "conversations",
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column(
            "status",
            conversation_status,
            server_default=sa.text("'regular'::conversation_status"),
            nullable=False,
        ),
        sa.Column(
            "state_json",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'{}'::jsonb"),
            nullable=False,
        ),
        sa.Column(
            "active_document_ids",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'[]'::jsonb"),
            nullable=False,
        ),
        sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_conversations_status_updated_at",
        "conversations",
        ["status", "updated_at"],
        unique=False,
    )
    op.create_table(
        "conversation_messages",
        sa.Column("conversation_id", sa.UUID(), nullable=False),
        sa.Column("message_id", sa.String(), nullable=False),
        sa.Column("parent_id", sa.String(), nullable=True),
        sa.Column("sort_index", sa.Integer(), nullable=False),
        sa.Column("message_json", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("run_config_json", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.ForeignKeyConstraint(["conversation_id"], ["conversations.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_conversation_messages_conversation_sort",
        "conversation_messages",
        ["conversation_id", "sort_index"],
        unique=False,
    )
    op.create_index(
        "uq_conversation_messages_conversation_message",
        "conversation_messages",
        ["conversation_id", "message_id"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index(
        "uq_conversation_messages_conversation_message",
        table_name="conversation_messages",
    )
    op.drop_index(
        "ix_conversation_messages_conversation_sort",
        table_name="conversation_messages",
    )
    op.drop_table("conversation_messages")
    op.drop_index("ix_conversations_status_updated_at", table_name="conversations")
    op.drop_table("conversations")
    conversation_status = postgresql.ENUM(
        "regular",
        "archived",
        "deleted",
        name="conversation_status",
    )
    conversation_status.drop(op.get_bind(), checkfirst=True)
