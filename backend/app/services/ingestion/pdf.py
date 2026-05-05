from pathlib import Path

from pydantic import BaseModel, ConfigDict
from pypdf import PdfReader

from app.services.exceptions import PDFParseError


class ExtractedPage(BaseModel):
    model_config = ConfigDict(frozen=True)

    page_number: int
    text: str


def extract_pdf_pages(file_path: str | Path) -> list[ExtractedPage]:
    try:
        reader = PdfReader(file_path)
    except Exception as exc:
        raise PDFParseError("failed to parse PDF") from exc

    pages: list[ExtractedPage] = []
    for index, page in enumerate(reader.pages, start=1):
        text = (page.extract_text() or "").strip()
        if not text:
            continue

        pages.append(ExtractedPage(page_number=index, text=text))

    return pages
