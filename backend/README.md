# Orbital Backend

## Directory Structure

```
backend/
├── main.py                          # Entry point (re-exports app.main)
├── pyproject.toml                   # Dependencies & scripts (uv)
├── alembic.ini                      # Alembic migration config
├── alembic/
│   ├── env.py                       # Alembic env (imports models for autogenerate)
│   └── versions/                    # Migration scripts
├── .env.example                     # Environment variable template
└── app/
    ├── main.py                      # FastAPI app creation, CORS, router mount
    ├── core/
    │   ├── config.py                # Pydantic Settings (loads from .env)
    │   └── logging.py               # Loguru logging config
    ├── agents/
    │   └── chat_agent/
    │       ├── graph.py             # LangGraph graph definition
    │       ├── nodes.py             # Graph nodes (prepare_turn, research_documents, answer, etc.)
    │       ├── state.py             # Graph state schema (durable + turn-scoped)
    │       ├── prompts.py           # System prompts & answer templates
    │       ├── constants.py         # Chat agent constants
    │       └── checkpoint.py        # Checkpoint/memory configuration
    ├── api/
    │   ├── router.py                # Top-level API router
    │   ├── routes/
    │   │   ├── conversations.py     # Conversation endpoints
    │   │   ├── documents.py         # Document CRUD + upload endpoints
    │   │   └── ingestion_jobs.py    # Ingestion job status endpoints
    │   └── helpers/
    │       └── documents.py         # Document route helpers
    ├── db/
    │   ├── base.py                  # SQLAlchemy declarative base
    │   ├── session.py               # Session factory & get_db dependency
    │   └── models/
    │       ├── mixins.py            # Shared model mixins (timestamps, soft delete)
    │       ├── conversation.py      # Conversation model
    │       ├── document.py          # Document model
    │       ├── document_chunk.py    # DocumentChunk model (pgvector embeddings)
    │       └── ingestion_job.py     # IngestionJob model
    ├── schemas/
    │   ├── conversation.py          # Conversation Pydantic schemas
    │   ├── document.py              # Document Pydantic schemas
    │   ├── ingestion_job.py         # IngestionJob Pydantic schemas
    │   └── retrieval.py             # Citation & retrieval schemas
    ├── services/
    │   ├── conversations.py         # Conversation business logic
    │   ├── documents.py             # Document business logic
    │   ├── document_workflows.py    # Upload → ingest orchestration
    │   ├── ingestion_jobs.py        # Ingestion job management
    │   ├── ingestion/
    │   │   ├── pipeline.py          # End-to-end ingestion pipeline
    │   │   ├── pdf.py               # PDF text extraction (pypdf)
    │   │   ├── chunking.py          # Text splitting into chunks
    │   │   ├── embeddings.py        # Gemini embedding generation
    │   │   └── constants.py         # Ingestion constants
    │   ├── retrieval.py             # Semantic search (Gemini embed + pgvector)
    │   ├── storage.py               # Supabase storage operations
    │   ├── snippets.py              # Snippet extraction utilities
    │   ├── chat_models.py           # Chat model configuration
    │   └── exceptions.py            # Custom exceptions
    ├── jobs/
    │   ├── worker.py                # RQ worker entry point
    │   ├── queues.py                # Queue definitions
    │   └── tasks/
    │       └── ingest_document.py   # Background document ingestion task
    └── utils/
        └── ids.py                   # ID generation utilities (uuid6)
```

## Chat Agent Architecture

The `chat-agent` is a structured LangGraph workflow exposed through the AG-UI endpoint at `/agents/chat-agent`. The frontend (assistant-ui) talks to that endpoint, LangGraph manages the turn flow, Anthropic handles strategy decisions and answer generation, Gemini produces query embeddings for semantic search, and pgvector-backed `document_chunks` provide the searchable document context.

### Request lifecycle

Each chat turn starts with the full conversation history that LangGraph has checkpointed for the current `thread_id`. The graph then creates a fresh set of turn-scoped fields so retrieval work for the current question does not leak into future turns.

The high-level flow is:

1. `prepare_turn`
   Extracts the latest user question, resets turn-scoped retrieval state, and marks the turn as `understanding_request`.
2. `decide_strategy`
   Uses Anthropic structured output to decide whether the question needs document research. If research is needed, it also produces the first retrieval query. This node returns a LangGraph `Command`, which both publishes the next user-visible phase and routes directly to either `research_documents` or `answer`.
3. `research_documents`
   Calls the retrieval service directly. The service embeds the query with Gemini, searches the global document library with pgvector cosine distance, and returns formatted context plus structured citations. If the first pass is weak, this node internally rewrites the query once and retries before continuing.
   Before handing off to answer generation, this node returns a `Command` that updates retrieval state, marks the phase as `drafting_answer`, and routes to `answer`.
4. `answer`
    Uses Anthropic to produce the final answer. This node sees both the full conversation history and the current turn's retrieved context, which lets follow-up questions work while keeping retrieval context out of durable message history.
5. `finalize_turn`
    Clears all turn-scoped retrieval fields, copies the current turn's citations into the public output state, and marks the turn `completed`.

### Durable state vs turn-scoped state

The key design choice is that only conversation messages are durable thread memory. Everything retrieval-specific is treated as working memory for the current turn.

Durable state:

- `messages`

Turn-scoped state:

- `current_question`
- `retrieval_query`
- `retrieval_context`
- `retrieval_citations`
- `rewrite_count`
- `needs_retrieval`
- `status`

Final output state:

- `citations`
- `status`

This separation keeps raw chunk text out of checkpointed chat history. It reduces token bloat on follow-up turns and prevents old retrieval results from accidentally influencing unrelated future questions.

### Retrieval behavior

Retrieval searches across the entire current document library, not a single document. The query is embedded with Gemini using the same vector dimensionality as ingestion, and pgvector ranks matching chunks by cosine distance.

Only chunks from the current successful ingestion for each document are eligible:

- `ingestion_jobs.is_current = true`
- `ingestion_jobs.status = succeeded`
- `documents.deleted_at IS NULL`

The retrieval service returns:

- the final query that was used
- a formatted context block for the answer node
- structured citations for the UI

### Model responsibilities

Anthropic is used for:

- deciding whether research is needed
- evaluating whether retrieved material is good enough
- refining the retrieval query when the first pass is weak
- final answer generation

Gemini is used for:

- query embeddings during retrieval

This keeps generation and retrieval concerns separate while still aligning query embeddings with the vectors already stored during ingestion.

### AG-UI progress updates

The graph exposes a structured `status` object through AG-UI so the frontend can render progress without fake assistant messages or tool transcript text.

The main phases are:

- `understanding_request`
- `researching_documents`
- `drafting_answer`
- `completed`

Each status includes a stable machine-readable phase plus a human-readable label. The frontend can use the label for display and the phase for UI logic.
