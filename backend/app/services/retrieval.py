from functools import lru_cache
import uuid

from langchain_google_genai import GoogleGenerativeAIEmbeddings
from loguru import logger
from pydantic import BaseModel, ConfigDict, SecretStr
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.models.document import Document
from app.db.models.document_chunk import DocumentChunk
from app.db.models.ingestion_job import IngestionJob, IngestionJobStatus
from app.schemas.retrieval import DocumentChunkCitation
from app.services.exceptions import RetrievalProviderError
from app.services.ingestion.constants import (
    DEFAULT_EMBEDDING_DIMENSIONS,
    DEFAULT_EMBEDDING_MODEL,
)
from app.services.snippets import format_snippet

QUERY_EMBEDDING_TASK_TYPE = "RETRIEVAL_QUERY"
DEFAULT_RETRIEVAL_TOP_K = 8
DEFAULT_CITATION_SNIPPET_LENGTH = 280


class RetrievalResult(BaseModel):
    model_config = ConfigDict(frozen=True)

    citation: DocumentChunkCitation
    content: str


class RetrievalResponse(BaseModel):
    model_config = ConfigDict(frozen=True)

    query: str
    results: list[RetrievalResult]

    @property
    def citations(self) -> list[DocumentChunkCitation]:
        return [result.citation for result in self.results]

    @property
    def context(self) -> str:
        blocks: list[str] = []
        for index, result in enumerate(self.results, start=1):
            citation = result.citation
            page_label = (
                f"Page {citation.page_number}" if citation.page_number is not None else "Page unknown"
            )
            score_label = (
                f"{citation.score:.4f}" if citation.score is not None else "unknown"
            )
            blocks.append(
                "\n".join(
                    [
                        f"[{citation.source_id}] {citation.document_title}",
                        f"{page_label} | Score {score_label}",
                        result.content,
                    ]
                )
            )

        return "\n\n".join(blocks)


@lru_cache
def get_query_embeddings_client() -> GoogleGenerativeAIEmbeddings:
    return GoogleGenerativeAIEmbeddings(
        google_api_key=SecretStr(settings.gemini_api_key),
        model=DEFAULT_EMBEDDING_MODEL,
        task_type=QUERY_EMBEDDING_TASK_TYPE,
        output_dimensionality=DEFAULT_EMBEDDING_DIMENSIONS,
    )


def embed_query_text(query: str) -> list[float]:
    if not query.strip():
        return []

    logger.info("Embedding retrieval query query={query}", query=query)
    try:
        return get_query_embeddings_client().embed_query(
            query,
            task_type=QUERY_EMBEDDING_TASK_TYPE,
            output_dimensionality=DEFAULT_EMBEDDING_DIMENSIONS,
        )
    except Exception as exc:
        raise RetrievalProviderError("failed to embed retrieval query") from exc


def retrieve_document_library(
    db: Session,
    query: str,
    *,
    limit: int = DEFAULT_RETRIEVAL_TOP_K,
    document_ids: list[uuid.UUID] | None = None,
) -> RetrievalResponse:
    if not query.strip():
        return RetrievalResponse(query=query, results=[])

    logger.info("Running document retrieval query={query} limit={limit}", query=query, limit=limit)
    query_embedding = embed_query_text(query)
    if not query_embedding:
        return RetrievalResponse(query=query, results=[])

    response = RetrievalResponse(
        query=query,
        results=_retrieve_document_library(
            db,
            query_embedding=query_embedding,
            limit=limit,
            document_ids=document_ids,
        ),
    )
    logger.info(
        "Completed document retrieval query={query} result_count={result_count}",
        query=query,
        result_count=len(response.results),
    )
    return response


def _retrieve_document_library(
    db: Session,
    *,
    query_embedding: list[float],
    limit: int,
    document_ids: list[uuid.UUID] | None = None,
) -> list[RetrievalResult]:
    distance = DocumentChunk.embedding.cosine_distance(query_embedding)
    statement = (
        select(
            DocumentChunk,
            Document.title.label("document_title"),
            distance.label("distance"),
        )
        .join(IngestionJob, DocumentChunk.ingestion_job_id == IngestionJob.id)
        .join(Document, DocumentChunk.document_id == Document.id)
        .where(
            IngestionJob.is_current.is_(True),
            IngestionJob.status == IngestionJobStatus.SUCCEEDED,
            Document.deleted_at.is_(None),
        )
        .order_by(distance)
        .limit(limit)
    )
    if document_ids:
        statement = statement.where(DocumentChunk.document_id.in_(document_ids))

    results: list[RetrievalResult] = []
    for index, (chunk, document_title, raw_distance) in enumerate(db.execute(statement).all(), start=1):
        distance_value = float(raw_distance)
        score = max(0.0, 1.0 - distance_value)
        results.append(
            RetrievalResult(
                citation=DocumentChunkCitation(
                    source_id=index,
                    document_id=chunk.document_id,
                    chunk_id=chunk.id,
                    document_title=document_title,
                    snippet=_build_snippet(chunk.content),
                    page_number=chunk.page_number,
                    score=score,
                ),
                content=chunk.content,
            )
        )

    return results


def _build_snippet(content: str) -> str:
    return format_snippet(content, max_length=DEFAULT_CITATION_SNIPPET_LENGTH)
