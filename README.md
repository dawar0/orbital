# Orbital — Multi-Document Q&A for Real Estate Lawyers

A ChatGPT-style interface for due diligence on commercial real estate documents. Upload leases, title reports, environmental assessments, and purchase agreements into a single conversation, then ask questions across the whole library and get answers with inline, hoverable citations that jump straight to the source page.

> 📹 **Loom walkthrough:** [https://www.loom.com/share/6456ec6f10124706811c6112ba4bb04d](https://www.loom.com/share/6456ec6f10124706811c6112ba4bb04d)
>
> 🌐 **Demo:** [Orbital](https://orbital-frontend-x2fuhumz2a-as.a.run.app/)
>

---

## What's inside

- **Part 1** — Multi-document conversations: each thread carries an `active_document_ids` library, retrieval spans the whole library, and the viewer switches between documents on demand.
- **Part 2** — Grounded answers with inline citations, retrieval-quality grading, and a viewer that jumps to the cited page (with in-document full-text search).
- **Stack** — FastAPI + LangGraph + Anthropic (reasoning) + Gemini (embeddings) + Supabase (Postgres/pgvector + storage) + Redis/RQ (job queue) on the backend; React 19 + TanStack Start + assistant-ui + shadcn/ui + Tailwind on the frontend.

The deep dive on the agent graph (durable vs turn-scoped state, retrieval lifecycle, status streaming) lives in [backend/README.md](backend/README.md). This file is the orientation + setup + decisions doc.

---

## Setup

### Prerequisites

- Python 3.12+ with [uv](https://docs.astral.sh/uv/)
- [bun](https://bun.sh) for the frontend
- A [Supabase](https://supabase.com) project with the `pgvector` extension enabled
- Redis (for the RQ job queue)
- API keys: Anthropic, Gemini

### Environment

#### `backend/.env`

Copy `backend/.env.example` to `backend/.env` and fill in your values:

| Variable | Description |
|---|---|
| `DATABASE_URL` | Supabase Postgres connection string (Session Mode pooler, port `6543`) |
| `REDIS_URL` | Redis connection (default: `redis://localhost:6379`) |
| `ANTHROPIC_API_KEY` | Anthropic API key for Claude |
| `ANTHROPIC_MODEL` | Model name (e.g. `claude-sonnet-4-6`) |
| `GEMINI_API_KEY` | Google Gemini API key for embeddings |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (server-side operations) |
| `SUPABASE_STORAGE_BUCKET` | Storage bucket name for uploaded documents |
| `SUPABASE_PUBLISHABLE_KEY` | Supabase publishable/anon key |

```bash
DATABASE_URL=postgresql+psycopg://user:password@host:6543/postgres
REDIS_URL=redis://localhost:6379
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-sonnet-4-6
GEMINI_API_KEY=your-gemini-key
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SUPABASE_STORAGE_BUCKET=documents
SUPABASE_PUBLISHABLE_KEY=your-publishable-key
```

#### `frontend/.env`

Copy `frontend/.env.example` to `frontend/.env`:

```bash
VITE_API_BASE_URL=http://127.0.0.1:8000
```

### Backend

```bash
cd backend
uv sync
uv run alembic upgrade head
uv run uvicorn app.main:app --reload
```

The API will be available at `http://localhost:8000`.

### Frontend

```bash
cd frontend
bun install
bun --bun run dev
```

The app will be available at `http://localhost:3000`.

---

## Part 1 — Multi-document conversations

- **Per-conversation library.** `Conversation.active_document_ids` ([backend/app/db/models/conversation.py](backend/app/db/models/conversation.py)) tracks which documents are in scope for the thread. Uploading a new document adds it to the active library; nothing is forgotten.
- **Library-wide retrieval.** The retrieval service embeds the question with Gemini and runs cosine search over `document_chunks` filtered to the active library and the latest successful ingestion of each document — so answers can pull from any combination of uploaded docs in a single turn.
- **Document switcher in the viewer.** The reader panel ([frontend/src/features/chat/components/document-viewer-panel.tsx](frontend/src/features/chat/components/document-viewer-panel.tsx)) follows whichever citation the user is inspecting and lets them flip between documents without leaving the conversation.
- **Composer-driven uploads.** [composer-document-uploader.tsx](frontend/src/features/chat/components/composer-document-uploader.tsx) lives in the prompt area, so adding documents feels like attaching files to a message rather than a separate flow.

---

## Part 2 — Grounded citations with retrieval-quality safeguards

### What I built and why

The single loudest signal in the beta data was **trust**. From the customer feedback alone, four of nine users named hallucination or missing provenance as the dealbreaker:

- _"Confidently wrong is worse than slow."_ — Partner, Firm B
- _"I'd pay double the licence fee if it would just tell me when it's not sure."_ — Partner, Firm A
- _"When the AI tells me it's from section 4.2 of the lease, it's magic. When it doesn't cite anything specific, I have to go find it myself anyway, so what's the point?"_ — Associate, Firm A
- _"It's given me an answer that sounds completely authoritative and is just not in the document. That's terrifying when you're advising a client on a £40M acquisition."_ — Partner, Firm A

The usage CSV reinforces the same direction: short sessions, prompt drop-off after low-quality answers, and re-uploading the same lease into multiple chats — all symptoms of users not trusting that the system has correctly grounded itself in their documents.

So Part 2 is a **citations-first answer surface backed by retrieval-quality safeguards**:

1. **Structured citations on every retrieved chunk** — `DocumentChunkCitation` ([backend/app/schemas/retrieval.py](backend/app/schemas/retrieval.py)) carries `document_id`, `document_title`, `page_number`, `snippet`, and a cosine-similarity `score`.
2. **Anti-hallucination prompting** — `ANSWER_CONTEXT_PROMPT` ([backend/app/agents/chat_agent/prompts.py](backend/app/agents/chat_agent/prompts.py)) forbids citation markers without retrieved context, and the answer prompt is explicit that only retrieved snippets are sources of truth.
3. **Retrieval grading + query rewrite** — `research_documents` ([backend/app/agents/chat_agent/nodes.py](backend/app/agents/chat_agent/nodes.py)) grades whether the retrieved context is relevant to the question; if it isn't, the agent rewrites the query once and retries before answering. Bad retrieval is the root cause of most "confidently wrong" answers, and grading at the retrieval step is cheaper than re-checking at the answer step.
4. **Inline citation chips with hover popovers** — [markdown-text.tsx](frontend/src/components/assistant-ui/markdown-text.tsx) parses `[1]`, `[2]` markers out of the streamed answer and renders them as clickable chips. The popover ([citations.tsx](frontend/src/components/assistant-ui/citations.tsx)) shows the document title, page number, and the actual snippet — so the lawyer can verify the citation at a glance without leaving the answer.
5. **Click-to-verify in the viewer** — clicking a citation chip drives the right-hand reader to the cited document **and the cited page**. This directly addresses the "I'd just go find it myself anyway" objection: the cost of verification is now one click.
6. **In-document full-text search** — the viewer ships a Cmd/Ctrl+F-style search ([document-viewer-panel.tsx](frontend/src/features/chat/components/document-viewer-panel.tsx)) backed by a `/documents/:id/search` endpoint, which addresses the trainee's "I miss being able to ctrl+F within it" feedback for free once the viewer is page-aware.

### Why this over the alternatives

The other strong themes in the feedback were cross-document compare (Firm F), annotation/highlighting (Firm C), and export-to-Word (Firm E). They're all real, but they're **second-order**: they only matter if you trust the answer in the first place. The associate at Firm B already churned because of one fabrication — no amount of export polish would have saved that account. Citations + grading attack the root cause and unlock the rest. As a happy side effect, cross-doc compare comes mostly for free once retrieval spans the whole active library and citations name the source document — the lawyer can ask "what does each document say about indemnification?" and read both citations side-by-side in the same answer.

### What I'd do next

- **Surface a confidence chip on each citation** using the existing `score`, with thresholds calibrated against a small eval set. The data is already on the wire; this is mostly UI plus calibration work.
- **Explicit "I don't know"** when retrieval grading fails twice in a row, instead of falling back to a hedged answer. The Partner at Firm A has explicitly said this is worth paying for.
- **Cross-document compare view** that pulls a named clause (e.g., indemnity, break clauses) from every active document into a side-by-side table — the natural next step from Firm F's request, and a strong wedge into the deal-room workflow.
- **Export-to-Word with citation links preserved** so the working doc the lawyer hands the client stays auditable. Today they're copy-pasting and losing the provenance, which defeats the point.
- **Persistent annotations / highlights** in the viewer, syncing back to the answer ("highlight the bit you used"). Firm C's screenshot workaround is a real signal of latent demand.
- **Hallucination eval harness** — small set of (document, question, ground-truth-citation) triples wired into CI so we can move on confidence chips and prompt changes without regressing the trust story.
- **Model-agnostic agent layer** — abstract Anthropic behind a provider interface so any LLM (OpenAI, local/open-source models, etc.) can be swapped in without changing the agent graph.
- **Pluggable embeddings provider** — decouple Gemini embeddings behind a shared interface to support alternatives (OpenAI embeddings, local sentence transformers, etc.) without re-architecting retrieval.
- **Self-hosted storage** — abstract Supabase storage behind an S3-compatible interface so any object store (MinIO, AWS S3, Cloudflare R2) can replace it, removing the storage vendor lock-in.

---

## Known gaps / time-boxing notes

- The `score` is captured on every citation but not yet rendered as a UI chip — it's the most obvious next half-day of work.
- No automated hallucination eval yet; current confidence in groundedness comes from prompt discipline + retrieval grading, not measurement.
- The "I don't know" path exists implicitly (the answer prompt tells the model to say so) but isn't a first-class state in the graph.
- Document upload runs synchronously in the API path; for large PDFs this should move behind a queue.

