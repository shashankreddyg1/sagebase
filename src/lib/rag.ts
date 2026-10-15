import { getPrisma, isDatabaseConfigured, isAiConfigured, isDemoMode } from './db';
import { embedQuery } from './embeddings';
import { answerQuestion, streamAnswerQuestion, suggestFollowUps } from './llm';
import { searchDemoChunks, mockAnswer, type DemoHit } from './demo';

/**
 * Below this confidence the UI nudges the user toward human escalation and
 * the API auto-files a support ticket (deduplicated per conversation).
 */
export const LOW_CONFIDENCE_THRESHOLD = 0.45;

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

  if (isDemoMode || !prisma || !isDatabaseConfigured || !isAiConfigured) {
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

/**
 * Transparent answer-confidence heuristic: the mean of the top-3 retrieval
 * scores, clamped to [0, 1]. Live scores are cosine similarities; demo scores
 * are keyword-overlap ratios that can exceed 1, hence the clamp. This is
 * deliberately simple and explainable — a portfolio talking point, not a
 * calibrated probability.
 */
export function computeConfidence(sources: RagSource[]): number {
  if (sources.length === 0) return 0;
  const top = sources.slice(0, 3);
  const mean = top.reduce((s, x) => s + x.score, 0) / top.length;
  return Math.max(0, Math.min(1, mean));
}

const DEMO_FOLLOW_UPS = [
  'How does SageBase chunk uploaded documents?',
  'Which embedding model does SageBase use?',
  'What is the refund window for annual plans?',
  'How are citations shown in answers?',
  'How does SageBase find relevant chunks for a question?',
  'What happens when no relevant chunks are found?',
];

function demoFollowUps(question: string): string[] {
  let h = 0;
  for (const ch of question) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const out: string[] = [];
  for (let i = 0; i < 3; i++) {
    const pick = DEMO_FOLLOW_UPS[(h + i * 2) % DEMO_FOLLOW_UPS.length];
    if (pick && !out.includes(pick)) out.push(pick);
  }
  return out;
}

/** Follow-up question chips: LLM-generated live, deterministic picks in demo. */
export async function getFollowUps(
  question: string,
  answer: string,
  demo: boolean,
): Promise<string[]> {
  if (demo) return demoFollowUps(question);
  const suggestions = await suggestFollowUps(question, answer);
  return suggestions.length > 0 ? suggestions : demoFollowUps(question);
}

export interface StreamedAnswer {
  answer: string;
  sources: RagSource[];
  demo: boolean;
  confidence: number;
  followUps: string[];
}

/**
 * Streaming pipeline for the support chat: retrieves, streams answer tokens
 * via onToken, then resolves with the full result (confidence + follow-ups
 * included). In demo mode the mock answer is emitted word-by-word.
 */
export async function streamAnswerWithCitations(
  question: string,
  onToken: (token: string) => void,
): Promise<StreamedAnswer> {
  const { sources, demo } = await retrieveSources(question, 5);
  const confidence = computeConfidence(sources);

  if (sources.length === 0) {
    const answer =
      "I couldn't find anything relevant in your documents for that question. " +
      'Try uploading a document that covers the topic first.';
    // Still stream the abstention so the UI path stays identical.
    for (const word of answer.split(/(\s+)/)) {
      if (word) onToken(word);
      await new Promise((r) => setTimeout(r, 8));
    }
    return { answer, sources, demo, confidence, followUps: demoFollowUps(question) };
  }

  let answer: string;
  if (demo) {
    answer = mockAnswer(question, sources);
    for (const word of answer.split(/(\s+)/)) {
      if (word) onToken(word);
      await new Promise((r) => setTimeout(r, 12));
    }
  } else {
    answer = await streamAnswerQuestion(question, sources, onToken);
  }

  const followUps = await getFollowUps(question, answer, demo);
  return { answer, sources, demo, confidence, followUps };
}
