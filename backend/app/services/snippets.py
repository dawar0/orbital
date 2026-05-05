import re
import unicodedata


ICON_WORD_RE = re.compile(
    r"(?i)(?:^|\s)/(?:envelope|linkedin(?:-in)?|github|phone|map(?:-marker(?:-alt)?)?|globe|link)\b"
)
BROKEN_ICON_WORD_RE = re.compile(
    r"(?i)\b(?:map\s*marker\s*alt|ap\s*arker\s*alt|envel\s*pe|linkedin\s*in)\b"
)
BROKEN_LINKEDIN_PREFIX_RE = re.compile(r"(?i)(?:^|\s)-in(?=\w)")
SOFT_HYPHEN_RE = re.compile(r"(\w)-\s+(\w)")
WHITESPACE_RE = re.compile(r"\s+")


def format_snippet(content: str, *, max_length: int) -> str:
    snippet = clean_extracted_text(content)
    if len(snippet) <= max_length:
        return snippet

    return f"{snippet[: max_length - 1].rstrip()}…"


def clean_extracted_text(content: str) -> str:
    text = unicodedata.normalize("NFKC", content)
    text = ICON_WORD_RE.sub(" ", text)
    text = SOFT_HYPHEN_RE.sub(r"\1\2", text)
    text = _strip_pdf_artifact_chars(text)
    text = BROKEN_ICON_WORD_RE.sub(" ", text)
    text = BROKEN_LINKEDIN_PREFIX_RE.sub(" ", text)
    text = text.replace("•", " ")
    text = WHITESPACE_RE.sub(" ", text)
    return text.strip(" ,;:-")


def _strip_pdf_artifact_chars(text: str) -> str:
    cleaned: list[str] = []
    for char in text:
        if char in {"\n", "\r", "\t"}:
            cleaned.append(" ")
            continue

        category = unicodedata.category(char)
        if category in {"Cc", "Cf", "Co", "Cs"}:
            continue
        if category == "So":
            cleaned.append(" ")
            continue
        if char in {"¶", "⌢", "♂", "♀", "☏", "☎", "✉", "ὑ"}:
            cleaned.append(" ")
            continue

        cleaned.append(char)

    return "".join(cleaned)
