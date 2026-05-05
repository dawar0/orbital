from collections.abc import AsyncIterator, Iterator, Sequence
from datetime import UTC, datetime
from typing import Any, cast
import re
import uuid

import anyio
from ag_ui_langgraph.utils import langchain_messages_to_agui, make_json_safe
from langchain_core.messages import AIMessage, BaseMessage
from langchain_core.runnables import RunnableConfig
from langgraph.checkpoint.base import (
    WRITES_IDX_MAP,
    BaseCheckpointSaver,
    Checkpoint,
    CheckpointMetadata,
    CheckpointTuple,
    ChannelVersions,
    get_checkpoint_id,
    get_checkpoint_metadata,
)
from pydantic import BaseModel
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.db.models.conversation import (
    Conversation,
    ConversationMessage,
    ConversationMessageRecordType,
)
from app.db.session import SessionLocal
from app.services.conversations import maybe_generate_conversation_title


PUBLIC_STATE_KEYS = ("citations", "active_document_ids", "status")
DOCUMENT_DIRECTIVE_RE = re.compile(r":document\[[^\]]*]\{name=[^}]*}\s*")


class ConversationMessagesCheckpointSaver(BaseCheckpointSaver[str]):
    """Persist LangGraph checkpoints and visible chat messages in conversation_messages."""

    def get_tuple(self, config: RunnableConfig) -> CheckpointTuple | None:
        thread_id = _thread_uuid(config)
        checkpoint_ns = _checkpoint_ns(config)
        checkpoint_id = get_checkpoint_id(config)
        with SessionLocal() as db:
            row = _get_checkpoint_row(
                db,
                conversation_id=thread_id,
                checkpoint_ns=checkpoint_ns,
                checkpoint_id=checkpoint_id,
            )
            if row is None or row.checkpoint_type is None or row.checkpoint_data is None:
                return None

            checkpoint = self.serde.loads_typed(
                (row.checkpoint_type, row.checkpoint_data)
            )
            checkpoint = _sanitize_checkpoint(checkpoint)
            metadata = (
                self.serde.loads_typed((row.metadata_type, row.metadata_data))
                if row.metadata_type is not None and row.metadata_data is not None
                else {}
            )
            pending_writes = [
                (write.task_id or "", write.write_channel or "", self.serde.loads_typed((write.write_type, write.write_data)))
                for write in _list_checkpoint_writes(
                    db,
                    conversation_id=thread_id,
                    checkpoint_ns=checkpoint_ns,
                    checkpoint_id=row.checkpoint_id or "",
                )
                if write.write_type is not None and write.write_data is not None
            ]

        return CheckpointTuple(
            config=_checkpoint_config(thread_id, checkpoint_ns, row.checkpoint_id),
            checkpoint=checkpoint,
            metadata=metadata,
            pending_writes=pending_writes,
            parent_config=(
                _checkpoint_config(thread_id, checkpoint_ns, row.parent_checkpoint_id)
                if row.parent_checkpoint_id
                else None
            ),
        )

    def list(
        self,
        config: RunnableConfig | None,
        *,
        filter: dict[str, Any] | None = None,
        before: RunnableConfig | None = None,
        limit: int | None = None,
    ) -> Iterator[CheckpointTuple]:
        thread_id = _thread_uuid(config) if config else None
        checkpoint_ns = _checkpoint_ns(config) if config else None
        before_checkpoint_id = get_checkpoint_id(before) if before else None

        with SessionLocal() as db:
            statement = select(ConversationMessage).where(
                ConversationMessage.record_type
                == ConversationMessageRecordType.CHECKPOINT,
                ConversationMessage.checkpoint_id.is_not(None),
            )
            if thread_id is not None:
                statement = statement.where(
                    ConversationMessage.conversation_id == thread_id
                )
            if checkpoint_ns is not None:
                statement = statement.where(
                    ConversationMessage.checkpoint_ns == checkpoint_ns
                )
            if before_checkpoint_id:
                statement = statement.where(
                    ConversationMessage.checkpoint_id < before_checkpoint_id
                )
            statement = statement.order_by(ConversationMessage.checkpoint_id.desc())

            yielded = 0
            for row in db.scalars(statement):
                if limit is not None and yielded >= limit:
                    break
                if (
                    row.checkpoint_type is None
                    or row.checkpoint_data is None
                    or row.checkpoint_id is None
                ):
                    continue

                metadata = (
                    self.serde.loads_typed((row.metadata_type, row.metadata_data))
                    if row.metadata_type is not None and row.metadata_data is not None
                    else {}
                )
                if filter and not all(
                    query_value == metadata.get(query_key)
                    for query_key, query_value in filter.items()
                ):
                    continue

                checkpoint = self.serde.loads_typed(
                    (row.checkpoint_type, row.checkpoint_data)
                )
                checkpoint = _sanitize_checkpoint(checkpoint)
                writes = [
                    (
                        write.task_id or "",
                        write.write_channel or "",
                        self.serde.loads_typed((write.write_type, write.write_data)),
                    )
                    for write in _list_checkpoint_writes(
                        db,
                        conversation_id=row.conversation_id,
                        checkpoint_ns=row.checkpoint_ns or "",
                        checkpoint_id=row.checkpoint_id,
                    )
                    if write.write_type is not None and write.write_data is not None
                ]
                yielded += 1
                yield CheckpointTuple(
                    config=_checkpoint_config(
                        row.conversation_id,
                        row.checkpoint_ns or "",
                        row.checkpoint_id,
                    ),
                    checkpoint=checkpoint,
                    metadata=metadata,
                    pending_writes=writes,
                    parent_config=(
                        _checkpoint_config(
                            row.conversation_id,
                            row.checkpoint_ns or "",
                            row.parent_checkpoint_id,
                        )
                        if row.parent_checkpoint_id
                        else None
                    ),
                )

    def put(
        self,
        config: RunnableConfig,
        checkpoint: Checkpoint,
        metadata: CheckpointMetadata,
        new_versions: ChannelVersions,
    ) -> RunnableConfig:
        del new_versions
        thread_id = _thread_uuid(config)
        checkpoint_ns = _checkpoint_ns(config)
        checkpoint = _sanitize_checkpoint(checkpoint)
        checkpoint_id = str(checkpoint["id"])
        checkpoint_type, checkpoint_data = self.serde.dumps_typed(checkpoint)
        metadata_type, metadata_data = self.serde.dumps_typed(
            get_checkpoint_metadata(config, metadata)
        )

        with SessionLocal() as db:
            row = _get_checkpoint_row(
                db,
                conversation_id=thread_id,
                checkpoint_ns=checkpoint_ns,
                checkpoint_id=checkpoint_id,
            )
            if row is None:
                row = ConversationMessage(
                    conversation_id=thread_id,
                    record_type=ConversationMessageRecordType.CHECKPOINT,
                    checkpoint_ns=checkpoint_ns,
                    checkpoint_id=checkpoint_id,
                )
                db.add(row)

            row.parent_checkpoint_id = config["configurable"].get("checkpoint_id")
            row.checkpoint_type = checkpoint_type
            row.checkpoint_data = checkpoint_data
            row.metadata_type = metadata_type
            row.metadata_data = metadata_data

            _persist_visible_messages(db, thread_id, checkpoint)
            db.commit()

        return _checkpoint_config(thread_id, checkpoint_ns, checkpoint_id)

    def put_writes(
        self,
        config: RunnableConfig,
        writes: Sequence[tuple[str, Any]],
        task_id: str,
        task_path: str = "",
    ) -> None:
        thread_id = _thread_uuid(config)
        checkpoint_ns = _checkpoint_ns(config)
        checkpoint_id = str(config["configurable"]["checkpoint_id"])

        with SessionLocal() as db:
            for index, (channel, value) in enumerate(writes):
                write_index = WRITES_IDX_MAP.get(channel, index)
                row = _get_checkpoint_write_row(
                    db,
                    conversation_id=thread_id,
                    checkpoint_ns=checkpoint_ns,
                    checkpoint_id=checkpoint_id,
                    task_id=task_id,
                    write_index=write_index,
                )
                if row is not None and write_index >= 0:
                    continue

                write_type, write_data = self.serde.dumps_typed(value)
                if row is None:
                    row = ConversationMessage(
                        conversation_id=thread_id,
                        record_type=ConversationMessageRecordType.CHECKPOINT_WRITE,
                        checkpoint_ns=checkpoint_ns,
                        checkpoint_id=checkpoint_id,
                        task_id=task_id,
                        write_index=write_index,
                    )
                    db.add(row)

                row.task_path = task_path
                row.write_channel = channel
                row.write_type = write_type
                row.write_data = write_data
            db.commit()

    def delete_thread(self, thread_id: str) -> None:
        conversation_id = uuid.UUID(thread_id)
        with SessionLocal() as db:
            db.execute(
                delete(ConversationMessage).where(
                    ConversationMessage.conversation_id == conversation_id
                )
            )
            db.commit()

    async def aget_tuple(self, config: RunnableConfig) -> CheckpointTuple | None:
        return await anyio.to_thread.run_sync(self.get_tuple, config)

    async def alist(
        self,
        config: RunnableConfig | None,
        *,
        filter: dict[str, Any] | None = None,
        before: RunnableConfig | None = None,
        limit: int | None = None,
    ) -> AsyncIterator[CheckpointTuple]:
        items = await anyio.to_thread.run_sync(
            lambda: list(
                self.list(config, filter=filter, before=before, limit=limit)
            )
        )
        for item in items:
            yield item

    async def aput(
        self,
        config: RunnableConfig,
        checkpoint: Checkpoint,
        metadata: CheckpointMetadata,
        new_versions: ChannelVersions,
    ) -> RunnableConfig:
        return await anyio.to_thread.run_sync(
            self.put,
            config,
            checkpoint,
            metadata,
            new_versions,
        )

    async def aput_writes(
        self,
        config: RunnableConfig,
        writes: Sequence[tuple[str, Any]],
        task_id: str,
        task_path: str = "",
    ) -> None:
        await anyio.to_thread.run_sync(
            self.put_writes,
            config,
            writes,
            task_id,
            task_path,
        )

    async def adelete_thread(self, thread_id: str) -> None:
        await anyio.to_thread.run_sync(self.delete_thread, thread_id)


