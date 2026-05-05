import uuid
from datetime import datetime
from enum import StrEnum
from typing import TYPE_CHECKING

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import text

from app.db.base import Base
from app.db.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin
from app.services.ingestion.constants import (
    DEFAULT_EMBEDDING_DIMENSIONS,
)

if TYPE_CHECKING:
    from app.db.models.document import Document
    from app.db.models.document_chunk import DocumentChunk


class IngestionJobStatus(StrEnum):
    QUEUED = "queued"
    STARTED = "started"
    SUCCEEDED = "succeeded"
    FAILED = "failed"


class IngestionJobStage(StrEnum):
    QUEUED = "queued"
    EXTRACTING = "extracting"
    CHUNKING = "chunking"
    EMBEDDING = "embedding"
    INDEXING = "indexing"
    COMPLETED = "completed"
    FAILED = "failed"


INGESTION_JOB_STATUS_VALUES = tuple(status.value for status in IngestionJobStatus)
INGESTION_JOB_STAGE_VALUES = tuple(stage.value for stage in IngestionJobStage)
INGESTION_JOB_STATUS_ENUM = Enum(
    IngestionJobStatus,
    name="ingestion_job_status",
    values_callable=lambda enum_cls: [member.value for member in enum_cls],
    validate_strings=True,
)
INGESTION_JOB_STAGE_ENUM = Enum(
    IngestionJobStage,
    name="ingestion_job_stage",
    values_callable=lambda enum_cls: [member.value for member in enum_cls],
    validate_strings=True,
)


class IngestionJob(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "ingestion_jobs"
    __table_args__ = (
        CheckConstraint(
            "attempt_count >= 0",
            name="ck_ingestion_jobs_attempt_count_non_negative",
        ),
        CheckConstraint(
            f"embedding_dimensions = {DEFAULT_EMBEDDING_DIMENSIONS}",
            name="ck_ingestion_jobs_embedding_dimensions",
        ),
        CheckConstraint("chunk_size > 0", name="ck_ingestion_jobs_chunk_size_positive"),
        CheckConstraint(
            "chunk_overlap >= 0",
            name="ck_ingestion_jobs_chunk_overlap_non_negative",
        ),
        Index(
            "uq_ingestion_jobs_current_per_document",
            "document_id",
            unique=True,
            postgresql_where=text("is_current"),
        ),
        Index(
            "ix_ingestion_jobs_document_id_created_at",
            "document_id",
            text("created_at DESC"),
        ),
    )

    document_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("documents.id", ondelete="CASCADE"),
        nullable=False,
    )
    rq_job_id: Mapped[str | None] = mapped_column(String, unique=True)
    status: Mapped[IngestionJobStatus] = mapped_column(
        INGESTION_JOB_STATUS_ENUM,
        nullable=False,
        server_default=text(f"'{IngestionJobStatus.QUEUED.value}'"),
        default=IngestionJobStatus.QUEUED,
    )
    stage: Mapped[IngestionJobStage] = mapped_column(
        INGESTION_JOB_STAGE_ENUM,
        nullable=False,
        server_default=text(f"'{IngestionJobStage.QUEUED.value}'"),
        default=IngestionJobStage.QUEUED,
    )
    is_current: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        server_default=text("false"),
        default=False,
    )
    attempt_count: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        server_default=text("0"),
        default=0,
    )
    error_message: Mapped[str | None] = mapped_column(Text)
    embedding_provider: Mapped[str] = mapped_column(
        String,
        nullable=False,
    )
    embedding_model: Mapped[str] = mapped_column(
        String,
        nullable=False,
    )
    embedding_dimensions: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
    )
    embedding_task_type: Mapped[str] = mapped_column(
        String,
        nullable=False,
    )
    chunk_size: Mapped[int] = mapped_column(Integer, nullable=False)
    chunk_overlap: Mapped[int] = mapped_column(Integer, nullable=False)
    job_metadata_json: Mapped[dict] = mapped_column(
        JSONB,
        nullable=False,
        server_default=text("'{}'::jsonb"),
        default=dict,
    )
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    document: Mapped["Document"] = relationship(back_populates="ingestion_jobs")
    document_chunks: Mapped[list["DocumentChunk"]] = relationship(
        back_populates="ingestion_job",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
