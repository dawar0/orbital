import uuid
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models.document import Document, DocumentStatus
from app.db.models.document_chunk import DocumentChunk
from app.db.models.ingestion_job import IngestionJob, IngestionJobStatus
from app.schemas.document import DocumentListItem, DocumentSearchResult
from app.services.retrieval import embed_query_text
from app.services.snippets import clean_extracted_text, format_snippet

DEFAULT_SEARCH_SNIPPET_RADIUS = 180
DEFAULT_SEMANTIC_SEARCH_SNIPPET_LENGTH = 280
DEFAULT_DOCUMENT_SEARCH_LIMIT = 20


def create_document_record(
    db: Session,
    *,
    document_id: uuid.UUID,
    title: str,
    original_filename: str,
    storage_bucket: str,
    storage_object_key: str,
    mime_type: str,
    size_bytes: int,
    sha256: str,
    metadata_json: dict,
) -> Document:
    document = Document(
        id=document_id,
        title=title,
        original_filename=original_filename,
        storage_bucket=storage_bucket,
        storage_object_key=storage_object_key,
        mime_type=mime_type,
        size_bytes=size_bytes,
        sha256=sha256,
        status=DocumentStatus.UPLOADED,
        metadata_json=metadata_json,
    )

    db.add(document)
    db.flush()
    return document


def list_documents(db: Session) -> list[DocumentListItem]:
    documents = db.scalars(
        select(Document)
        .where(Document.deleted_at.is_(None))
        .order_by(Document.uploaded_at.desc())
    ).all()
    return [DocumentListItem.model_validate(document) for document in documents]


def get_document_by_id(
    db: Session,
    document_id: uuid.UUID,
    *,
    include_deleted: bool = False,
) -> Document | None:
    statement = select(Document).where(Document.id == document_id)
    if not include_deleted:
        statement = statement.where(Document.deleted_at.is_(None))
    return db.scalar(statement)


def archive_document_record(db: Session, *, document: Document) -> None:
    document.status = DocumentStatus.DELETED
    document.deleted_at = datetime.now(UTC)
    db.flush()


def search_document_chunks(
    db: Session,
    *,
    document_id: uuid.UUID,
    query: str,
    limit: int = DEFAULT_DOCUMENT_SEARCH_LIMIT,
    include_deleted: bool = False,
) -> list[DocumentSearchResult]:
    normalized_query = query.strip()
    if not normalized_query:
        return []

    statement = (
        select(DocumentChunk, Document.title, Document.original_filename)
        .join(IngestionJob, DocumentChunk.ingestion_job_id == IngestionJob.id)
        .join(Document, DocumentChunk.document_id == Document.id)
        .where(
            IngestionJob.is_current.is_(True),
            IngestionJob.status == IngestionJobStatus.SUCCEEDED,
            DocumentChunk.document_id == document_id,
            DocumentChunk.content.ilike(f"%{normalized_query}%"),
        )
        .order_by(
            DocumentChunk.page_number.asc().nulls_last(),
            DocumentChunk.chunk_index.asc(),
        )
        .limit(limit)
    )
    if not include_deleted:
        statement = statement.where(Document.deleted_at.is_(None))

    return [
        DocumentSearchResult(
            chunk_id=chunk.id,
            document_id=chunk.document_id,
            document_title=document_title,
            document_original_filename=document_original_filename,
            page_number=chunk.page_number,
            snippet=_build_literal_search_snippet(chunk.content, normalized_query),
        )
        for chunk, document_title, document_original_filename in db.execute(statement).all()
    ]


def search_documents(
    db: Session,
    *,
    query: str,
    document_ids: list[uuid.UUID] | None = None,
    limit: int = DEFAULT_DOCUMENT_SEARCH_LIMIT,
) -> list[DocumentSearchResult]:
    normalized_query = query.strip()
    if not normalized_query:
        return []
    if document_ids is not None and not document_ids:
        return []

    query_embedding = embed_query_text(normalized_query)
    if not query_embedding:
        return []

    distance = DocumentChunk.embedding.cosine_distance(query_embedding)
    statement = (
        select(
            DocumentChunk,
            Document.title,
            Document.original_filename,
        )
        .join(IngestionJob, DocumentChunk.ingestion_job_id == IngestionJob.id)
        .join(Document, DocumentChunk.document_id == Document.id)
        .where(
            Document.deleted_at.is_(None),
            IngestionJob.is_current.is_(True),
            IngestionJob.status == IngestionJobStatus.SUCCEEDED,
        )
        .order_by(distance)
        .limit(limit)
    )

    if document_ids is not None:
        statement = statement.where(DocumentChunk.document_id.in_(document_ids))

    return [
        DocumentSearchResult(
            chunk_id=chunk.id,
            document_id=chunk.document_id,
            document_title=document_title,
            document_original_filename=document_original_filename,
            page_number=chunk.page_number,
            snippet=_build_semantic_search_snippet(chunk.content),
        )
        for chunk, document_title, document_original_filename in db.execute(statement).all()
    ]


def _build_semantic_search_snippet(content: str) -> str:
    return format_snippet(content, max_length=DEFAULT_SEMANTIC_SEARCH_SNIPPET_LENGTH)


def _build_literal_search_snippet(content: str, query: str) -> str:
    cleaned_content = clean_extracted_text(content)
    content_lower = cleaned_content.lower()
    query_lower = query.lower()
    index = content_lower.find(query_lower)
    if index < 0:
        return cleaned_content[: DEFAULT_SEARCH_SNIPPET_RADIUS * 2].strip()

    start = max(0, index - DEFAULT_SEARCH_SNIPPET_RADIUS)
    end = min(len(cleaned_content), index + len(query) + DEFAULT_SEARCH_SNIPPET_RADIUS)
    prefix = "..." if start > 0 else ""
    suffix = "..." if end < len(cleaned_content) else ""
    return f"{prefix}{cleaned_content[start:end].strip()}{suffix}"
