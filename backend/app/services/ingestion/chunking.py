from typing import Any

from langchain_text_splitters import RecursiveCharacterTextSplitter
from pydantic import BaseModel, ConfigDict, Field

from app.services.ingestion.pdf import ExtractedPage


class ChunkPayload(BaseModel):
    model_config = ConfigDict(frozen=True)

    chunk_index: int
    content: str
    page_number: int | None
    metadata_json: dict[str, Any] = Field(default_factory=dict)


def build_chunks(
    pages: list[ExtractedPage],
    *,
    chunk_size: int,
    chunk_overlap: int,
) -> list[ChunkPayload]:
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
    )

    chunk_index = 0
    chunks: list[ChunkPayload] = []
    for page in pages:
        for chunk_text in splitter.split_text(page.text):
            normalized_chunk = chunk_text.strip()
            if not normalized_chunk:
                continue

            chunks.append(
                ChunkPayload(
                    chunk_index=chunk_index,
                    content=normalized_chunk,
                    page_number=page.page_number,
                )
            )
            chunk_index += 1

    return chunks
