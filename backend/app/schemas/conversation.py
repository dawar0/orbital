import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from app.db.models.conversation import ConversationStatus


class ConversationListItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    title: str
    status: ConversationStatus
    active_document_ids: list[str] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime
    archived_at: datetime | None = None
    message_count: int = 0


class ConversationMessagePayload(BaseModel):
    parent_id: str | None = None
    message: dict[str, Any]
    run_config: dict[str, Any] | None = None
    state_snapshot: dict[str, Any] | None = None


class ConversationMessageRead(ConversationMessagePayload):
    id: uuid.UUID
    message_id: str
    sort_index: int
    created_at: datetime


class ConversationRead(ConversationListItem):
    messages: list[ConversationMessageRead] = Field(default_factory=list)


class ConversationListResponse(BaseModel):
    items: list[ConversationListItem]


class ConversationCreate(BaseModel):
    title: str | None = None
    active_document_ids: list[str] | None = None


class ConversationUpdate(BaseModel):
    title: str | None = None
    status: ConversationStatus | None = None
    active_document_ids: list[str] | None = None

