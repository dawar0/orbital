import uuid
from typing import Any
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.db.models.document import DocumentStatus


class DocumentUploadForm(BaseModel):
    title: str
    metadata_json: dict[str, Any] = Field(default_factory=dict)


class DocumentListItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    title: str
    original_filename: str
    mime_type: str
    size_bytes: int
    status: DocumentStatus
    uploaded_at: datetime
    indexed_at: datetime | None = None


class DocumentCreateResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    title: str
    status: DocumentStatus
    uploaded_at: datetime
    ingestion_job_id: uuid.UUID


class DocumentRead(DocumentListItem):
    storage_bucket: str
    storage_object_key: str
    sha256: str
    metadata_json: dict
    download_url: str | None = None
    preview_url: str | None = None
    deleted_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class DocumentListResponse(BaseModel):
    items: list[DocumentListItem]


class DocumentSearchResult(BaseModel):
    chunk_id: uuid.UUID
    document_id: uuid.UUID
    document_title: str | None = None
    document_original_filename: str | None = None
    page_number: int | None = None
    snippet: str


class DocumentSearchResponse(BaseModel):
    query: str
    items: list[DocumentSearchResult]
