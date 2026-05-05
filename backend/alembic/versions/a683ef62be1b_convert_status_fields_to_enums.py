"""convert status fields to enums

Revision ID: a683ef62be1b
Revises: 848cc53068c5
Create Date: 2026-04-02 18:51:57.915253

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'a683ef62be1b'
down_revision: Union[str, Sequence[str], None] = '848cc53068c5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    document_status = postgresql.ENUM(
        "uploaded",
        "processing",
        "ready",
        "failed",
        "deleted",
        name="document_status",
    )
    ingestion_job_status = postgresql.ENUM(
        "queued",
        "started",
        "succeeded",
        "failed",
        name="ingestion_job_status",
    )
    ingestion_job_stage = postgresql.ENUM(
        "queued",
        "extracting",
        "chunking",
        "embedding",
        "indexing",
        "completed",
        "failed",
        name="ingestion_job_stage",
    )

    bind = op.get_bind()
    document_status.create(bind, checkfirst=True)
    ingestion_job_status.create(bind, checkfirst=True)
    ingestion_job_stage.create(bind, checkfirst=True)

    op.drop_constraint("ck_documents_status_valid", "documents", type_="check")
    op.drop_constraint(
        "ck_ingestion_jobs_status_valid",
        "ingestion_jobs",
        type_="check",
    )
    op.drop_constraint(
        "ck_ingestion_jobs_stage_valid",
        "ingestion_jobs",
        type_="check",
    )

    op.execute("ALTER TABLE documents ALTER COLUMN status DROP DEFAULT")
    op.execute("ALTER TABLE ingestion_jobs ALTER COLUMN status DROP DEFAULT")
    op.execute("ALTER TABLE ingestion_jobs ALTER COLUMN stage DROP DEFAULT")

    op.alter_column('documents', 'status',
               existing_type=sa.VARCHAR(),
               type_=document_status,
               existing_nullable=False,
               existing_server_default=sa.text("'uploaded'::character varying"),
               postgresql_using="status::document_status")
    op.execute(
        "ALTER TABLE documents ALTER COLUMN status "
        "SET DEFAULT 'uploaded'::document_status"
    )
    op.alter_column('ingestion_jobs', 'status',
               existing_type=sa.VARCHAR(),
               type_=ingestion_job_status,
               existing_nullable=False,
               existing_server_default=sa.text("'queued'::character varying"),
               postgresql_using="status::ingestion_job_status")
    op.execute(
        "ALTER TABLE ingestion_jobs ALTER COLUMN status "
        "SET DEFAULT 'queued'::ingestion_job_status"
    )
    op.alter_column('ingestion_jobs', 'stage',
               existing_type=sa.VARCHAR(),
               type_=ingestion_job_stage,
               existing_nullable=False,
               existing_server_default=sa.text("'queued'::character varying"),
               postgresql_using="stage::ingestion_job_stage")
    op.execute(
        "ALTER TABLE ingestion_jobs ALTER COLUMN stage "
        "SET DEFAULT 'queued'::ingestion_job_stage"
    )


def downgrade() -> None:
    """Downgrade schema."""
    document_status = postgresql.ENUM(
        "uploaded",
        "processing",
        "ready",
        "failed",
        "deleted",
        name="document_status",
    )
    ingestion_job_status = postgresql.ENUM(
        "queued",
        "started",
        "succeeded",
        "failed",
        name="ingestion_job_status",
    )
    ingestion_job_stage = postgresql.ENUM(
        "queued",
        "extracting",
        "chunking",
        "embedding",
        "indexing",
        "completed",
        "failed",
        name="ingestion_job_stage",
    )

    op.execute("ALTER TABLE documents ALTER COLUMN status DROP DEFAULT")
    op.execute("ALTER TABLE ingestion_jobs ALTER COLUMN status DROP DEFAULT")
    op.execute("ALTER TABLE ingestion_jobs ALTER COLUMN stage DROP DEFAULT")

    op.alter_column('ingestion_jobs', 'stage',
               existing_type=ingestion_job_stage,
               type_=sa.VARCHAR(),
               existing_nullable=False,
               postgresql_using="stage::text")
    op.execute(
        "ALTER TABLE ingestion_jobs ALTER COLUMN stage "
        "SET DEFAULT 'queued'::character varying"
    )
    op.alter_column('ingestion_jobs', 'status',
               existing_type=ingestion_job_status,
               type_=sa.VARCHAR(),
               existing_nullable=False,
               postgresql_using="status::text")
    op.execute(
        "ALTER TABLE ingestion_jobs ALTER COLUMN status "
        "SET DEFAULT 'queued'::character varying"
    )
    op.alter_column('documents', 'status',
               existing_type=document_status,
               type_=sa.VARCHAR(),
               existing_nullable=False,
               postgresql_using="status::text")
    op.execute(
        "ALTER TABLE documents ALTER COLUMN status "
        "SET DEFAULT 'uploaded'::character varying"
    )

    op.create_check_constraint(
        "ck_documents_status_valid",
        "documents",
        "status IN ('uploaded', 'processing', 'ready', 'failed', 'deleted')",
    )
    op.create_check_constraint(
        "ck_ingestion_jobs_status_valid",
        "ingestion_jobs",
        "status IN ('queued', 'started', 'succeeded', 'failed')",
    )
    op.create_check_constraint(
        "ck_ingestion_jobs_stage_valid",
        "ingestion_jobs",
        "stage IN ('queued', 'extracting', 'chunking', 'embedding', 'indexing', 'completed', 'failed')",
    )

    bind = op.get_bind()
    ingestion_job_stage.drop(bind, checkfirst=True)
    ingestion_job_status.drop(bind, checkfirst=True)
    document_status.drop(bind, checkfirst=True)
