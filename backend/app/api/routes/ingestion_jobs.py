import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from loguru import logger
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.schemas.ingestion_job import IngestionJobRead
from app.services.ingestion_jobs import get_ingestion_job_by_id

router = APIRouter(tags=["ingestion-jobs"])


@router.get(
    "/ingestion-jobs/{job_id}",
    response_model=IngestionJobRead,
    summary="Get Ingestion Job",
    operation_id="getIngestionJob",
)
def get_ingestion_job(
    job_id: uuid.UUID,
    db: Session = Depends(get_db),
) -> IngestionJobRead:
    ingestion_job = get_ingestion_job_by_id(db, job_id)
    if ingestion_job is None:
        logger.warning("Ingestion job not found job_id={job_id}", job_id=job_id)
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="ingestion job not found",
        )
    logger.info(
        "Fetched ingestion job job_id={job_id} status={status} stage={stage}",
        job_id=job_id,
        status=ingestion_job.status,
        stage=ingestion_job.stage,
    )
    return IngestionJobRead.model_validate(ingestion_job)
