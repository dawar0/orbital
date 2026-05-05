from functools import lru_cache
from typing import Any

from langchain_anthropic import ChatAnthropic
from loguru import logger
from pydantic import SecretStr

from app.core.config import settings


@lru_cache
def get_chat_model(*, streaming: bool = False) -> ChatAnthropic:
    logger.info(
        "Creating Anthropic chat model client model={model} streaming={streaming}",
        model=settings.anthropic_model,
        streaming=streaming,
    )
    kwargs: dict[str, Any] = {
        "model_name": settings.anthropic_model,
        "api_key": SecretStr(settings.anthropic_api_key),
        "temperature": 0,
        "streaming": streaming,
    }
    return ChatAnthropic(**kwargs)
