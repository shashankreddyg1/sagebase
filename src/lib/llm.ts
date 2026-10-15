import OpenAI from 'openai';
import type { RagSource } from './rag';

export const CHAT_MODEL = 'gpt-4o-mini';

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
