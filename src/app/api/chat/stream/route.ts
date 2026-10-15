import { NextRequest } from 'next/server';
import { withApi, jsonError } from '@/lib/api';
import { streamAnswerWithCitations, LOW_CONFIDENCE_THRESHOLD } from '@/lib/rag';
import {
  addMessage,
  createConversation,
  getConversationWithMessages,
} from '@/lib/conversations';
import { createTicket } from '@/lib/tickets';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * POST /api/chat/stream — Server-Sent Events stream of the RAG answer.
 *
 * Body: { question: string, conversationId?: string }
 *
 * Events:
 *   token  { text }          — answer text deltas, in order
 *   done   { messageId, conversationId, sources, confidence, followUps,
 *            demo, latencyMs, ticketId } — full result trailer
 *   error  { message }
 *
 * The assistant message is persisted (with sources, confidence, follow-ups)
 * before the `done` trailer. Low-confidence answers auto-file a support
 * ticket (one open ticket per conversation max).
 */
export const POST = withApi(
  async (req: NextRequest, ctx) => {
    let question = '';
    let conversationId: string | undefined;
    try {
      const body = (await req.json()) as {
        question?: unknown;
        conversationId?: unknown;
      };
      if (typeof body.question === 'string') question = body.question.trim();
      if (typeof body.conversationId === 'string')
        conversationId = body.conversationId;
    } catch {
      jsonError('Request body must be JSON.', 400);
    }
    if (!question) jsonError('Provide a "question" string.', 400);
    if (question.length > 2000) jsonError('Question is too long (max 2000 characters).', 400);

    const identity = { userId: ctx.session.userId, guestId: ctx.session.guestId };

    // Resolve or create the conversation (ownership-checked).
    if (conversationId) {
      const existing = await getConversationWithMessages(conversationId, identity);
      if (!existing) jsonError('Conversation not found.', 404);
    } else {
      const conv = await createConversation(identity);
      conversationId = conv.id;
    }
    const convId = conversationId as string;

    await addMessage({ conversationId: convId, role: 'user', content: question });

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const enc = new TextEncoder();
        const send = (event: string, data: unknown) => {
          controller.enqueue(
            enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
          );
        };
        const startedAt = Date.now();
        try {
          const result = await streamAnswerWithCitations(question, (token) =>
            send('token', { text: token }),
          );
          const latencyMs = Date.now() - startedAt;

          const assistantMsg = await addMessage({
            conversationId: convId,
            role: 'assistant',
            content: result.answer,
            sources: result.sources,
            confidence: Math.round(result.confidence * 1000) / 1000,
            latencyMs,
            followUps: result.followUps,
          });

          let ticketId: string | null = null;
          if (
            result.confidence < LOW_CONFIDENCE_THRESHOLD &&
            result.sources.length > 0
          ) {
            const ticket = await createTicket({
              conversationId: convId,
              id: identity,
              reason: 'LOW_CONFIDENCE',
              summary: `Low-confidence answer (${Math.round(
                result.confidence * 100,
              )}%) for: "${question.slice(0, 120)}"`,
              dedupe: true,
            });
            ticketId = ticket.id;
          }

          send('done', {
            messageId: assistantMsg.id,
            conversationId: convId,
            sources: result.sources,
            confidence: result.confidence,
            followUps: result.followUps,
            demo: result.demo,
            latencyMs,
            ticketId,
          });
        } catch (err) {
          console.error('Stream chat failed:', err);
          send('error', { message: 'Answering failed. Check server logs and API configuration.' });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
      },
    });
  },
  { limit: 20 },
);
