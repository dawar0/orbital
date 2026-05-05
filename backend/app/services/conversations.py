import uuid
from datetime import UTC, datetime
import re
from typing import Any

from langchain_core.messages import HumanMessage
from loguru import logger
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.agents.chat_agent.prompts import TITLE_GENERATION_PROMPT
from app.db.models.conversation import (
    Conversation,
    ConversationMessage,
    ConversationMessageRecordType,
    ConversationStatus,
)
from app.schemas.conversation import (
    ConversationListItem,
    ConversationMessagePayload,
    ConversationMessageRead,
    ConversationRead,
)
from app.services.chat_models import get_chat_model

DEFAULT_CONVERSATION_TITLE = "New Chat"
MAX_TITLE_LENGTH = 80
DOCUMENT_DIRECTIVE_RE = re.compile(r":document\[[^\]]*]\{name=[^}]*}\s*")


def create_conversation(
    db: Session,
    *,
    title: str | None = None,
    active_document_ids: list[str] | None = None,
) -> Conversation:
    conversation = Conversation(
        title=(title or DEFAULT_CONVERSATION_TITLE).strip(),
        active_document_ids=_dedupe_strings(active_document_ids) if active_document_ids else [],
    )
    db.add(conversation)
    db.commit()
    db.refresh(conversation)
    return conversation


def list_conversations(db: Session) -> list[ConversationListItem]:
    rows = db.execute(
        select(Conversation, func.count(ConversationMessage.id).label("message_count"))
        .outerjoin(
            ConversationMessage,
            (ConversationMessage.conversation_id == Conversation.id)
            & (ConversationMessage.record_type == ConversationMessageRecordType.MESSAGE),
        )
        .where(Conversation.status != ConversationStatus.DELETED)
        .group_by(Conversation.id)
        .order_by(Conversation.updated_at.desc())
    ).all()
    return [
        ConversationListItem(
            id=conversation.id,
            title=conversation.title,
            status=conversation.status,
            active_document_ids=conversation.active_document_ids,
            created_at=conversation.created_at,
            updated_at=conversation.updated_at,
            archived_at=conversation.archived_at,
            message_count=message_count,
        )
        for conversation, message_count in rows
    ]


def get_conversation(db: Session, conversation_id: uuid.UUID) -> Conversation | None:
    return db.scalar(
        select(Conversation)
        .options(selectinload(Conversation.messages))
        .where(
            Conversation.id == conversation_id,
            Conversation.status != ConversationStatus.DELETED,
        )
    )


def read_conversation(conversation: Conversation) -> ConversationRead:
    visible_messages = [
        message
        for message in conversation.messages
        if message.record_type == ConversationMessageRecordType.MESSAGE
        and message.message_id is not None
        and message.sort_index is not None
        and message.message_json is not None
        and _is_visible_message_json(message.message_json)
    ]
    return ConversationRead(
        id=conversation.id,
        title=conversation.title,
        status=conversation.status,
        active_document_ids=conversation.active_document_ids,
        created_at=conversation.created_at,
        updated_at=conversation.updated_at,
        archived_at=conversation.archived_at,
        message_count=len(visible_messages),
        messages=[
            ConversationMessageRead(
                id=message.id,
                message_id=message.message_id or "",
                parent_id=message.parent_id,
                sort_index=message.sort_index or 0,
                message=_sanitize_message_json(message.message_json or {}),
                run_config=message.run_config_json,
                state_snapshot=message.state_snapshot,
                created_at=message.created_at,
            )
            for message in visible_messages
        ],
    )


def update_conversation(
    db: Session,
    conversation: Conversation,
    *,
    title: str | None = None,
    status: ConversationStatus | None = None,
    active_document_ids: list[str] | None = None,
) -> Conversation:
    if title is not None:
        conversation.title = title.strip() or DEFAULT_CONVERSATION_TITLE

    if status is not None:
        conversation.status = status
        conversation.archived_at = (
            datetime.now(UTC) if status == ConversationStatus.ARCHIVED else None
        )
        if status == ConversationStatus.DELETED:
            conversation.deleted_at = datetime.now(UTC)

    if active_document_ids is not None:
        conversation.active_document_ids = _dedupe_strings(active_document_ids)

    db.commit()
    db.refresh(conversation)
    return conversation


