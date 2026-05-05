from collections.abc import Sequence
import re
import uuid
from typing import Any, Literal, cast

from langchain_core.messages import BaseMessage, HumanMessage, SystemMessage
from langgraph.types import Command
from loguru import logger

from app.agents.chat_agent.constants import (
    CONVERSATION_CONTEXT_MESSAGE_LIMIT,
    DEFAULT_RETRIEVAL_TOP_K,
    MAX_REWRITE_COUNT,
)
from app.agents.chat_agent.prompts import (
    ANSWER_CONTEXT_PROMPT,
    CHAT_AGENT_SYSTEM_PROMPT,
    GRADE_DOCUMENTS_PROMPT,
    REWRITE_QUESTION_PROMPT,
    ROUTE_TURN_PROMPT,
)
from app.db.session import SessionLocal
from app.agents.chat_agent.state import (
    ChatAgentState,
    ChatAgentStatusPhase,
    GradeDocuments,
    RouteTurnDecision,
    make_status,
)
from app.schemas.retrieval import DocumentChunkCitation
from app.services.chat_models import get_chat_model
from app.services.retrieval import retrieve_document_library

DOCUMENT_DIRECTIVE_RE = re.compile(
    r":document\[[^\]\n]{1,1024}\]\{name=([^}\n]{1,1024})\}",
)


def prepare_turn(state: ChatAgentState) -> dict[str, Any]:
    """Start a turn by extracting the latest user question and clearing old working memory."""
    raw_question = _latest_user_question(state.messages)
    mentioned_document_ids = _extract_document_directive_ids(raw_question)
    active_document_ids = _resolve_active_document_ids(
        state.active_document_context,
        state.run_config,
        state.active_document_ids,
        mentioned_document_ids,
    )
    question = _strip_document_directives(raw_question).strip() or raw_question
    logger.info("chat-agent preparing turn question={question}", question=question)
    return {
        "current_question": question,
        "retrieval_query": "",
        "retrieval_context": "",
        "retrieval_citations": [],
        "rewrite_count": 0,
        "needs_retrieval": False,
        "citations": [],
        "active_document_ids": active_document_ids,
        "active_document_context": None,
        "run_config": None,
        "status": make_status(ChatAgentStatusPhase.UNDERSTANDING_REQUEST),
    }


def decide_strategy(
    state: ChatAgentState,
) -> Command[Literal["research_documents", "answer"]]:
    """Decide whether this turn needs document research and, if so, produce the initial query."""
    decision = cast(
        RouteTurnDecision,
        get_chat_model()
        .with_structured_output(RouteTurnDecision)
        .invoke([SystemMessage(content=ROUTE_TURN_PROMPT), *state.messages]),
    )

    needs_retrieval = decision.needs_retrieval
    retrieval_query = (decision.retrieval_query or state.current_question).strip()
    if not needs_retrieval:
        retrieval_query = ""
    elif not retrieval_query:
        retrieval_query = state.current_question

    logger.info(
        "chat-agent decided strategy needs_retrieval={needs_retrieval} retrieval_query={retrieval_query}",
        needs_retrieval=needs_retrieval,
        retrieval_query=retrieval_query,
    )
    return Command(
        update={
            "needs_retrieval": needs_retrieval,
            "retrieval_query": retrieval_query,
            "status": make_status(
                ChatAgentStatusPhase.RESEARCHING_DOCUMENTS
                if needs_retrieval
                else ChatAgentStatusPhase.DRAFTING_ANSWER
            ),
        },
        goto="research_documents" if needs_retrieval else "answer",
    )


def research_documents(state: ChatAgentState) -> Command[Literal["answer"]]:
    """Research the document library, retrying once with a refined query when needed."""
    query = state.retrieval_query.strip() or state.current_question
    rewrite_count = state.rewrite_count
    retrieval_context = ""
    retrieval_citations = []

    while True:
        logger.info(
            "chat-agent researching documents query={query} rewrite_count={rewrite_count}",
            query=query,
            rewrite_count=rewrite_count,
        )
        with SessionLocal() as db:
            retrieval = retrieve_document_library(
                db,
                query,
                limit=DEFAULT_RETRIEVAL_TOP_K,
                document_ids=_valid_uuid_list(state.active_document_ids),
            )
        retrieval_context = retrieval.context
        retrieval_citations = retrieval.citations

        if _retrieval_is_relevant(
            question=state.current_question,
            context=retrieval_context,
        ):
            logger.info(
                "chat-agent accepted retrieval query={query} citation_count={citation_count}",
                query=retrieval.query,
                citation_count=len(retrieval_citations),
            )
            return Command(
                update={
                    "retrieval_query": retrieval.query,
                    "retrieval_context": retrieval_context,
                    "retrieval_citations": retrieval_citations,
                    "rewrite_count": rewrite_count,
                    "status": make_status(ChatAgentStatusPhase.DRAFTING_ANSWER),
                },
                goto="answer",
            )

        if rewrite_count >= MAX_REWRITE_COUNT:
            logger.info(
                "chat-agent proceeding without better retrieval query={query} citation_count={citation_count}",
                query=retrieval.query,
                citation_count=len(retrieval_citations),
            )
            return Command(
                update={
                    "retrieval_query": retrieval.query,
                    "retrieval_context": retrieval_context,
                    "retrieval_citations": retrieval_citations,
                    "rewrite_count": rewrite_count,
                    "status": make_status(ChatAgentStatusPhase.DRAFTING_ANSWER),
                },
                goto="answer",
            )

        query = _rewrite_query(
            question=state.current_question,
            messages=state.messages,
            context=retrieval_context,
        )
        logger.info(
            "chat-agent rewrote retrieval query new_query={query}",
            query=query,
        )
        rewrite_count += 1


