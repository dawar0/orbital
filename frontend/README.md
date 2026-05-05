# Orbital Frontend

Chat interface for multi-document Q&A on commercial real estate documents. Built with React 19, TanStack Start, assistant-ui, and shadcn/ui.

## Setup

### Prerequisites

- [bun](https://bun.sh)

### Environment

Copy `.env.example` to `.env`:

```bash
VITE_API_BASE_URL=http://127.0.0.1:8000
```

### Install & Run

```bash
bun install
bun --bun run dev
```

The app runs at `http://localhost:3000`.

### Other Commands

| Command | Description |
|---|---|
| `bun --bun run build` | Production build |
| `bun --bun run preview` | Preview production build |
| `bun --bun run test` | Run tests (Vitest) |
| `bun --bun run lint` | Lint with Biome |
| `bun --bun run format` | Format with Biome |
| `bun --bun run check` | Lint + format check |
| `bun --bun run openapi:generate` | Generate API client from backend OpenAPI spec |

## Tech Stack

- **Framework:** React 19 + TanStack Start (SPA mode)
- **Routing:** TanStack Router (file-based)
- **AI Chat:** assistant-ui with AG-UI protocol
- **UI Components:** shadcn/ui + Radix UI + Tailwind CSS v4
- **State:** Zustand, React Hook Form + Zod
- **Data Fetching:** TanStack Query, OpenAPI client (`@openapi-qrest/react`)
- **Linting/Formatting:** Biome
