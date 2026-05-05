class DocumentServiceError(RuntimeError):
    pass


class DocumentConflictError(DocumentServiceError):
    pass


class DocumentValidationError(DocumentServiceError):
    pass


class StorageServiceError(RuntimeError):
    pass


class StorageConfigurationError(StorageServiceError):
    pass


class StorageUploadError(StorageServiceError):
    pass


class StorageDownloadError(StorageServiceError):
    pass


class StorageDeleteError(StorageServiceError):
    pass


class StorageSignedUrlError(StorageServiceError):
    pass


class QueueServiceError(RuntimeError):
    pass


class EnqueueJobError(QueueServiceError):
    pass


class PDFParseError(RuntimeError):
    pass


class EmptyDocumentError(RuntimeError):
    pass


class RetrievalServiceError(RuntimeError):
    pass


class RetrievalProviderError(RetrievalServiceError):
    pass
