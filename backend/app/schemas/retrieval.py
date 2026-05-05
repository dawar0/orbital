import uuid

from pydantic import BaseModel


class DocumentChunkCitation(BaseModel):
    source_id: int
    document_id: uuid.UUID
    chunk_id: uuid.UUID
    document_title: str
    snippet: str
    page_number: int | None = None
    score: float | None = None
