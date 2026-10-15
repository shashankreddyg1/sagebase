-- Switch the AI provider from OpenAI to Gemini (free tier).
--
-- text-embedding-004 produces 768-dimensional vectors (previously 1536 for
-- text-embedding-3-small). Environments that only ever ran in demo mode have
-- an empty document_chunks table, so a plain ALTER is safe.

ALTER TABLE "document_chunks" ALTER COLUMN "embedding" TYPE vector(768);