def _thread_uuid(config: RunnableConfig | None) -> uuid.UUID:
    if config is None:
        raise ValueError("checkpoint config is required")
    return uuid.UUID(str(config["configurable"]["thread_id"]))


def _checkpoint_ns(config: RunnableConfig | None) -> str:
    if config is None:
        return ""
    return str(config["configurable"].get("checkpoint_ns", ""))


def _checkpoint_config(
    thread_id: uuid.UUID,
    checkpoint_ns: str,
    checkpoint_id: str | None,
) -> RunnableConfig:
    configurable = {
        "thread_id": str(thread_id),
        "checkpoint_ns": checkpoint_ns,
    }
    if checkpoint_id is not None:
        configurable["checkpoint_id"] = checkpoint_id
    return {"configurable": configurable}


def _get_checkpoint_row(
    db: Session,
    *,
    conversation_id: uuid.UUID,
    checkpoint_ns: str,
    checkpoint_id: str | None,
) -> ConversationMessage | None:
    statement = select(ConversationMessage).where(
        ConversationMessage.conversation_id == conversation_id,
        ConversationMessage.record_type == ConversationMessageRecordType.CHECKPOINT,
        ConversationMessage.checkpoint_ns == checkpoint_ns,
    )
    if checkpoint_id is not None:
        statement = statement.where(ConversationMessage.checkpoint_id == checkpoint_id)
    else:
        statement = statement.order_by(ConversationMessage.checkpoint_id.desc())
    return db.scalars(statement).first()


