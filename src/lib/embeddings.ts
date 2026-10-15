import OpenAI from 'openai';

export const EMBEDDING_MODEL = 'text-embedding-3-small';
/** Dimensions produced by text-embedding-3-small; must match vector(1536). */
export const EMBEDDING_DIMENSIONS = 1536;

let client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!client) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is not set');
    }
    client = new OpenAI({ apiKey });
  }
  return client;
}

/** Embed a batch of texts, preserving input order. */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  const out: number[][] = [];
  const BATCH_SIZE = 96;
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    const res = await getClient().embeddings.create({
      model: EMBEDDING_MODEL,
      input: batch,
    });
    const sorted = [...res.data].sort((a, b) => a.index - b.index);
    for (const item of sorted) {
      out.push(item.embedding);
    }
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
