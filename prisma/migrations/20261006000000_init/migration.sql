-- SageBase initial migration.
--
-- Creates the `documents` table (mirrors the Prisma schema), enables the
-- pgvector extension, and creates the `document_chunks` table that stores
-- chunk text plus a 1536-dimension embedding (text-embedding-3-small).
--
-- Prisma cannot model the `vector` type, so this table is managed with raw
-- SQL ($queryRaw / $executeRaw) in src/lib/rag.ts rather than the Prisma
-- client. Deleting a document cascades to its chunks.

-- Enable the pgvector extension (needs a database user with CREATE privilege,
-- or ask your Postgres host — most managed providers ship pgvector).
CREATE EXTENSION IF NOT EXISTS vector;

-- Enum + table for documents (matches schema.prisma)
CREATE TYPE "DocumentStatus" AS ENUM ('PROCESSING', 'READY', 'FAILED');

CREATE TABLE "documents" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "status" "DocumentStatus" NOT NULL DEFAULT 'PROCESSING',
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- Chunk store with embeddings. For a starter-scale corpus we query with a
-- sequential scan (ORDER BY embedding <=> $query LIMIT k). When the corpus
-- grows past ~100k chunks, add an ANN index, e.g.:
--   CREATE INDEX ON document_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
-- (ivfflat needs ANALYZE after bulk loads to pick good probes.)
CREATE TABLE "document_chunks" (
  "id" TEXT NOT NULL,
  "document_id" TEXT NOT NULL,
  "chunk_index" INTEGER NOT NULL,
  "content" TEXT NOT NULL,
  "embedding" vector(1536),
  CONSTRAINT "document_chunks_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "document_chunks_document_id_fkey"
    FOREIGN KEY ("document_id") REFERENCES "documents"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "document_chunks_document_id_idx" ON "document_chunks"("document_id");