def append_conversation_message(
    db: Session,
    conversation: Conversation,
    payload: ConversationMessagePayload,
) -> ConversationMessage:
    raw_message_id = payload.message.get("id")
    message_id = raw_message_id if isinstance(raw_message_id, str) else str(uuid.uuid4())
    sort_index = _next_message_sort_index(db, conversation.id)
    message = ConversationMessage(
        conversation_id=conversation.id,
        record_type=ConversationMessageRecordType.MESSAGE,
        message_id=message_id,
        parent_id=payload.parent_id,
        sort_index=sort_index,
        message_json=payload.message,
        run_config_json=payload.run_config,
        state_snapshot=payload.state_snapshot,
    )
    db.add(message)
    conversation.updated_at = datetime.now(UTC)

    try:
        db.flush()
        maybe_generate_conversation_title(db, conversation)
        db.commit()
    except IntegrityError:
        db.rollback()
        existing = db.scalar(
            select(ConversationMessage).where(
                ConversationMessage.conversation_id == conversation.id,
                ConversationMessage.message_id == message_id,
            )
        )
        if existing is None:
            raise
        return existing

    db.refresh(message)
    return message


def _next_message_sort_index(db: Session, conversation_id: uuid.UUID) -> int:
    value = db.scalar(
        select(func.coalesce(func.max(ConversationMessage.sort_index), -1)).where(
            ConversationMessage.conversation_id == conversation_id,
            ConversationMessage.record_type == ConversationMessageRecordType.MESSAGE,
        )
    )
    return int(value) + 1


def maybe_generate_conversation_title(
    db: Session,
    conversation: Conversation,
) -> None:
    if conversation.title != DEFAULT_CONVERSATION_TITLE:
        return

    messages = _conversation_message_jsons(db, conversation.id)
    if not messages or messages[-1].get("role") != "assistant":
        return

    if len(messages) < 2:
        return

    user_text = ""
    assistant_text = ""
    for msg in reversed(messages):
        role = msg.get("role")
        if role == "assistant" and not assistant_text:
            assistant_text = _message_text(msg).strip()
        elif role == "user" and not user_text:
            user_text = _message_text(msg).strip()
        if user_text and assistant_text:
            break

    if not user_text:
        return

    try:
        prompt = TITLE_GENERATION_PROMPT.format(
            user_message=user_text[:500],
            assistant_message=(assistant_text or "")[:500],
        )
        response = get_chat_model().invoke([HumanMessage(content=prompt)])
        title = _message_text_from_langchain(response).strip()
        if title:
            conversation.title = title[:MAX_TITLE_LENGTH].strip()
            logger.info(
                "Generated conversation title conversation_id={id} title={title}",
                id=conversation.id,
                title=conversation.title,
            )
        else:
            conversation.title = user_text[:MAX_TITLE_LENGTH].strip()
    except Exception:
        logger.exception("Failed to generate conversation title")
        conversation.title = user_text[:MAX_TITLE_LENGTH].strip()


def _conversation_message_jsons(
    db: Session,
    conversation_id: uuid.UUID,
) -> list[dict[str, Any]]:
    rows = db.scalars(
        select(ConversationMessage)
        .where(
            ConversationMessage.conversation_id == conversation_id,
            ConversationMessage.record_type == ConversationMessageRecordType.MESSAGE,
            ConversationMessage.message_json.is_not(None),
        )
        .order_by(ConversationMessage.sort_index)
    ).all()
    return [
        _sanitize_message_json(message.message_json or {})
        for message in rows
        if _is_visible_message_json(message.message_json or {})
    ]


def _message_text(message: dict[str, Any]) -> str:
    content = message.get("content")
    if isinstance(content, str):
        return content
    if not isinstance(content, list):
        return ""

    parts: list[str] = []
    for block in content:
        if isinstance(block, dict) and block.get("type") == "text":
            text = block.get("text")
            if isinstance(text, str):
                parts.append(text)
    return " ".join(parts)


def _is_visible_message_json(message: dict[str, Any]) -> bool:
    role = message.get("role")
    if role != "assistant":
        return True

    status = message.get("status")
    if isinstance(status, dict) and status.get("reason") == "error":
        return False

    if message.get("toolCalls") or message.get("tool_calls"):
        return True

    return bool(_message_text(message).strip())


def _sanitize_message_json(message: dict[str, Any]) -> dict[str, Any]:
    content = message.get("content")
    if not isinstance(content, str) or ":document[" not in content:
        return message

    sanitized_content = DOCUMENT_DIRECTIVE_RE.sub("", content).lstrip()
    if sanitized_content == content:
        return message
    return {**message, "content": sanitized_content}


def _message_text_from_langchain(message: Any) -> str:
    content = message.content
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts: list[str] = []
        for block in content:
            if isinstance(block, str):
                parts.append(block)
            elif isinstance(block, dict) and block.get("type") == "text":
                text = block.get("text")
                if isinstance(text, str):
                    parts.append(text)
        return " ".join(parts)
    return ""


def _dedupe_strings(values: list[str]) -> list[str]:
    seen: set[str] = set()
    deduped: list[str] = []
    for value in values:
        if value in seen:
            continue
        seen.add(value)
        deduped.append(value)
    return deduped
