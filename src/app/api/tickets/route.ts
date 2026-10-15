import { NextRequest, NextResponse } from 'next/server';
import { withApi, jsonError, requireUser } from '@/lib/api';
import { listTickets, createTicket } from '@/lib/tickets';

export const dynamic = 'force-dynamic';

/**
 * GET /api/tickets — agents/admins see the whole queue; end users and guests
 * see only their own tickets.
 */
export const GET = withApi(async (_req, ctx) => {
  const privileged = ctx.session.role === 'ADMIN' || ctx.session.role === 'SUPPORT_AGENT';
  const identity = { userId: ctx.session.userId, guestId: ctx.session.guestId };
  const tickets = await listTickets(identity, privileged);
  return NextResponse.json({ tickets });
});

/**
 * POST /api/tickets { conversationId?, reason?, summary } — file an
 * escalation ("talk to a human"). Requires login.
 */
export const POST = withApi(async (req: NextRequest, ctx) => {
  const user = requireUser(ctx);
  let conversationId: string | null = null;
  let reason = 'USER_REQUESTED';
  let summary = '';
  try {
    const body = (await req.json()) as {
      conversationId?: unknown;
      reason?: unknown;
      summary?: unknown;
    };
    if (typeof body.conversationId === 'string') conversationId = body.conversationId;
    if (typeof body.reason === 'string' && body.reason.trim()) reason = body.reason.trim().slice(0, 40);
    if (typeof body.summary === 'string') summary = body.summary.trim();
  } catch {
    jsonError('Request body must be JSON.', 400);
  }
  if (!summary) jsonError('Provide a "summary" for the ticket.', 400);

  const ticket = await createTicket({
    conversationId,
    id: { userId: user.userId, guestId: ctx.session.guestId },
    reason,
    summary: summary.slice(0, 500),
    dedupe: true,
  });
  return NextResponse.json({ ticket }, { status: 201 });
});
