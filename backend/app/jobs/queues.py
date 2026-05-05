from functools import lru_cache

from loguru import logger
from redis import Redis
from rq import Queue

from app.core.config import settings
from app.services.ingestion.constants import INGESTION_QUEUE_NAME


@lru_cache
def get_redis_connection() -> Redis:
    logger.info("Creating Redis connection from configured URL")
    return Redis.from_url(settings.redis_url)


def get_ingestion_queue() -> Queue:
    logger.info("Creating ingestion queue queue={queue}", queue=INGESTION_QUEUE_NAME)
    return Queue(INGESTION_QUEUE_NAME, connection=get_redis_connection())
