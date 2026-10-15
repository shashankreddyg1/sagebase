# SageBase

A RAG (retrieval-augmented generation) knowledge base starter. Upload documents
(PDF, `.txt`, `.md`), ask questions in plain English, and get answers with
inline citations to the retrieved chunks — plus a mini evals dashboard that
scores answer quality with transparent heuristics.

Built to showcase modern AI full-stack skills: **Next.js 14 + TypeScript +
PostgreSQL + pgvector + OpenAI embeddings & chat**.

## How it works

```
 ┌────────┐   ┌─────────┐   ┌─────────┐   ┌──────────┐
 │ Upload │──▶│ Extract │──▶│ Chunk   │──▶│ Embed    │
 │ PDF /  │   │ text    │   │ ~800 ch │   │ text-    │
 │ txt/md │   │         │   │ 100 ov. │   │ embedding│
 └────────┘   └─────────┘   └─────────┘   │ -3-small │
                                          └────┬─────┘
                                               ▼
 ┌────────┐   ┌──────────┐   ┌──────────┐  ┌──────────┐
 │ Answer │◀──│  Prompt  │◀──│ Retrieve │◀─│ pgvector │
 │ + [1]  │   │ cited    │   │ top-5 by │  │ document │
 │ [2]    │   │ context  │   │ cosine   │  │ _chunks  │
 └────────┘   └──────────┘   └──────────┘  └──────────┘
```

1. **Upload** — drop a PDF, `.txt`, or `.md` file in the Library.
2. **Chunk & embed** — text is split into ~800-character chunks (100-char
   overlap) and embedded with `text-embedding-004` (768 dims, Gemini free tier).
3. **Store** — chunks + vectors land in Postgres via the pgvector extension.
4. **Retrieve** — each question is embedded and matched with cosine similarity
   (`<=>`) against stored chunks; the top 5 become cited sources.
5. **Answer** — an LLM answers using only the retrieved context, with `[1]`,
   `[2]` markers you can click to inspect the exact source chunk.
6. **Evaluate** — the Evals dashboard runs 5 canned Q&A pairs through the same
   pipeline and scores citation coverage + keyword recall (heuristic, demo).

## Demo mode

Without `DATABASE_URL` or `GEMINI_API_KEY` the app runs fully in **demo
mode**: two realistic seed documents live in memory, uploads are kept
ephemerally in memory, retrieval uses keyword-overlap ranking, and answers are
clearly-labeled mock responses. A banner at the top of every page says so.

## Getting started

```bash
npm install

# 1. Copy env and fill in values
cp .env.example .env

# 2. Create the database objects (needs pgvector on the server)
npx prisma migrate deploy

# 3. Run it
npm run dev
```

Open http://localhost:3000. Upload a document in **Library**, then ask about it
in **Chat**. Try the **Evals** page to see the pipeline scored end to end.

Useful scripts:

| Command            | What it does                    |
| ------------------ | ------------------------------- |
| `npm run dev`      | Start the dev server            |
| `npm run build`    | `prisma generate` + production build |
| `npm run typecheck`| `tsc --noEmit`                  |
| `npm run lint`     | `next lint`                     |

## API overview

| Method | Route                        | Description                                              |
| ------ | ---------------------------- | -------------------------------------------------------- |
| POST   | `/api/documents/upload`      | Multipart file upload → extract → chunk → embed → store  |
| GET    | `/api/documents`             | List documents with status + chunk counts                |
| DELETE | `/api/documents/[id]`        | Delete a document (chunks cascade)                       |
| POST   | `/api/chat`                  | `{ question }` → `{ answer, sources[] }`                 |
| GET    | `/api/evals`                 | Canned eval cases + last run results                     |
| POST   | `/api/evals/run`             | Run all eval cases through the pipeline and score them   |

Chat response shape:

```json
{
  "answer": "SageBase chunks text into ~800-character pieces [1]...",
  "sources": [
    {
      "index": 1,
      "documentId": "cm3...",
      "documentName": "handbook.md",
      "chunkIndex": 2,
      "content": "…chunk text…",
      "score": 0.87
    }
  ],
  "demo": false
}
```

## pgvector + Prisma caveats

- Prisma has no `vector` column type, so `document_chunks` is created by the
  SQL migration and accessed only via `$queryRaw` / `$executeRaw`
  (see `src/lib/rag.ts`). The `Document` model itself is a normal Prisma model.
- The migration runs `CREATE EXTENSION IF NOT EXISTS vector` — your Postgres
  user needs permission for that, or enable pgvector in your host's dashboard
  (most managed Postgres providers ship it).
- Retrieval uses an exact cosine scan (`ORDER BY embedding <=> $1 LIMIT 5`).
  Past ~100k chunks, add an ANN index (`ivfflat` / `hnsw`) — see the comment
  in the migration file.
- Embeddings are stored at 768 dims to match `text-embedding-004`. If you
  switch models, recreate the column with the new dimension (see the
  `gemini_768` migration for the pattern).

## Project structure

```
prisma/
  schema.prisma            # Document model (chunks live in raw SQL)
  migrations/…             # pgvector extension + document_chunks table
src/
  app/
    page.tsx               # Home: hero + how-it-works
    library/page.tsx       # Upload dropzone + document list
    chat/page.tsx          # Chat UI with clickable citation chips
    evals/page.tsx         # Evals dashboard
    api/…                  # REST routes (see table above)
  lib/
    chunk.ts               # 800-char / 100-overlap chunking
    pdf.ts                 # PDF text extraction
    embeddings.ts          # text-embedding-004 wrapper (Gemini native API)
    llm.ts                 # cited-answer chat wrapper
    rag.ts                 # pgvector retrieval + shared chat pipeline
    demo.ts                # in-memory demo docs + mock answers
    evals.ts               # canned cases + heuristic scoring
    db.ts                  # lazy Prisma client + env flags
  components/
    Navbar.tsx
```

## Roadmap

- Streaming chat responses (SSE) instead of a single JSON payload
- Per-document and per-collection scoping for retrieval
- Hybrid retrieval (BM25 + vector) and reranking
- Real eval harness (LLM-as-judge) replacing the heuristic scorer
- Auth + multi-user workspaces

## Screenshots

_Add screenshots here once deployed:_

- `docs/screenshots/home.png` — landing page
- `docs/screenshots/library.png` — document library with status badges
- `docs/screenshots/chat.png` — chat with citations + source panel
- `docs/screenshots/evals.png` — evals dashboard
