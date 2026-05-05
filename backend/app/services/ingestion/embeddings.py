from functools import lru_cache

from langchain_google_genai import GoogleGenerativeAIEmbeddings
from pydantic import SecretStr

from app.core.config import settings
from app.services.ingestion.constants import (
    DEFAULT_EMBEDDING_BATCH_SIZE,
    DEFAULT_EMBEDDING_DIMENSIONS,
    DEFAULT_EMBEDDING_MODEL,
    DEFAULT_EMBEDDING_TASK_TYPE,
)


@lru_cache
def get_embeddings_client() -> GoogleGenerativeAIEmbeddings:
    return GoogleGenerativeAIEmbeddings(
        google_api_key=SecretStr(settings.gemini_api_key),
        model=DEFAULT_EMBEDDING_MODEL,
        task_type=DEFAULT_EMBEDDING_TASK_TYPE,
        output_dimensionality=DEFAULT_EMBEDDING_DIMENSIONS,
    )


def embed_texts(texts: list[str]) -> list[list[float]]:
    if not texts:
        return []

    client = get_embeddings_client()
    embeddings: list[list[float]] = []
    for offset in range(0, len(texts), DEFAULT_EMBEDDING_BATCH_SIZE):
        batch = texts[offset : offset + DEFAULT_EMBEDDING_BATCH_SIZE]
        embeddings.extend(
            client.embed_documents(
                batch,
                batch_size=len(batch),
                output_dimensionality=DEFAULT_EMBEDDING_DIMENSIONS,
            )
        )

    return embeddings
