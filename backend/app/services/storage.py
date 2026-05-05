from collections.abc import Generator
from contextlib import contextmanager
from functools import lru_cache
from io import BufferedReader, FileIO
from pathlib import Path
from shutil import copyfileobj
from tempfile import NamedTemporaryFile
from typing import Any, BinaryIO, cast
from urllib.error import URLError
from urllib.request import urlopen

from loguru import logger
from supabase import Client, create_client
from storage3.types import URLOptions

from app.core.config import settings
from app.services.exceptions import (
    StorageConfigurationError,
    StorageDeleteError,
    StorageDownloadError,
    StorageSignedUrlError,
    StorageUploadError,
)


SIGNED_DOWNLOAD_URL_TTL_SECONDS = 10 * 60


@lru_cache
def get_storage_client() -> Client:
    if not settings.supabase_url or not settings.supabase_service_role_key:
        raise StorageConfigurationError(
            "Supabase storage is not configured. Set SUPABASE_URL and "
            "SUPABASE_SERVICE_ROLE_KEY."
        )

    return create_client(settings.supabase_url, settings.supabase_service_role_key)


def upload_document(
    *,
    bucket: str,
    object_key: str,
    contents: BinaryIO | bytes | str | Path,
    content_type: str,
) -> None:
    logger.info(
        "Uploading storage object bucket={bucket} object_key={object_key}",
        bucket=bucket,
        object_key=object_key,
    )
    try:
        storage = get_storage_client().storage.from_(bucket)
        upload_source: BufferedReader | FileIO | bytes | str | Path
        if isinstance(contents, bytes | str | Path | BufferedReader | FileIO):
            upload_source = contents
        else:
            upload_source = BufferedReader(cast(Any, contents))
        storage.upload(
            object_key,
            upload_source,
            {"content-type": content_type},
        )
    except Exception as exc:
        raise StorageUploadError("failed to upload storage object") from exc


def download_document(*, bucket: str, object_key: str) -> bytes:
    logger.info(
        "Downloading storage object bucket={bucket} object_key={object_key}",
        bucket=bucket,
        object_key=object_key,
    )
    try:
        storage = get_storage_client().storage.from_(bucket)
        return storage.download(object_key)
    except Exception as exc:
        raise StorageDownloadError("failed to download storage object") from exc


def create_signed_download_url(
    *,
    bucket: str,
    object_key: str,
    expires_in_seconds: int = SIGNED_DOWNLOAD_URL_TTL_SECONDS,
    download_filename: str | None = None,
) -> str:
    logger.info(
        "Creating signed download URL bucket={bucket} object_key={object_key}",
        bucket=bucket,
        object_key=object_key,
    )
    storage = get_storage_client().storage.from_(bucket)
    options: URLOptions = {"download": download_filename or True}

    try:
        response = storage.create_signed_url(object_key, expires_in_seconds, options)
    except Exception as exc:
        raise StorageSignedUrlError("failed to create signed download URL") from exc

    signed_url = response.get("signedURL") or response.get("signedUrl")
    if not signed_url:
        raise StorageSignedUrlError("storage provider did not return a signed URL")

    return signed_url


def create_signed_preview_url(
    *,
    bucket: str,
    object_key: str,
    expires_in_seconds: int = SIGNED_DOWNLOAD_URL_TTL_SECONDS,
) -> str:
    logger.info(
        "Creating signed preview URL bucket={bucket} object_key={object_key}",
        bucket=bucket,
        object_key=object_key,
    )
    storage = get_storage_client().storage.from_(bucket)

    try:
        response = storage.create_signed_url(object_key, expires_in_seconds)
    except Exception as exc:
        raise StorageSignedUrlError("failed to create signed preview URL") from exc

    signed_url = response.get("signedURL") or response.get("signedUrl")
    if not signed_url:
        raise StorageSignedUrlError("storage provider did not return a signed URL")

    return signed_url


def delete_document(*, bucket: str, object_key: str) -> None:
    logger.info(
        "Deleting storage object bucket={bucket} object_key={object_key}",
        bucket=bucket,
        object_key=object_key,
    )
    try:
        storage = get_storage_client().storage.from_(bucket)
        storage.remove([object_key])
    except Exception as exc:
        raise StorageDeleteError("failed to delete storage object") from exc


@contextmanager
def download_document_to_temporary_file(
    *,
    bucket: str,
    object_key: str,
    suffix: str = "",
) -> Generator[Path, None, None]:
    signed_url = create_signed_download_url(
        bucket=bucket,
        object_key=object_key,
    )
    temp_path: Path | None = None

    try:
        with urlopen(signed_url) as response, NamedTemporaryFile(
            suffix=suffix,
            delete=False,
        ) as temp_file:
            copyfileobj(response, temp_file)
            temp_path = Path(temp_file.name)
    except (OSError, URLError) as exc:
        raise StorageDownloadError("failed to stream storage object to temporary file") from exc

    try:
        yield temp_path
    finally:
        if temp_path is not None:
            temp_path.unlink(missing_ok=True)


def document_exists(*, bucket: str, object_key: str) -> bool:
    storage = get_storage_client().storage.from_(bucket)

    try:
        storage.info(object_key)
        return True
    except Exception:
        return False


def upload_file(
    *,
    bucket: str,
    object_key: str,
    contents: BinaryIO | bytes | str | Path,
    content_type: str,
) -> None:
    upload_document(
        bucket=bucket,
        object_key=object_key,
        contents=contents,
        content_type=content_type,
    )


def download_file(*, bucket: str, object_key: str) -> bytes:
    return download_document(bucket=bucket, object_key=object_key)


def delete_file(*, bucket: str, object_key: str) -> None:
    delete_document(bucket=bucket, object_key=object_key)


def file_exists(*, bucket: str, object_key: str) -> bool:
    return document_exists(bucket=bucket, object_key=object_key)
