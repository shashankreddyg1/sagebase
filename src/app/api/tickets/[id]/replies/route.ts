import { NextRequest, NextResponse } from 'next/server';
import { withApi, jsonError, requireRole } from '@/lib/api';
import { addTicketReply } from '@/lib/tickets';

export const dynamic = 'force-dynamic';

const AGENT_ROLES = ['ADMIN', 'SUPPORT_AGENT'] as const;

/**
 * POST /api/tickets/[id]/replies { content } — an agent/admin replies to a
 * ticket. The reply is also mirrored into the linked conversation as an
 * "agent" message so the requester sees it in chat.
 */
export const POST = withApi(async (req: NextRequest, ctx) => {
  const session = requireRole(ctx, [...AGENT_ROLES]);
  const ticketId = new URL(req.url).pathname.split('/').slice(-2, -1)[0] ?? '';

  let content = '';
  try {
    const body = (await req.json()) as { content?: unknown };
    if (typeof body.content === 'string') content = body.content.trim();
  } catch {
    jsonError('Request body must be JSON.', 400);
  }
  if (!content) jsonError('Provide reply "content".', 400);
  if (content.length > 4000) jsonError('Reply is too long (max 4000 characters).', 400);

  const reply = await addTicketReply({
    ticketId,
    authorId: session.userId,
    authorRole: session.role,
    content,
  });
  if (!reply) jsonError('Ticket not found.', 404);
  return NextResponse.json({ reply }, { status: 201 });
});