def answer(state: ChatAgentState) -> dict[str, Any]:
    """Generate the final answer from conversation history plus this turn's retrieved context."""
    logger.info(
        "chat-agent drafting answer has_retrieval_context={has_retrieval_context} citation_count={citation_count}",
        has_retrieval_context=bool(state.retrieval_context.strip()),
        citation_count=len(state.retrieval_citations),
    )
    context_prompt = ANSWER_CONTEXT_PROMPT.format(
        context=state.retrieval_context.strip()
        or "No retrieved document context was found for this turn."
    )
    response = get_chat_model(streaming=True).invoke(
        [
            SystemMessage(content=f"{CHAT_AGENT_SYSTEM_PROMPT}\n\n{context_prompt}"),
            *state.messages,
        ]
    )
    normalized_response, normalized_citations = _normalize_answer_citations(
        response,
        state.retrieval_citations,
    )
    return {
        "messages": [normalized_response],
        "retrieval_citations": normalized_citations,
    }


def finalize_turn(state: ChatAgentState) -> dict[str, Any]:
    """Publish the final citations and clear ephemeral retrieval data before checkpointing."""
    logger.info(
        "chat-agent finalizing turn citation_count={citation_count}",
        citation_count=len(state.retrieval_citations),
    )
    return {
        "current_question": "",
        "retrieval_query": "",
        "retrieval_context": "",
        "retrieval_citations": [],
        "rewrite_count": 0,
        "needs_retrieval": False,
        "citations": list(state.retrieval_citations),
        "active_document_ids": list(state.active_document_ids),
        "status": make_status(
            ChatAgentStatusPhase.COMPLETED,
            active=False,
        ),
    }


def _retrieval_is_relevant(*, question: str, context: str) -> bool:
    if not context.strip():
        return False

    prompt = GRADE_DOCUMENTS_PROMPT.format(
        question=question,
        context=context,
    )
    grade = cast(
        GradeDocuments,
        get_chat_model()
        .with_structured_output(GradeDocuments)
        .invoke([HumanMessage(content=prompt)]),
    )
    return grade.binary_score == "yes"


def _rewrite_query(
    *,
    question: str,
    messages: Sequence[BaseMessage],
    context: str,
) -> str:
    prompt = REWRITE_QUESTION_PROMPT.format(
        question=question,
        conversation_context=_conversation_context(messages),
        context=context,
    )
    response = get_chat_model().invoke([HumanMessage(content=prompt)])
    return _message_content_to_text(response).strip() or question


def _latest_user_question(messages: Sequence[BaseMessage]) -> str:
    for message in reversed(messages):
        if isinstance(message, HumanMessage):
            return _message_content_to_text(message)

    raise RuntimeError("chat-agent requires at least one user message")


def _conversation_context(messages: Sequence[BaseMessage]) -> str:
    window = list(messages[-CONVERSATION_CONTEXT_MESSAGE_LIMIT:])
    parts: list[str] = []
    for message in window:
        role = "User" if isinstance(message, HumanMessage) else "Assistant"
        content = _message_content_to_text(message)
        if not content:
            continue

        parts.append(f"{role}: {content}")

    return "\n".join(parts)


def _message_content_to_text(message: BaseMessage) -> str:
    if isinstance(message.content, str):
        return message.content

    parts: list[str] = []
    for block in message.content:
        if isinstance(block, str):
            parts.append(block)
            continue

        if isinstance(block, dict) and block.get("type") == "text":
            text = block.get("text")
            if isinstance(text, str):
                parts.append(text)

    return "\n".join(part for part in parts if part).strip()


def _extract_document_directive_ids(text: str) -> list[str]:
    return [
        raw_id
        for raw_id in DOCUMENT_DIRECTIVE_RE.findall(text)
        if _is_valid_uuid(raw_id)
    ]


def _strip_document_directives(text: str) -> str:
    return DOCUMENT_DIRECTIVE_RE.sub("", text)


