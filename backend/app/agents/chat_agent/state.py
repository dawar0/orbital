from enum import StrEnum
from typing import Annotated, Literal

from langchain_core.messages import AnyMessage
from langgraph.graph.message import add_messages
from pydantic import BaseModel, ConfigDict, Field

from app.schemas.retrieval import DocumentChunkCitation


class ChatAgentStatusPhase(StrEnum):
    UNDERSTANDING_REQUEST = "understanding_request"
    RESEARCHING_DOCUMENTS = "researching_documents"
    DRAFTING_ANSWER = "drafting_answer"
    COMPLETED = "completed"
    FAILED = "failed"


STATUS_LABELS = {
    ChatAgentStatusPhase.UNDERSTANDING_REQUEST: "Understanding your question...",
    ChatAgentStatusPhase.RESEARCHING_DOCUMENTS: "Researching documents...",
    ChatAgentStatusPhase.DRAFTING_ANSWER: "Drafting answer...",
    ChatAgentStatusPhase.COMPLETED: "Done.",
    ChatAgentStatusPhase.FAILED: "Something went wrong.",
}


class ChatAgentStatus(BaseModel):
    phase: ChatAgentStatusPhase
    label: str
    active: bool


def make_status(
    phase: ChatAgentStatusPhase,
    *,
    active: bool = True,
) -> ChatAgentStatus:
    return ChatAgentStatus(
        phase=phase,
        label=STATUS_LABELS[phase],
        active=active,
    )


class ChatAgentState(BaseModel):
    model_config = ConfigDict(arbitrary_types_allowed=True)

    messages: Annotated[list[AnyMessage], add_messages] = Field(default_factory=list)
    current_question: str = ""
    retrieval_query: str = ""
    retrieval_context: str = ""
    retrieval_citations: list[DocumentChunkCitation] = Field(default_factory=list)
    citations: list[DocumentChunkCitation] = Field(default_factory=list)
    active_document_ids: list[str] = Field(default_factory=list)
    active_document_context: dict[str, list[str]] | None = None
    run_config: dict[str, object] | None = None
    rewrite_count: int = 0
    needs_retrieval: bool = False
    status: ChatAgentStatus = Field(
        default_factory=lambda: make_status(
            ChatAgentStatusPhase.UNDERSTANDING_REQUEST
        )
    )


class ChatAgentOutput(BaseModel):
    citations: list[DocumentChunkCitation] = Field(default_factory=list)
    active_document_ids: list[str] = Field(default_factory=list)
    status: ChatAgentStatus = Field(
        default_factory=lambda: make_status(
            ChatAgentStatusPhase.COMPLETED,
            active=False,
        )
    )


class GradeDocuments(BaseModel):
    binary_score: Literal["yes", "no"]


class RouteTurnDecision(BaseModel):
    needs_retrieval: bool
    retrieval_query: str | None = None
