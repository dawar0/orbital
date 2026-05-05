import uuid

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Query,
    Response,
    UploadFile,
    status,
)
from loguru import logger
from sqlalchemy.orm import Session

from app.api.helpers.documents import parse_metadata_json, validate_pdf_upload
from app.db.session import get_db
from app.schemas.document import (
    DocumentCreateResponse,
    DocumentListResponse,
    DocumentRead,
    DocumentSearchResponse,
    DocumentUploadForm,
)
from app.services.document_workflows import (
    archive_document,
    create_document_with_ingestion,
)
from app.services.exceptions import (
    DocumentConflictError,
    DocumentServiceError,
    DocumentValidationError,
    StorageServiceError,
)
from app.services.documents import (
    get_document_by_id,
    list_documents,
    search_document_chunks,
    search_documents,
)
from app.services.storage import create_signed_download_url, create_signed_preview_url

router = APIRouter(tags=["documents"])


@router.post(
    "/documents",
    response_model=DocumentCreateResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Upload Document",
    operation_id="uploadDocument",
)
async def upload_document(
    file: UploadFile = File(...),
    title: str = Form(..., min_length=1),
    metadata_json: str | None = Form(default=None),
    db: Session = Depends(get_db),
) -> DocumentCreateResponse:
    logger.info(
        "Received document upload request filename={filename} content_type={content_type}",
        filename=file.filename,
        content_type=file.content_type,
    )
    validate_pdf_upload(file.filename, file.content_type)
    metadata = parse_metadata_json(metadata_json)
    form = DocumentUploadForm(title=title, metadata_json=metadata)

    try:
        document, ingestion_job = create_document_with_ingestion(
            db,
            upload_file_obj=file.file,
            original_filename=file.filename or "upload.bin",
            content_type=file.content_type,
            upload_form=form,
        )
    except DocumentValidationError as exc:
        logger.warning(
            "Rejected invalid upload filename={filename} error={error}",
            filename=file.filename,
            error=str(exc),
        )
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc
    except DocumentConflictError as exc:
        logger.warning(
            "Document upload conflict filename={filename} error={error}",
            filename=file.filename,
            error=str(exc),
        )
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(exc),
        ) from exc
    except DocumentServiceError as exc:
        logger.exception(
            "Document upload failed filename={filename}",
            filename=file.filename,
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(exc),
        ) from exc

    logger.info(
        "Document upload request succeeded document_id={document_id} ingestion_job_id={ingestion_job_id}",
        document_id=document.id,
        ingestion_job_id=ingestion_job.id,
    )
    return DocumentCreateResponse(
        id=document.id,
        title=document.title,
        status=document.status,
        uploaded_at=document.uploaded_at,
        ingestion_job_id=ingestion_job.id,
    )


@router.get(
    "/documents",
    response_model=DocumentListResponse,
    summary="List Documents",
    operation_id="listDocuments",
)
def get_documents(db: Session = Depends(get_db)) -> DocumentListResponse:
    items = list_documents(db)
    logger.info("Listed documents count={count}", count=len(items))
    return DocumentListResponse(items=items)


@router.get(
    "/documents/search",
    response_model=DocumentSearchResponse,
    summary="Search Documents",
    operation_id="searchDocuments",
)
def search_documents_endpoint(
    q: str,
    document_ids: list[uuid.UUID] | None = Query(default=None),
    db: Session = Depends(get_db),
) -> DocumentSearchResponse:
    return DocumentSearchResponse(
        query=q,
        items=search_documents(db, query=q, document_ids=document_ids),
    )


@router.get(
    "/documents/{document_id}",
    response_model=DocumentRead,
    summary="Get Document",
    operation_id="getDocument",
)
def get_document(document_id: uuid.UUID, db: Session = Depends(get_db)) -> DocumentRead:
    document = get_document_by_id(db, document_id, include_deleted=True)
    if document is None:
        logger.warning(
            "Document not found document_id={document_id}",
            document_id=document_id,
        )
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="document not found",
        )
    try:
        download_url = create_signed_download_url(
            bucket=document.storage_bucket,
            object_key=document.storage_object_key,
            download_filename=document.original_filename,
        )
        preview_url = create_signed_preview_url(
            bucket=document.storage_bucket,
            object_key=document.storage_object_key,
        )
    except StorageServiceError as exc:
        logger.exception(
            "Failed to create signed download URL document_id={document_id}",
            document_id=document_id,
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(exc),
        ) from exc

    logger.info("Fetched document document_id={document_id}", document_id=document_id)
    return DocumentRead.model_validate(document).model_copy(
        update={"download_url": download_url, "preview_url": preview_url}
    )


@router.get(
    "/documents/{document_id}/search",
    response_model=DocumentSearchResponse,
    summary="Search Document",
    operation_id="searchDocument",
)
def search_document(
    document_id: uuid.UUID,
    q: str,
    db: Session = Depends(get_db),
) -> DocumentSearchResponse:
    document = get_document_by_id(db, document_id, include_deleted=True)
    if document is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="document not found",
        )
    return DocumentSearchResponse(
        query=q,
        items=search_document_chunks(
            db,
            document_id=document_id,
            query=q,
            include_deleted=True,
        ),
    )


@router.delete(
    "/documents/{document_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete Document",
    operation_id="deleteDocument",
)
def delete_document_by_id(
    document_id: uuid.UUID,
    db: Session = Depends(get_db),
) -> Response:
    try:
        deleted = archive_document(db, document_id)
    except DocumentServiceError as exc:
        logger.exception(
            "Document archive failed document_id={document_id}",
            document_id=document_id,
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(exc),
        ) from exc

    if not deleted:
        logger.warning(
            "Delete requested for missing document document_id={document_id}",
            document_id=document_id,
        )
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="document not found",
        )

    logger.info(
        "Archived document via API document_id={document_id}",
        document_id=document_id,
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)
