"""conversation messages checkpoint journal

Revision ID: f6b6b7039b2d
Revises: c2b07e1f7d9a
Create Date: 2026-05-04 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "f6b6b7039b2d"
down_revision: Union[str, Sequence[str], None] = "c2b07e1f7d9a"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    record_type = postgresql.ENUM(
        "message",
        "checkpoint",
        "checkpoint_write",
        name="conversation_message_record_type",
        create_type=False,
    )
    record_type.create(op.get_bind(), checkfirst=True)

    op.add_column(
        "conversation_messages",
        sa.Column(
            "record_type",
            record_type,
            server_default=sa.text("'message'::conversation_message_record_type"),
            nullable=False,
        ),
    )
    op.add_column(
        "conversation_messages",
        sa.Column("state_snapshot", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )
    op.add_column("conversation_messages", sa.Column("checkpoint_ns", sa.String(), nullable=True))
    op.add_column("conversation_messages", sa.Column("checkpoint_id", sa.String(), nullable=True))
    op.add_column(
        "conversation_messages",
        sa.Column("parent_checkpoint_id", sa.String(), nullable=True),
    )
    op.add_column("conversation_messages", sa.Column("checkpoint_type", sa.String(), nullable=True))
    op.add_column("conversation_messages", sa.Column("checkpoint_data", sa.LargeBinary(), nullable=True))
    op.add_column("conversation_messages", sa.Column("metadata_type", sa.String(), nullable=True))
    op.add_column("conversation_messages", sa.Column("metadata_data", sa.LargeBinary(), nullable=True))
    op.add_column("conversation_messages", sa.Column("task_id", sa.String(), nullable=True))
    op.add_column("conversation_messages", sa.Column("task_path", sa.String(), nullable=True))
    op.add_column("conversation_messages", sa.Column("write_index", sa.Integer(), nullable=True))
    op.add_column("conversation_messages", sa.Column("write_channel", sa.String(), nullable=True))
    op.add_column("conversation_messages", sa.Column("write_type", sa.String(), nullable=True))
    op.add_column("conversation_messages", sa.Column("write_data", sa.LargeBinary(), nullable=True))

    op.alter_column("conversation_messages", "message_id", nullable=True)
    op.alter_column("conversation_messages", "sort_index", nullable=True)
    op.alter_column("conversation_messages", "message_json", nullable=True)

    op.execute(
        """
        INSERT INTO conversation_messages (
            conversation_id,
            record_type,
            message_id,
            parent_id,
            sort_index,
            message_json,
            run_config_json,
            created_at
        )
        SELECT
            conversations.id,
            'message'::conversation_message_record_type,
            COALESCE(message_item.value->>'id', gen_random_uuid()::text),
            NULL,
            (message_item.ordinality - 1)::integer,
            jsonb_build_object(
                'id', COALESCE(message_item.value->>'id', gen_random_uuid()::text),
                'role', CASE message_item.value->>'type'
                    WHEN 'human' THEN 'user'
                    WHEN 'ai' THEN 'assistant'
                    ELSE COALESCE(message_item.value->>'role', 'user')
                END,
                'content', CASE
                    WHEN jsonb_typeof(message_item.value->'content') = 'string'
                        THEN jsonb_build_array(jsonb_build_object(
                            'type', 'text',
                            'text', message_item.value->>'content'
                        ))
                    ELSE COALESCE(message_item.value->'content', '[]'::jsonb)
                END
            ),
            NULL,
            conversations.updated_at
        FROM conversations
        CROSS JOIN LATERAL jsonb_array_elements(conversations.state_json->'messages')
            WITH ORDINALITY AS message_item(value, ordinality)
        WHERE jsonb_typeof(conversations.state_json->'messages') = 'array'
        ON CONFLICT (conversation_id, message_id) DO NOTHING
        """
    )

    op.create_index(
        "ix_conversation_messages_checkpoint_lookup",
        "conversation_messages",
        ["conversation_id", "record_type", "checkpoint_ns", "checkpoint_id"],
        unique=False,
    )
    op.create_index(
        "uq_conversation_checkpoint_write",
        "conversation_messages",
        ["conversation_id", "checkpoint_ns", "checkpoint_id", "task_id", "write_index"],
        unique=True,
    )
    op.drop_column("conversations", "state_json")


def downgrade() -> None:
    op.add_column(
        "conversations",
        sa.Column(
            "state_json",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'{}'::jsonb"),
            nullable=False,
        ),
    )
    op.drop_index("uq_conversation_checkpoint_write", table_name="conversation_messages")
    op.drop_index(
        "ix_conversation_messages_checkpoint_lookup",
        table_name="conversation_messages",
    )

    op.alter_column("conversation_messages", "message_json", nullable=False)
    op.alter_column("conversation_messages", "sort_index", nullable=False)
    op.alter_column("conversation_messages", "message_id", nullable=False)

    op.drop_column("conversation_messages", "write_data")
    op.drop_column("conversation_messages", "write_type")
    op.drop_column("conversation_messages", "write_channel")
    op.drop_column("conversation_messages", "write_index")
    op.drop_column("conversation_messages", "task_path")
    op.drop_column("conversation_messages", "task_id")
    op.drop_column("conversation_messages", "metadata_data")
    op.drop_column("conversation_messages", "metadata_type")
    op.drop_column("conversation_messages", "checkpoint_data")
    op.drop_column("conversation_messages", "checkpoint_type")
    op.drop_column("conversation_messages", "parent_checkpoint_id")
    op.drop_column("conversation_messages", "checkpoint_id")
    op.drop_column("conversation_messages", "checkpoint_ns")
    op.drop_column("conversation_messages", "state_snapshot")
    op.drop_column("conversation_messages", "record_type")

    record_type = postgresql.ENUM(
        "message",
        "checkpoint",
        "checkpoint_write",
        name="conversation_message_record_type",
    )
    record_type.drop(op.get_bind(), checkfirst=True)
