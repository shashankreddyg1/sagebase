import OpenAI from 'openai';
import type { RagSource } from './rag';

export const CHAT_MODEL = 'gemini-2.5-flash';

/**
 * Gemini exposes an OpenAI-compatible chat endpoint, so the `openai` client
 * works unchanged apart from the base URL. Free tier via a Google AI Studio
 * key (https://aistudio.google.com/apikey).
 */
const GEMINI_OPENAI_BASE_URL =
  'https://generativelanguage.googleapis.com/v1beta/openai/';

let client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!client) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is not set');
    }
    client = new OpenAI({ apiKey, baseURL: GEMINI_OPENAI_BASE_URL });
  }
  return client;
}

/**
 * Answer a question using ONLY the provided sources, with [n] inline
 * citations that map to the source list. The model is instructed not to
 * invent details when the sources fall short.
 */
export async function answerQuestion(question: string, sources: RagSource[]): Promise<string> {
  const context = sources
    .map((s) => `[${s.index}] (from "${s.documentName}")\n${s.content}`)
    .join('\n\n');

  const completion = await getClient().chat.completions.create({
    model: CHAT_MODEL,
    temperature: 0.2,
    messages: [
      {
        role: 'system',
        content:
          'You are a precise research assistant. Answer the question using ONLY the numbered sources below. ' +
          'Cite every factual claim with its source number like [1] or [2]. ' +
          'If the sources do not contain the answer, say so plainly and do not invent details.',
      },
      {
        role: 'user',
        content: `Sources:\n${context}\n\nQuestion: ${question}\n\nAnswer with inline citations:`,
      },
    ],
  });

  return (
    completion.choices[0]?.message?.content?.trim() ??
    'I was unable to generate an answer from the retrieved sources.'
  );
}