def _get_checkpoint_write_row(
    db: Session,
    *,
    conversation_id: uuid.UUID,
    checkpoint_ns: str,
    checkpoint_id: str,
    task_id: str,
    write_index: int,
) -> ConversationMessage | None:
    return db.scalar(
        select(ConversationMessage).where(
            ConversationMessage.conversation_id == conversation_id,
            ConversationMessage.record_type
            == ConversationMessageRecordType.CHECKPOINT_WRITE,
            ConversationMessage.checkpoint_ns == checkpoint_ns,
            ConversationMessage.checkpoint_id == checkpoint_id,
            ConversationMessage.task_id == task_id,
            ConversationMessage.write_index == write_index,
        )
    )


def _list_checkpoint_writes(
    db: Session,
    *,
    conversation_id: uuid.UUID,
    checkpoint_ns: str,
    checkpoint_id: str,
) -> list[ConversationMessage]:
    return list(
        db.scalars(
            select(ConversationMessage)
            .where(
                ConversationMessage.conversation_id == conversation_id,
                ConversationMessage.record_type
                == ConversationMessageRecordType.CHECKPOINT_WRITE,
                ConversationMessage.checkpoint_ns == checkpoint_ns,
                ConversationMessage.checkpoint_id == checkpoint_id,
            )
            .order_by(ConversationMessage.task_id, ConversationMessage.write_index)
        )
    )


