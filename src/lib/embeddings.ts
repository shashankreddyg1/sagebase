export const EMBEDDING_MODEL = 'text-embedding-004';
/** Dimensions produced by text-embedding-004; must match vector(768). */
export const EMBEDDING_DIMENSIONS = 768;

/**
 * Gemini's OpenAI-compatible endpoint does not reliably serve embeddings, so
 * this uses the native batchEmbedContents REST API (no extra dependency).
 * Free tier via a Google AI Studio key (https://aistudio.google.com/apikey).
 */
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

function getApiKey(): string {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not set');
  }
  return apiKey;
}

interface BatchEmbedResponse {
  embeddings?: { values: number[] }[];
}

/** Embed a batch of texts, preserving input order. */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  const apiKey = getApiKey();
  const out: number[][] = [];
  const BATCH_SIZE = 100;
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    const res = await fetch(
      `${GEMINI_API_BASE}/models/${EMBEDDING_MODEL}:batchEmbedContents?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requests: batch.map((text) => ({
            model: `models/${EMBEDDING_MODEL}`,
            content: { parts: [{ text }] },
          })),
        }),
      },
    );
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Gemini embeddings failed (${res.status}): ${body.slice(0, 200)}`);
    }
    const data = (await res.json()) as BatchEmbedResponse;
    const embeddings = data.embeddings ?? [];
    if (embeddings.length !== batch.length) {
      throw new Error(
        `Gemini returned ${embeddings.length} embeddings for ${batch.length} inputs`,
      );
    }
    for (const e of embeddings) out.push(e.values);
  }
  return out;
}

/** Embed a single query string. */
export async function embedQuery(text: string): Promise<number[]> {
  const [vec] = await embedTexts([text]);
  if (!vec) {
    throw new Error('Embedding the query failed');
  }
  return vec;
}