def _resolve_active_document_ids(
    active_document_context: dict[str, list[str]] | None,
    run_config: dict[str, object] | None,
    checkpoint_document_ids: Sequence[str],
    mentioned_document_ids: Sequence[str],
) -> list[str]:
    run_config_document_ids = _document_ids_from_config(run_config)
    if run_config_document_ids is not None:
        return _merge_document_ids(run_config_document_ids, mentioned_document_ids)

    context_document_ids = _document_ids_from_context(active_document_context)
    base_document_ids = context_document_ids or checkpoint_document_ids
    return _merge_document_ids(base_document_ids, mentioned_document_ids)


def _document_ids_from_config(
    run_config: dict[str, object] | None,
) -> Sequence[object] | None:
    if not isinstance(run_config, dict):
        return None

    document_ids = _document_ids_from_context(run_config)
    if document_ids is not None:
        return document_ids

    custom = run_config.get("custom")
    if isinstance(custom, dict):
        return _document_ids_from_context(custom)

    return None


def _document_ids_from_context(value: object) -> Sequence[object] | None:
    if not isinstance(value, dict):
        return None

    active_document_ids = value.get("active_document_ids")
    if isinstance(active_document_ids, list):
        return active_document_ids

    active_document_context = value.get("active_document_context")
    if not isinstance(active_document_context, dict):
        return None

    context_document_ids = active_document_context.get("active_document_ids")
    return context_document_ids if isinstance(context_document_ids, list) else None


def _merge_document_ids(
    existing: Sequence[object],
    additions: Sequence[object],
) -> list[str]:
    merged: list[str] = []
    seen: set[str] = set()
    for value in [*existing, *additions]:
        normalized_value = str(value)
        if not _is_valid_uuid(normalized_value) or normalized_value in seen:
            continue
        seen.add(normalized_value)
        merged.append(normalized_value)
    return merged


def _valid_uuid_list(values: Sequence[object]) -> list[uuid.UUID]:
    valid: list[uuid.UUID] = []
    for value in values:
        try:
            valid.append(uuid.UUID(str(value)))
        except (TypeError, ValueError):
            continue
    return valid


def _is_valid_uuid(value: object) -> bool:
    try:
        uuid.UUID(str(value))
    except (TypeError, ValueError):
        return False
    return True


def _normalize_answer_citations(
    message: BaseMessage,
    citations: Sequence[DocumentChunkCitation],
) -> tuple[BaseMessage, list[DocumentChunkCitation]]:
    answer_text = _message_content_to_text(message)
    used_source_ids = _ordered_used_source_ids(answer_text)
    if not used_source_ids:
        return message, list(citations)

    citation_by_source_id = {citation.source_id: citation for citation in citations}
    source_id_mapping = {
        source_id: index
        for index, source_id in enumerate(
            [source_id for source_id in used_source_ids if source_id in citation_by_source_id],
            start=1,
        )
    }
    if not source_id_mapping:
        return message, list(citations)

    normalized_citations: list[DocumentChunkCitation] = []
    seen_source_ids: set[int] = set()
    for source_id, normalized_source_id in source_id_mapping.items():
        normalized_citations.append(
            citation_by_source_id[source_id].model_copy(
                update={"source_id": normalized_source_id}
            )
        )
        seen_source_ids.add(source_id)

    next_source_id = len(normalized_citations) + 1
    for citation in citations:
        if citation.source_id in seen_source_ids:
            continue
        normalized_citations.append(
            citation.model_copy(update={"source_id": next_source_id})
        )
        next_source_id += 1

    normalized_message = _replace_citation_markers_in_message(message, source_id_mapping)
    return normalized_message, normalized_citations


def _ordered_used_source_ids(answer_text: str) -> list[int]:
    used_source_ids: list[int] = []
    for match in re.findall(r"\[(\d+)\]", answer_text):
        source_id = int(match)
        if source_id not in used_source_ids:
            used_source_ids.append(source_id)

    return used_source_ids


def _replace_citation_markers_in_message(
    message: BaseMessage,
    source_id_mapping: dict[int, int],
) -> BaseMessage:
    if isinstance(message.content, str):
        return message.model_copy(
            update={"content": _replace_citation_markers_in_text(message.content, source_id_mapping)}
        )

    updated_content: list[str | dict[str, Any]] = []
    for block in message.content:
        if isinstance(block, str):
            updated_content.append(
                _replace_citation_markers_in_text(block, source_id_mapping)
            )
            continue

        if isinstance(block, dict) and block.get("type") == "text":
            updated_block = dict(block)
            text = updated_block.get("text")
            if isinstance(text, str):
                updated_block["text"] = _replace_citation_markers_in_text(
                    text,
                    source_id_mapping,
                )
            updated_content.append(updated_block)
            continue

        updated_content.append(block)

    return message.model_copy(update={"content": updated_content})


def _replace_citation_markers_in_text(
    text: str,
    source_id_mapping: dict[int, int],
) -> str:
    return re.sub(
        r"\[(\d+)\]",
        lambda match: (
            f"[{source_id_mapping[int(match.group(1))]}]"
            if int(match.group(1)) in source_id_mapping
            else match.group(0)
        ),
        text,
    )