def _persist_visible_messages(
    db: Session,
    conversation_id: uuid.UUID,
    checkpoint: Checkpoint,
) -> None:
    conversation = db.get(Conversation, conversation_id)
    if conversation is None:
        return

    state = checkpoint.get("channel_values", {})
    messages = state.get("messages") if isinstance(state, dict) else None
    if not isinstance(messages, list):
        return

    visible_base_messages = [
        message
        for message in messages
        if isinstance(message, BaseMessage) and _is_visible_langchain_message(message)
    ]
    agui_messages = langchain_messages_to_agui(
        visible_base_messages
    )
    state_snapshot = _public_state_snapshot(state)
    latest_assistant_message_id = _latest_assistant_message_id(visible_base_messages)
    message_jsons = [
        message.model_dump(mode="json", exclude_none=True)
        for message in agui_messages
    ]
    message_ids = [
        str(message_json.get("id") or "")
        for message_json in message_jsons
        if message_json.get("id")
    ]
    existing_rows = {
        row.message_id: row
        for row in db.scalars(
            select(ConversationMessage).where(
                ConversationMessage.conversation_id == conversation_id,
                ConversationMessage.record_type == ConversationMessageRecordType.MESSAGE,
                ConversationMessage.message_id.in_(message_ids),
            )
        )
    }

    for sort_index, message_json in enumerate(message_jsons):
        message_id = str(message_json.get("id") or "")
        if not message_id:
            continue

        row = existing_rows.get(message_id)
        if row is None:
            row = ConversationMessage(
                conversation_id=conversation_id,
                record_type=ConversationMessageRecordType.MESSAGE,
                message_id=message_id,
            )
            db.add(row)

        row.parent_id = (
            str(message_jsons[sort_index - 1].get("id")) if sort_index > 0 else None
        )
        row.sort_index = sort_index
        preserved_state = (
            state_snapshot
            if message_id == latest_assistant_message_id
            else row.state_snapshot
        )
        row.message_json = _message_with_state(message_json, preserved_state)
        row.state_snapshot = preserved_state

    active_document_ids = state.get("active_document_ids")
    if isinstance(active_document_ids, list):
        conversation.active_document_ids = [
            value for value in active_document_ids if isinstance(value, str)
        ]
    conversation.updated_at = datetime.now(UTC)
    maybe_generate_conversation_title(db, conversation)


def _public_state_snapshot(state: dict[str, Any]) -> dict[str, Any] | None:
    snapshot = {
        key: _make_public_json_safe(state[key])
        for key in PUBLIC_STATE_KEYS
        if key in state and state[key] not in (None, [], {})
    }
    return snapshot or None


def _make_public_json_safe(value: Any) -> Any:
    if isinstance(value, BaseModel):
        return value.model_dump(mode="json", exclude_none=True)
    if isinstance(value, list):
        return [_make_public_json_safe(item) for item in value]
    if isinstance(value, tuple):
        return [_make_public_json_safe(item) for item in value]
    if isinstance(value, dict):
        return {key: _make_public_json_safe(item) for key, item in value.items()}
    return make_json_safe(value)


def _latest_assistant_message_id(messages: Sequence[Any]) -> str | None:
    for message in reversed(messages):
        if isinstance(message, AIMessage) and message.id:
            return str(message.id)
    return None


def _sanitize_checkpoint(checkpoint: Checkpoint) -> Checkpoint:
    state = checkpoint.get("channel_values")
    if not isinstance(state, dict):
        return checkpoint

    messages = state.get("messages")
    if not isinstance(messages, list):
        return checkpoint

    sanitized_messages: list[Any] = []
    changed = False
    for message in messages:
        if not isinstance(message, BaseMessage):
            sanitized_messages.append(message)
            continue
        if not _is_visible_langchain_message(message):
            changed = True
            continue
        sanitized_message = _sanitize_langchain_message(message)
        changed = changed or sanitized_message is not message
        sanitized_messages.append(sanitized_message)

    if not changed:
        return checkpoint

    next_checkpoint = dict(checkpoint)
    next_state = dict(state)
    next_state["messages"] = sanitized_messages
    next_checkpoint["channel_values"] = next_state
    return cast(Checkpoint, next_checkpoint)


def _is_visible_langchain_message(message: BaseMessage) -> bool:
    if not isinstance(message, AIMessage):
        return True
    if getattr(message, "tool_calls", None):
        return True
    return bool(_content_text(message.content).strip())


def _content_text(content: Any) -> str:
    if isinstance(content, str):
        return content
    if not isinstance(content, list):
        return ""

    parts: list[str] = []
    for block in content:
        if isinstance(block, str):
            parts.append(block)
        elif isinstance(block, dict):
            text = block.get("text")
            if isinstance(text, str):
                parts.append(text)
    return " ".join(parts)


def _sanitize_langchain_message(message: BaseMessage) -> BaseMessage:
    content = message.content
    if not isinstance(content, str) or ":document[" not in content:
        return message

    next_content = DOCUMENT_DIRECTIVE_RE.sub("", content).lstrip()
    if next_content == content:
        return message
    return message.model_copy(update={"content": next_content})


def _message_with_state(
    message_json: dict[str, Any],
    state_snapshot: dict[str, Any] | None,
) -> dict[str, Any]:
    if state_snapshot is None:
        return message_json

    message_json = dict(message_json)
    metadata = dict(message_json.get("metadata") or {})
    metadata["unstable_state"] = state_snapshot
    message_json["metadata"] = metadata
    return message_json
