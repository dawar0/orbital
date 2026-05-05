from datetime import datetime
from enum import StrEnum
from typing import TYPE_CHECKING
import uuid

from sqlalchemy import DateTime, Enum, ForeignKey, Index, Integer, LargeBinary, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func, text

from app.db.base import Base
from app.db.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.db.models.conversation import ConversationMessage


class ConversationStatus(StrEnum):
    REGULAR = "regular"
    ARCHIVED = "archived"
    DELETED = "deleted"


class ConversationMessageRecordType(StrEnum):
    MESSAGE = "message"
    CHECKPOINT = "checkpoint"
    CHECKPOINT_WRITE = "checkpoint_write"


CONVERSATION_STATUS_ENUM = Enum(
    ConversationStatus,
    name="conversation_status",
    values_callable=lambda enum_cls: [member.value for member in enum_cls],
    validate_strings=True,
)

CONVERSATION_MESSAGE_RECORD_TYPE_ENUM = Enum(
    ConversationMessageRecordType,
    name="conversation_message_record_type",
    values_callable=lambda enum_cls: [member.value for member in enum_cls],
    validate_strings=True,
)


class Conversation(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "conversations"
    __table_args__ = (
        Index("ix_conversations_status_updated_at", "status", "updated_at"),
    )

    title: Mapped[str] = mapped_column(Text, nullable=False, default="New Chat")
    status: Mapped[ConversationStatus] = mapped_column(
        CONVERSATION_STATUS_ENUM,
        nullable=False,
        server_default=text(f"'{ConversationStatus.REGULAR.value}'"),
        default=ConversationStatus.REGULAR,
    )
    active_document_ids: Mapped[list[str]] = mapped_column(
        JSONB,
        nullable=False,
        server_default=text("'[]'::jsonb"),
        default=list,
    )
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    messages: Mapped[list["ConversationMessage"]] = relationship(
        back_populates="conversation",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="ConversationMessage.sort_index",
    )


class ConversationMessage(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "conversation_messages"
    __table_args__ = (
        Index(
            "ix_conversation_messages_conversation_sort",
            "conversation_id",
            "sort_index",
        ),
        Index(
            "ix_conversation_messages_checkpoint_lookup",
            "conversation_id",
            "record_type",
            "checkpoint_ns",
            "checkpoint_id",
        ),
        Index(
            "uq_conversation_messages_conversation_message",
            "conversation_id",
            "message_id",
            unique=True,
        ),
        Index(
            "uq_conversation_checkpoint_write",
            "conversation_id",
            "checkpoint_ns",
            "checkpoint_id",
            "task_id",
            "write_index",
            unique=True,
        ),
    )

    conversation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("conversations.id", ondelete="CASCADE"),
        nullable=False,
    )
    record_type: Mapped[ConversationMessageRecordType] = mapped_column(
        CONVERSATION_MESSAGE_RECORD_TYPE_ENUM,
        nullable=False,
        server_default=text(f"'{ConversationMessageRecordType.MESSAGE.value}'"),
        default=ConversationMessageRecordType.MESSAGE,
    )
    message_id: Mapped[str | None] = mapped_column(String)
    parent_id: Mapped[str | None] = mapped_column(String)
    sort_index: Mapped[int | None] = mapped_column(Integer)
    message_json: Mapped[dict | None] = mapped_column(JSONB)
    run_config_json: Mapped[dict | None] = mapped_column(JSONB)
    state_snapshot: Mapped[dict | None] = mapped_column(JSONB)
    checkpoint_ns: Mapped[str | None] = mapped_column(String)
    checkpoint_id: Mapped[str | None] = mapped_column(String)
    parent_checkpoint_id: Mapped[str | None] = mapped_column(String)
    checkpoint_type: Mapped[str | None] = mapped_column(String)
    checkpoint_data: Mapped[bytes | None] = mapped_column(LargeBinary)
    metadata_type: Mapped[str | None] = mapped_column(String)
    metadata_data: Mapped[bytes | None] = mapped_column(LargeBinary)
    task_id: Mapped[str | None] = mapped_column(String)
    task_path: Mapped[str | None] = mapped_column(String)
    write_index: Mapped[int | None] = mapped_column(Integer)
    write_channel: Mapped[str | None] = mapped_column(String)
    write_type: Mapped[str | None] = mapped_column(String)
    write_data: Mapped[bytes | None] = mapped_column(LargeBinary)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )

    conversation: Mapped[Conversation] = relationship(back_populates="messages")
