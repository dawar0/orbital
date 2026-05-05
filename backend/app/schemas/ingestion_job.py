import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.db.models.ingestion_job import IngestionJobStage, IngestionJobStatus


class IngestionJobRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    document_id: uuid.UUID
    rq_job_id: str | None = None
    status: IngestionJobStatus
    stage: IngestionJobStage
    is_current: bool
    attempt_count: int
    error_message: str | None = None
    embedding_provider: str
    embedding_model: str
    embedding_dimensions: int
    embedding_task_type: str
    chunk_size: int
    chunk_overlap: int
    job_metadata_json: dict
    started_at: datetime | None = None
    finished_at: datetime | None = None
    created_at: datetime
    updated_at: datetime

