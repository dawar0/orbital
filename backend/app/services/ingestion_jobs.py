import uuid
from datetime import UTC, datetime

from loguru import logger
from redis.exceptions import ResponseError
from rq.exceptions import InvalidJobOperation, NoSuchJobError
from rq.job import Job
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.db.models.document import Document, DocumentStatus
from app.db.models.document_chunk import DocumentChunk
from app.db.models.ingestion_job import IngestionJob, IngestionJobStage, IngestionJobStatus
from app.jobs.queues import get_ingestion_queue, get_redis_connection
from app.services.exceptions import EnqueueJobError
from app.services.ingestion.chunking import ChunkPayload
from app.services.ingestion.constants import (
    DEFAULT_EMBEDDING_DIMENSIONS,
    DEFAULT_EMBEDDING_MODEL,
    DEFAULT_EMBEDDING_PROVIDER,
    DEFAULT_EMBEDDING_TASK_TYPE,
    DEFAULT_INGESTION_CHUNK_OVERLAP,
    DEFAULT_INGESTION_CHUNK_SIZE,
)
from app.utils.ids import generate_id_str


def get_ingestion_job_by_id(db: Session, job_id: uuid.UUID) -> IngestionJob | None:
    return db.scalar(select(IngestionJob).where(IngestionJob.id == job_id))


def create_queued_ingestion_job(db: Session, *, document: Document) -> IngestionJob:
    ingestion_job = IngestionJob(
        document_id=document.id,
        rq_job_id=generate_id_str(),
        status=IngestionJobStatus.QUEUED,
        stage=IngestionJobStage.QUEUED,
        is_current=False,
        attempt_count=0,
        embedding_provider=DEFAULT_EMBEDDING_PROVIDER,
        embedding_model=DEFAULT_EMBEDDING_MODEL,
        embedding_dimensions=DEFAULT_EMBEDDING_DIMENSIONS,
        embedding_task_type=DEFAULT_EMBEDDING_TASK_TYPE,
        chunk_size=DEFAULT_INGESTION_CHUNK_SIZE,
        chunk_overlap=DEFAULT_INGESTION_CHUNK_OVERLAP,
        job_metadata_json={},
    )

    document.status = DocumentStatus.PROCESSING
    db.add(ingestion_job)
    db.flush()
    logger.info(
        "Created queued ingestion job document_id={document_id} ingestion_job_id={ingestion_job_id}",
        document_id=document.id,
        ingestion_job_id=ingestion_job.id,
    )
    return ingestion_job


def enqueue_ingestion_job(*, document: Document, ingestion_job: IngestionJob) -> Job:
    from app.jobs.tasks.ingest_document import ingest_document

    try:
        queue = get_ingestion_queue()
        job = queue.enqueue(
            ingest_document,
            str(document.id),
            str(ingestion_job.id),
            job_id=ingestion_job.rq_job_id,
        )
    except Exception as exc:
        raise EnqueueJobError("failed to enqueue ingestion job") from exc

    logger.info(
        "Enqueued ingestion job document_id={document_id} ingestion_job_id={ingestion_job_id} rq_job_id={rq_job_id}",
        document_id=document.id,
        ingestion_job_id=ingestion_job.id,
        rq_job_id=ingestion_job.rq_job_id,
    )
    return job


def delete_enqueued_ingestion_jobs(rq_job_ids: list[str]) -> None:
    connection = get_redis_connection()
    for rq_job_id in rq_job_ids:
        try:
            job = Job.fetch(rq_job_id, connection=connection)
        except NoSuchJobError:
            logger.info("RQ job already missing rq_job_id={rq_job_id}", rq_job_id=rq_job_id)
            continue

        try:
            job.cancel()
        except InvalidJobOperation:
            logger.info(
                "RQ job could not be cancelled rq_job_id={rq_job_id}",
                rq_job_id=rq_job_id,
            )
            pass

        try:
            job.delete()
        except ResponseError:
            logger.info(
                "RQ job could not be deleted rq_job_id={rq_job_id}",
                rq_job_id=rq_job_id,
            )
            pass


def load_document_and_ingestion_job(
    db: Session,
    *,
    document_id: uuid.UUID,
    ingestion_job_id: uuid.UUID,
) -> tuple[Document, IngestionJob]:
    document = db.scalar(select(Document).where(Document.id == document_id))
    ingestion_job = db.scalar(
        select(IngestionJob).where(IngestionJob.id == ingestion_job_id)
    )

    if document is None or ingestion_job is None:
        raise RuntimeError("document or ingestion job not found")

    if ingestion_job.document_id != document.id:
        raise RuntimeError("ingestion job does not belong to document")

    return document, ingestion_job


