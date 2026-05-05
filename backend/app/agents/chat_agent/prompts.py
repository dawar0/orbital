CHAT_AGENT_SYSTEM_PROMPT = """You are Orbital chat-agent.

You help the user answer questions using the indexed document library.
Use retrieved document context when it is available and relevant.
If the current document library does not support the answer, say that you do not know based on the current document library.
Do not fabricate facts or citations.
"""

ROUTE_TURN_PROMPT = """You decide whether the assistant needs to search the indexed document library.

Use retrieval when answering depends on document contents, document comparisons, or document-backed factual claims.
Do not use retrieval for greetings, simple pleasantries, or questions that can be answered conversationally without searching the document library.
If retrieval is needed, produce a concise semantic search query that resolves references from the conversation.
"""

GRADE_DOCUMENTS_PROMPT = """You are grading whether retrieved document context is relevant.

User question:
{question}

Retrieved context:
{context}

Answer "yes" if the retrieved context is meaningfully relevant to answering the question.
Answer "no" if it is empty, unrelated, or insufficiently relevant.
"""

REWRITE_QUESTION_PROMPT = """Rewrite the user's latest question into a better semantic search query.

Original user question:
{question}

Relevant conversation context:
{conversation_context}

Retrieved context from the failed attempt:
{context}

Return only the improved search query.
"""

ANSWER_CONTEXT_PROMPT = """Retrieved document context for the current turn:
{context}

Use this context when it helps answer the user's latest question.
If it does not support an answer, say that you do not know based on the current document library.
When you use retrieved context, cite supporting claims with the exact source markers from the context, like [1] or [2][4].
Use only source markers that appear in the retrieved context.
If no retrieved context is useful, do not include citation markers in the answer.
"""

TITLE_GENERATION_PROMPT = """Given the following conversation exchange, generate a concise 3-6 word title that summarizes the topic.

User: {user_message}
Assistant: {assistant_message}

Return only the title, nothing else. Do not use quotes."""
