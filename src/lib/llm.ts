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

const SYSTEM_PROMPT =
  'You are a precise research assistant. Answer the question using ONLY the numbered sources below. ' +
  'Cite every factual claim with its source number like [1] or [2]. ' +
  'If the sources do not contain the answer, say so plainly and do not invent details.';

function buildMessages(question: string, sources: RagSource[]) {
  const context = sources
    .map((s) => `[${s.index}] (from "${s.documentName}")\n${s.content}`)
    .join('\n\n');
  return [
    { role: 'system' as const, content: SYSTEM_PROMPT },
    {
      role: 'user' as const,
      content: `Sources:\n${context}\n\nQuestion: ${question}\n\nAnswer with inline citations:`,
    },
  ];
}

/**
 * Streaming variant of answerQuestion. Calls onToken for each text delta as
 * it arrives and resolves with the complete answer. Used by the
 * /api/chat/stream route (ReadableStream / SSE).
 */
export async function streamAnswerQuestion(
  question: string,
  sources: RagSource[],
  onToken: (token: string) => void,
): Promise<string> {
  const stream = await getClient().chat.completions.create({
    model: CHAT_MODEL,
    temperature: 0.2,
    stream: true,
    messages: buildMessages(question, sources),
  });

  let full = '';
  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content ?? '';
    if (delta) {
      full += delta;
      onToken(delta);
    }
  }
  return full.trim() || 'I was unable to generate an answer from the retrieved sources.';
}

/**
 * Suggest three short follow-up questions grounded in the just-given answer.
 * One extra tiny LLM call; callers should run it after the answer completes
 * (it ships in the stream's `done` trailer, not inline).
 */
export async function suggestFollowUps(
  question: string,
  answer: string,
): Promise<string[]> {
  try {
    const completion = await getClient().chat.completions.create({
      model: CHAT_MODEL,
      temperature: 0.4,
      max_tokens: 120,
      messages: [
        {
          role: 'system',
          content:
            'Suggest 3 short follow-up questions a user might ask next. ' +
            'Reply with ONLY a JSON array of 3 strings, each under 14 words. No other text.',
        },
        {
          role: 'user',
          content: `Question: ${question}\nAnswer: ${answer.slice(0, 1200)}`,
        },
      ],
    });
    const raw = completion.choices[0]?.message?.content?.trim() ?? '';
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed
        .filter((s): s is string => typeof s === 'string')
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
        .slice(0, 3);
    }
  } catch (e) {
    console.error('Follow-up generation failed:', e);
  }
  return [];
}
