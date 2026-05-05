import uuid

from loguru import logger

from app.db.models.ingestion_job import IngestionJobStage
from app.db.session import SessionLocal
from app.services.exceptions import EmptyDocumentError
from app.services.ingestion.chunking import build_chunks
from app.services.ingestion.embeddings import embed_texts
from app.services.ingestion.pdf import extract_pdf_pages
from app.services.ingestion_jobs import (
    finalize_ingestion_success,
    load_document_and_ingestion_job,
    mark_ingestion_job_failed,
    mark_ingestion_job_stage,
    mark_ingestion_job_started,
)
from app.services.ingestion.constants import DEFAULT_EMBEDDING_DIMENSIONS
from app.services.storage import download_document_to_temporary_file


def run_ingestion_pipeline(document_id: uuid.UUID, ingestion_job_id: uuid.UUID) -> None:
    try:
        logger.info(
            "Starting ingestion pipeline document_id={document_id} ingestion_job_id={ingestion_job_id}",
            document_id=document_id,
            ingestion_job_id=ingestion_job_id,
        )
        with SessionLocal() as db:
            document, ingestion_job = load_document_and_ingestion_job(
                db,
                document_id=document_id,
                ingestion_job_id=ingestion_job_id,
            )

            mark_ingestion_job_started(
                db,
                document=document,
                ingestion_job=ingestion_job,
            )
            db.commit()

            with download_document_to_temporary_file(
                bucket=document.storage_bucket,
                object_key=document.storage_object_key,
                suffix=".pdf",
            ) as pdf_path:
                extracted_pages = extract_pdf_pages(pdf_path)
            if not extracted_pages:
                raise EmptyDocumentError("PDF did not contain any extractable text")
            logger.info(
                "Extracted PDF pages document_id={document_id} ingestion_job_id={ingestion_job_id} page_count={page_count}",
                document_id=document_id,
                ingestion_job_id=ingestion_job_id,
                page_count=len(extracted_pages),
            )

            mark_ingestion_job_stage(
                db,
                ingestion_job=ingestion_job,
                stage=IngestionJobStage.CHUNKING,
            )
            db.commit()
            chunk_payloads = build_chunks(
                extracted_pages,
                chunk_size=ingestion_job.chunk_size,
                chunk_overlap=ingestion_job.chunk_overlap,
            )
            if not chunk_payloads:
                raise EmptyDocumentError("PDF did not produce any chunks")
            logger.info(
                "Built document chunks document_id={document_id} ingestion_job_id={ingestion_job_id} chunk_count={chunk_count}",
                document_id=document_id,
                ingestion_job_id=ingestion_job_id,
                chunk_count=len(chunk_payloads),
            )

            mark_ingestion_job_stage(
                db,
                ingestion_job=ingestion_job,
                stage=IngestionJobStage.EMBEDDING,
            )
            db.commit()
            embeddings = embed_texts([chunk.content for chunk in chunk_payloads])
            for embedding in embeddings:
                if len(embedding) != DEFAULT_EMBEDDING_DIMENSIONS:
                    raise RuntimeError("embedding dimension mismatch")
            logger.info(
                "Generated embeddings document_id={document_id} ingestion_job_id={ingestion_job_id} embedding_count={embedding_count}",
                document_id=document_id,
                ingestion_job_id=ingestion_job_id,
                embedding_count=len(embeddings),
            )

            mark_ingestion_job_stage(
                db,
                ingestion_job=ingestion_job,
                stage=IngestionJobStage.INDEXING,
            )
            db.commit()
            finalize_ingestion_success(
                db,
                document_id=document_id,
                ingestion_job_id=ingestion_job_id,
                chunk_payloads=chunk_payloads,
                embeddings=embeddings,
            )
            db.commit()
            logger.info(
                "Completed ingestion pipeline document_id={document_id} ingestion_job_id={ingestion_job_id}",
                document_id=document_id,
                ingestion_job_id=ingestion_job_id,
            )
    except Exception as exc:
        logger.exception(
            "Ingestion pipeline failed document_id={document_id} ingestion_job_id={ingestion_job_id}",
            document_id=document_id,
            ingestion_job_id=ingestion_job_id,
        )
        with SessionLocal() as db:
            mark_ingestion_job_failed(
                db,
                document_id=document_id,
                ingestion_job_id=ingestion_job_id,
                error_message=str(exc),
            )
            db.commit()
        raise
