import json
from typing import Any

from fastapi import HTTPException, status

from app.services.ingestion.constants import (
    SUPPORTED_INGESTION_FILE_EXTENSION,
    SUPPORTED_INGESTION_MIME_TYPE,
)


def parse_metadata_json(raw_metadata_json: str | None) -> dict[str, Any]:
    if raw_metadata_json is None or raw_metadata_json.strip() == "":
        return {}

    try:
        parsed = json.loads(raw_metadata_json)
    except json.JSONDecodeError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="metadata_json must be valid JSON",
        ) from exc

    if not isinstance(parsed, dict):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="metadata_json must decode to a JSON object",
        )

    return parsed


def validate_pdf_upload(filename: str | None, content_type: str | None) -> None:
    if filename is None or not filename.lower().endswith(
        SUPPORTED_INGESTION_FILE_EXTENSION
    ):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="file must have a .pdf filename",
        )

    if content_type != SUPPORTED_INGESTION_MIME_TYPE:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="file must have content type application/pdf",
        )
