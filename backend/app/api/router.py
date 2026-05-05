from fastapi import APIRouter

from app.api.routes.conversations import router as conversations_router
from app.api.routes.documents import router as documents_router
from app.api.routes.ingestion_jobs import router as ingestion_jobs_router

api_router = APIRouter()
api_router.include_router(conversations_router)
api_router.include_router(documents_router)
api_router.include_router(ingestion_jobs_router)
