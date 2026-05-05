from uuid import UUID

from loguru import logger

from app.services.ingestion.pipeline import run_ingestion_pipeline


def ingest_document(document_id: str, ingestion_job_id: str) -> None:
    logger.info(
        "RQ task received ingestion job document_id={document_id} ingestion_job_id={ingestion_job_id}",
        document_id=document_id,
        ingestion_job_id=ingestion_job_id,
    )
    run_ingestion_pipeline(UUID(document_id), UUID(ingestion_job_id))
