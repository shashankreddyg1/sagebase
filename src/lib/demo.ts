import { chunkText } from './chunk';

/**
 * Demo mode: when DATABASE_URL or GEMINI_API_KEY is missing, the app serves
 * two realistic seed documents from memory, ranks chunks by keyword overlap,
 * and returns clearly-labeled mock answers. Uploaded files are kept in the
 * same ephemeral in-memory store (they vanish on restart).
 */

export interface DemoChunk {
  index: number;
  content: string;
}

export interface DemoDocument {
  id: string;
  name: string;
  mimeType: string;
  status: 'READY' | 'PROCESSING' | 'FAILED';
  createdAt: string;
  chunks: DemoChunk[];
}

export interface DemoHit {
  documentId: string;
  documentName: string;
  chunkIndex: number;
  content: string;
  /** Keyword-overlap score in roughly 0..1.3 (not a cosine similarity). */
  score: number;
}

const HANDBOOK = `SageBase Product Handbook

Overview. SageBase is a retrieval-augmented generation knowledge base. You upload documents, and SageBase lets you chat with them using cited answers.

Uploading documents. SageBase accepts PDF, plain text (.txt), and Markdown (.md) files. PDF text is extracted automatically on upload.

Chunking. Uploaded text is split into chunks of about 800 characters with a 100 character overlap between consecutive chunks, so context is never lost at chunk boundaries.

Embeddings. Each chunk is embedded with Google's text-embedding-004 model, which produces 768 dimensional vectors. Embeddings capture the semantic meaning of each chunk.

Storage and retrieval. Vectors are stored in PostgreSQL using the pgvector extension. When you ask a question, the question is embedded with the same model and SageBase retrieves the top 5 chunks by cosine similarity, using pgvector's cosine distance operator.

Cited answers. The language model answers using only the retrieved chunks. Every factual claim carries an inline citation like [1] or [2] that maps to a source chunk you can inspect in the side panel.

Evaluations. The Evals dashboard runs canned questions through the full pipeline and scores each answer on citation coverage and keyword recall. These are heuristic demo evals, not a substitute for human review.`;

const REFUND_POLICY = `Acme Cloud Refund Policy — effective January 2026.

Annual plans. Annual subscriptions are refundable within 30 days of purchase or renewal. To request a refund, contact billing@acmecloud.example from the account owner email. Refunds are issued to the original payment method within 5 to 10 business days.

Monthly plans. Monthly subscriptions are refundable within 14 days of the most recent charge. After 14 days the current month is non-refundable, but you may cancel to stop future billing.

Usage-based charges. Metered usage billed in arrears is non-refundable, except where a documented service outage exceeds 4 hours in a billing period.

How to cancel. Cancel any time from Settings, then Billing, then Cancel plan. Your service remains active until the end of the paid term.

Exceptions. Refund requests outside these windows are reviewed case by case and require a support ticket with invoice numbers.`;

function seedDocument(id: string, name: string, mimeType: string, text: string): DemoDocument {
  const chunks = chunkText(text).map((c) => ({ index: c.index, content: c.content }));
  return {
    id,
    name,
    mimeType,
    status: 'READY',
    createdAt: new Date().toISOString(),
    chunks,
  };
}

const store: DemoDocument[] = [
  seedDocument('demo-handbook', 'SageBase Product Handbook.md', 'text/markdown', HANDBOOK),
  seedDocument('demo-refunds', 'Acme Cloud Refund Policy.txt', 'text/plain', REFUND_POLICY),
];

export function listDemoDocuments() {
  return store.map((d) => ({
    id: d.id,
    name: d.name,
    mimeType: d.mimeType,
    status: d.status,
    createdAt: d.createdAt,
    chunkCount: d.chunks.length,
  }));
}

export function addDemoDocument(input: { name: string; mimeType: string; text: string }): DemoDocument {
  const doc = seedDocument(`demo-${Date.now()}`, input.name, input.mimeType, input.text);
  store.unshift(doc);
  return doc;
}

export function deleteDemoDocument(id: string): boolean {
  const i = store.findIndex((d) => d.id === id);
  if (i === -1) return false;
  store.splice(i, 1);
  return true;
}

function tokens(s: string): string[] {
  return s
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 2);
}

function countHits(text: string, queryTokens: Set<string>): number {
  const seen = new Set(tokens(text));
  let n = 0;
  for (const t of queryTokens) {
    if (seen.has(t)) n++;
  }
  return n;
}

/** Rank chunks by keyword overlap with the query (demo stand-in for vector search). */
export function searchDemoChunks(query: string, topK = 5): DemoHit[] {
  const q = new Set(tokens(query));
  if (q.size === 0) return [];

  const scored: DemoHit[] = [];
  for (const doc of store) {
    if (doc.status !== 'READY') continue;
    for (const chunk of doc.chunks) {
      const overlap = countHits(chunk.content, q);
      if (overlap === 0) continue;
      const phraseBonus =
        query.trim().length > 3 && chunk.content.toLowerCase().includes(query.trim().toLowerCase())
          ? 0.3
          : 0;
      scored.push({
        documentId: doc.id,
        documentName: doc.name,
        chunkIndex: chunk.index,
        content: chunk.content,
        score: overlap / q.size + phraseBonus,
      });
    }
  }

  return scored.sort((a, b) => b.score - a.score).slice(0, topK);
}

/**
 * Build a clearly-labeled mock answer from the top hits. Sentences are chosen
 * for keyword overlap with the question, and every sentence carries its [n]
 * citation so the eval scorer can verify citation coverage.
 */
export function mockAnswer(question: string, hits: DemoHit[]): string {
  if (hits.length === 0) {
    return "I couldn't find anything relevant in your documents for that question. Try uploading a document that covers the topic first.";
  }

  const q = new Set(tokens(question));
  const sentences: string[] = [];

  hits.slice(0, 3).forEach((hit, i) => {
    const parts = hit.content.split(/(?<=[.!?])\s+/).filter((p) => p.trim().length > 0);
    const ranked = [...parts].sort((a, b) => countHits(b, q) - countHits(a, q));
    const best = (ranked[0] ?? '').trim();
    if (best) {
      sentences.push(`${best} [${i + 1}]`);
    }
  });

  return `Based on your documents (demo answer): ${sentences.join(' ')}`;
}