def mark_ingestion_job_started(
    db: Session,
    *,
    document: Document,
    ingestion_job: IngestionJob,
) -> None:
    ingestion_job.attempt_count += 1
    ingestion_job.error_message = None
    ingestion_job.status = IngestionJobStatus.STARTED
    ingestion_job.stage = IngestionJobStage.EXTRACTING
    ingestion_job.started_at = datetime.now(UTC)
    ingestion_job.finished_at = None
    document.status = DocumentStatus.PROCESSING
    logger.info(
        "Marked ingestion job started document_id={document_id} ingestion_job_id={ingestion_job_id}",
        document_id=document.id,
        ingestion_job_id=ingestion_job.id,
    )


def mark_ingestion_job_stage(
    db: Session,
    *,
    ingestion_job: IngestionJob,
    stage: IngestionJobStage,
) -> None:
    ingestion_job.stage = stage
    logger.info(
        "Marked ingestion job stage ingestion_job_id={ingestion_job_id} stage={stage}",
        ingestion_job_id=ingestion_job.id,
        stage=stage,
    )


def mark_enqueue_failed(
    db: Session,
    *,
    document: Document,
    ingestion_job: IngestionJob,
    error_message: str,
) -> None:
    ingestion_job.status = IngestionJobStatus.FAILED
    ingestion_job.stage = IngestionJobStage.FAILED
    ingestion_job.error_message = error_message
    ingestion_job.finished_at = datetime.now(UTC)
    document.status = DocumentStatus.FAILED
    logger.warning(
        "Marked enqueue failed document_id={document_id} ingestion_job_id={ingestion_job_id} error={error}",
        document_id=document.id,
        ingestion_job_id=ingestion_job.id,
        error=error_message,
    )


def finalize_ingestion_success(
    db: Session,
    *,
    document_id: uuid.UUID,
    ingestion_job_id: uuid.UUID,
    chunk_payloads: list[ChunkPayload],
    embeddings: list[list[float]],
) -> None:
    if len(chunk_payloads) != len(embeddings):
        raise RuntimeError("embedding count did not match chunk count")

    document, ingestion_job = load_document_and_ingestion_job(
        db,
        document_id=document_id,
        ingestion_job_id=ingestion_job_id,
    )
    now = datetime.now(UTC)

    db.execute(
        delete(DocumentChunk).where(DocumentChunk.ingestion_job_id == ingestion_job.id)
    )

    previous_current_jobs = db.scalars(
        select(IngestionJob).where(
            IngestionJob.document_id == document.id,
            IngestionJob.is_current.is_(True),
            IngestionJob.id != ingestion_job.id,
        )
    ).all()

    for previous_job in previous_current_jobs:
        previous_job.is_current = False

    for chunk_payload, embedding in zip(chunk_payloads, embeddings, strict=True):
        db.add(
            DocumentChunk(
                document_id=document.id,
                ingestion_job_id=ingestion_job.id,
                chunk_index=chunk_payload.chunk_index,
                content=chunk_payload.content,
                page_number=chunk_payload.page_number,
                metadata_json=chunk_payload.metadata_json,
                embedding=embedding,
            )
        )

    ingestion_job.status = IngestionJobStatus.SUCCEEDED
    ingestion_job.stage = IngestionJobStage.COMPLETED
    ingestion_job.is_current = True
    ingestion_job.error_message = None
    ingestion_job.finished_at = now
    document.status = DocumentStatus.READY
    document.indexed_at = now
    logger.info(
        "Marked ingestion job succeeded document_id={document_id} ingestion_job_id={ingestion_job_id} chunk_count={chunk_count}",
        document_id=document.id,
        ingestion_job_id=ingestion_job.id,
        chunk_count=len(chunk_payloads),
    )


def mark_ingestion_job_failed(
    db: Session,
    *,
    document_id: uuid.UUID,
    ingestion_job_id: uuid.UUID,
    error_message: str,
) -> None:
    document, ingestion_job = load_document_and_ingestion_job(
        db,
        document_id=document_id,
        ingestion_job_id=ingestion_job_id,
    )

    existing_current_job = db.scalar(
        select(IngestionJob).where(
            IngestionJob.document_id == document.id,
            IngestionJob.is_current.is_(True),
            IngestionJob.status == IngestionJobStatus.SUCCEEDED,
            IngestionJob.id != ingestion_job.id,
        )
    )

    ingestion_job.status = IngestionJobStatus.FAILED
    ingestion_job.stage = IngestionJobStage.FAILED
    ingestion_job.error_message = error_message
    ingestion_job.finished_at = datetime.now(UTC)

    if existing_current_job is None:
        document.status = DocumentStatus.FAILED
    else:
        document.status = DocumentStatus.READY

    logger.warning(
        "Marked ingestion job failed document_id={document_id} ingestion_job_id={ingestion_job_id} fallback_status={fallback_status} error={error}",
        document_id=document.id,
        ingestion_job_id=ingestion_job.id,
        fallback_status=document.status,
        error=error_message,
    )
