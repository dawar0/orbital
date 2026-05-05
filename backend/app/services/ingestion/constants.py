DEFAULT_EMBEDDING_PROVIDER = "google"
DEFAULT_EMBEDDING_MODEL = "gemini-embedding-2-preview"
DEFAULT_EMBEDDING_DIMENSIONS = 1536
DEFAULT_EMBEDDING_TASK_TYPE = "RETRIEVAL_DOCUMENT"
DEFAULT_EMBEDDING_BATCH_SIZE = 100
# RecursiveCharacterTextSplitter uses character counts, not model token counts.
# Use larger defaults so ingestion produces fewer, richer chunks by default.
DEFAULT_INGESTION_CHUNK_SIZE = 8_000
DEFAULT_INGESTION_CHUNK_OVERLAP = 1_600
SUPPORTED_INGESTION_MIME_TYPE = "application/pdf"
SUPPORTED_INGESTION_FILE_EXTENSION = ".pdf"
INGESTION_QUEUE_NAME = "ingestion"
