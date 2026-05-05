from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from ag_ui_langgraph import add_langgraph_fastapi_endpoint
from loguru import logger

from app.agents.chat_agent import get_chat_agent
from app.agents.chat_agent.constants import CHAT_AGENT_PATH
from app.api.router import api_router
from app.core.logging import configure_logging

configure_logging()


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    logger.info("FastAPI application started")
    yield


app = FastAPI(title="Orbital", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(api_router)
add_langgraph_fastapi_endpoint(app, agent=get_chat_agent(), path=CHAT_AGENT_PATH)
