from functools import lru_cache

from ag_ui_langgraph import LangGraphAgent
from langgraph.checkpoint.serde.jsonplus import JsonPlusSerializer
from langgraph.graph import END, START, StateGraph

from app.agents.chat_agent.checkpoint import ConversationMessagesCheckpointSaver
from app.agents.chat_agent.constants import (
    CHAT_AGENT_DESCRIPTION,
    CHAT_AGENT_NAME,
)
from app.agents.chat_agent.nodes import (
    answer,
    decide_strategy,
    finalize_turn,
    prepare_turn,
    research_documents,
)
from app.agents.chat_agent.state import (
    ChatAgentOutput,
    ChatAgentState,
    ChatAgentStatus,
    ChatAgentStatusPhase,
)
from app.schemas.retrieval import DocumentChunkCitation


CHECKPOINT_SERDE = JsonPlusSerializer(allowed_msgpack_modules=()).with_msgpack_allowlist(
    [
        ChatAgentStatus,
        ChatAgentStatusPhase,
        DocumentChunkCitation,
    ]
)


@lru_cache
def build_chat_agent_graph():
    workflow = StateGraph(ChatAgentState, output_schema=ChatAgentOutput)
    workflow.add_node("prepare_turn", prepare_turn)
    workflow.add_node("decide_strategy", decide_strategy)
    workflow.add_node("research_documents", research_documents)
    workflow.add_node("answer", answer)
    workflow.add_node("finalize_turn", finalize_turn)

    workflow.add_edge(START, "prepare_turn")
    workflow.add_edge("prepare_turn", "decide_strategy")
    workflow.add_edge("answer", "finalize_turn")
    workflow.add_edge("finalize_turn", END)
    return workflow.compile(
        checkpointer=ConversationMessagesCheckpointSaver(serde=CHECKPOINT_SERDE)
    )


@lru_cache
def get_chat_agent() -> LangGraphAgent:
    return LangGraphAgent(
        name=CHAT_AGENT_NAME,
        description=CHAT_AGENT_DESCRIPTION,
        graph=build_chat_agent_graph(),
    )
