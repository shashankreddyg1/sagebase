import { getPrisma, isDatabaseConfigured, isOpenAiConfigured, isDemoMode } from './db';
import { embedQuery } from './embeddings';
import { answerQuestion } from './llm';
import { searchDemoChunks, mockAnswer, type DemoHit } from './demo';

/** One retrieved chunk, numbered for [n] citations in the answer. */
export interface RagSource {
  /** 1-based citation number. */
  index: number;
  documentId: string;
  documentName: string;
  chunkIndex: number;
  content: string;
  /** Cosine similarity (0..1) in live mode; keyword-overlap score in demo. */
  score: number;
}

interface ChunkRow {
  id: string;
  document_id: string;
  chunk_index: number;
  content: string;
  document_name: string;
  score: number;
}

function toRagSources(hits: DemoHit[]): RagSource[] {
  return hits.map((h, i) => ({
    index: i + 1,
    documentId: h.documentId,
    documentName: h.documentName,
    chunkIndex: h.chunkIndex,
    content: h.content,
    score: h.score,
  }));
}

/**
 * Retrieve the top-k chunks for a question. Uses pgvector cosine similarity
 * when the database and OpenAI key are configured; otherwise falls back to
 * the in-memory demo ranker.
 */
export async function retrieveSources(
  question: string,
  topK = 5,
): Promise<{ sources: RagSource[]; demo: boolean }> {
  const prisma = getPrisma();

  if (isDemoMode || !prisma || !isDatabaseConfigured || !isOpenAiConfigured) {
    return { demo: true, sources: toRagSources(searchDemoChunks(question, topK)) };
  }

  const queryVec = await embedQuery(question);
  const vectorLiteral = `[${queryVec.join(',')}]`;

  // Prisma cannot model the vector column, so this is raw SQL. `<=>` is
  // pgvector's cosine-distance operator; 1 - distance = cosine similarity.
  const rows = await prisma.$queryRaw<ChunkRow[]>`
    SELECT c.id,
           c.document_id,
           c.chunk_index,
           c.content,
           d.name AS document_name,
           1 - (c.embedding <=> ${vectorLiteral}::vector) AS score
    FROM document_chunks AS c
    JOIN documents AS d ON d.id = c.document_id
    WHERE c.embedding IS NOT NULL
    ORDER BY c.embedding <=> ${vectorLiteral}::vector
    LIMIT ${topK}`;

  return {
    demo: false,
    sources: rows.map((r, i) => ({
      index: i + 1,
      documentId: r.document_id,
      documentName: String(r.document_name),
      chunkIndex: Number(r.chunk_index),
      content: String(r.content),
      score: Number(r.score),
    })),
  };
}

/**
 * Full pipeline: retrieve sources, then answer with citations. Shared by the
 * chat API and the eval runner so evals measure the real path.
 */
export async function answerWithCitations(
  question: string,
): Promise<{ answer: string; sources: RagSource[]; demo: boolean }> {
  const { sources, demo } = await retrieveSources(question, 5);

  if (sources.length === 0) {
    return {
      answer:
        "I couldn't find anything relevant in your documents for that question. " +
        'Try uploading a document that covers the topic first.',
      sources,
      demo,
    };
  }

  const answer = demo ? mockAnswer(question, sources) : await answerQuestion(question, sources);
  return { answer, sources, demo };
}
