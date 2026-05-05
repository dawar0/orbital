import hashlib
import uuid
from typing import BinaryIO

from loguru import logger
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.models.document import Document
from app.db.models.ingestion_job import IngestionJob
from app.schemas.document import DocumentUploadForm
from app.services.documents import (
    archive_document_record,
    create_document_record,
    get_document_by_id,
)
from app.services.exceptions import (
    DocumentConflictError,
    DocumentServiceError,
    DocumentValidationError,
    EnqueueJobError,
    StorageServiceError,
)
from app.services.ingestion.constants import SUPPORTED_INGESTION_FILE_EXTENSION
from app.services.ingestion_jobs import (
    create_queued_ingestion_job,
    delete_enqueued_ingestion_jobs,
    enqueue_ingestion_job,
    mark_enqueue_failed,
)
from app.services.storage import delete_file, upload_file
from app.utils.ids import generate_id


def create_document_with_ingestion(
    db: Session,
    *,
    upload_file_obj: BinaryIO,
    original_filename: str,
    content_type: str | None,
    upload_form: DocumentUploadForm,
) -> tuple[Document, IngestionJob]:
    document_id = generate_id()
    object_key = f"documents/{document_id}{SUPPORTED_INGESTION_FILE_EXTENSION}"
    mime_type = content_type or "application/octet-stream"
    sha256, size_bytes = _hash_and_measure_upload(upload_file_obj)
    logger.info(
        "Creating document and ingestion job document_id={document_id} filename={filename}",
        document_id=document_id,
        filename=original_filename,
    )

    try:
        upload_file(
            bucket=settings.supabase_storage_bucket,
            object_key=object_key,
            contents=upload_file_obj,
            content_type=mime_type,
        )
    except StorageServiceError as exc:
        logger.exception(
            "Failed to upload document to storage document_id={document_id}",
            document_id=document_id,
        )
        raise DocumentServiceError("failed to upload document to storage") from exc

    try:
        document = create_document_record(
            db,
            document_id=document_id,
            title=upload_form.title,
            original_filename=original_filename,
            storage_bucket=settings.supabase_storage_bucket,
            storage_object_key=object_key,
            mime_type=mime_type,
            size_bytes=size_bytes,
            sha256=sha256,
            metadata_json=upload_form.metadata_json,
        )
        ingestion_job = create_queued_ingestion_job(db, document=document)
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        _delete_storage_object_quietly(
            bucket=settings.supabase_storage_bucket,
            object_key=object_key,
        )
        raise DocumentConflictError("document already exists") from exc
    except Exception as exc:
        db.rollback()
        logger.exception(
            "Failed to create document and ingestion job document_id={document_id}",
            document_id=document_id,
        )
        _delete_storage_object_quietly(
            bucket=settings.supabase_storage_bucket,
            object_key=object_key,
        )
        raise DocumentServiceError("failed to create document and ingestion job after upload") from exc

    try:
        enqueue_ingestion_job(document=document, ingestion_job=ingestion_job)
    except EnqueueJobError as exc:
        logger.exception(
            "Failed to enqueue ingestion job document_id={document_id} ingestion_job_id={ingestion_job_id}",
            document_id=document_id,
            ingestion_job_id=ingestion_job.id,
        )
        mark_enqueue_failed(
            db,
            document=document,
            ingestion_job=ingestion_job,
            error_message=str(exc),
        )
        db.commit()
        raise DocumentServiceError("failed to enqueue ingestion job") from exc

    db.refresh(document)
    db.refresh(ingestion_job)
    logger.info(
        "Document upload flow completed document_id={document_id} ingestion_job_id={ingestion_job_id}",
        document_id=document.id,
        ingestion_job_id=ingestion_job.id,
    )
    return document, ingestion_job


def archive_document(db: Session, document_id: uuid.UUID) -> bool:
    document = get_document_by_id(db, document_id)
    if document is None:
        return False

    logger.info(
        "Archiving document document_id={document_id}",
        document_id=document_id,
    )
    rq_job_ids = [job.rq_job_id for job in document.ingestion_jobs if job.rq_job_id]
    delete_enqueued_ingestion_jobs(rq_job_ids)

    try:
        archive_document_record(db, document=document)
        db.commit()
    except Exception as exc:
        db.rollback()
        logger.exception(
            "Database archive failed document_id={document_id}",
            document_id=document_id,
        )
        raise DocumentServiceError("failed to archive document") from exc

    logger.info(
        "Archived document document_id={document_id}",
        document_id=document_id,
    )
    return True


def _hash_and_measure_upload(upload_file_obj: BinaryIO) -> tuple[str, int]:
    hasher = hashlib.sha256()
    size_bytes = 0
    upload_file_obj.seek(0)
    while chunk := upload_file_obj.read(1024 * 1024):
        hasher.update(chunk)
        size_bytes += len(chunk)

    upload_file_obj.seek(0)
    if size_bytes == 0:
        raise DocumentValidationError("file must not be empty")

    return hasher.hexdigest(), size_bytes


def _delete_storage_object_quietly(*, bucket: str, object_key: str) -> None:
    try:
        delete_file(
            bucket=bucket,
            object_key=object_key,
        )
    except StorageServiceError:
        pass
