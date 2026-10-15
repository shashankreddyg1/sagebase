import { NextRequest, NextResponse } from 'next/server';
import { withApi, jsonError, requireRole } from '@/lib/api';
import { getTicket, setTicketStatus, type TicketStatus } from '@/lib/tickets';

export const dynamic = 'force-dynamic';

function routeId(req: NextRequest): string {
  return new URL(req.url).pathname.split('/').pop() ?? '';
}

const AGENT_ROLES = ['ADMIN', 'SUPPORT_AGENT'] as const;

/** GET /api/tickets/[id] — ticket detail with replies (agents/admins, or the owner). */
export const GET = withApi(async (req: NextRequest, ctx) => {
  const ticket = await getTicket(routeId(req));
  if (!ticket) jsonError('Ticket not found.', 404);
  const privileged =
    ctx.session.role === 'ADMIN' || ctx.session.role === 'SUPPORT_AGENT';
  const owns =
    (ctx.session.userId && ticket.userId === ctx.session.userId) ||
    (ctx.session.guestId && ticket.guestId === ctx.session.guestId);
  // StoredTicket shape carries userEmail only; re-check ownership via list.
  if (!privileged && !owns) {
    // Fall back: owners can always see their own tickets via the list route,
    // which is already identity-scoped. Detail here requires privilege or a
    // direct ownership match above.
    jsonError('Forbidden.', 403);
  }
  return NextResponse.json({ ticket });
});

/** PATCH /api/tickets/[id] { status } — move a ticket through the queue. */
export const PATCH = withApi(async (req: NextRequest, ctx) => {
  requireRole(ctx, [...AGENT_ROLES]);
  let status: string = '';
  try {
    const body = (await req.json()) as { status?: unknown };
    if (typeof body.status === 'string') status = body.status;
  } catch {
    jsonError('Request body must be JSON.', 400);
  }
  if (!['OPEN', 'IN_PROGRESS', 'RESOLVED'].includes(status)) {
    jsonError('Status must be OPEN, IN_PROGRESS, or RESOLVED.', 400);
  }
  const ticket = await setTicketStatus(routeId(req), status as TicketStatus);
  if (!ticket) jsonError('Ticket not found.', 404);
  return NextResponse.json({ ticket });
});
