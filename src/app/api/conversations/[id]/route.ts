import { NextRequest, NextResponse } from 'next/server';
import { withApi, jsonError } from '@/lib/api';
import { getConversationWithMessages, deleteConversation } from '@/lib/conversations';

export const dynamic = 'force-dynamic';

// NOTE: withApi wraps handlers as (req, ctx), so the route id is read from
// the URL pathname instead of Next.js's { params } second argument.
function routeId(req: NextRequest): string {
  return new URL(req.url).pathname.split('/').pop() ?? '';
}

export const GET = withApi(async (req: NextRequest, ctx) => {
  const identity = { userId: ctx.session.userId, guestId: ctx.session.guestId };
  const found = await getConversationWithMessages(routeId(req), identity);
  if (!found) jsonError('Conversation not found.', 404);
  return NextResponse.json(found);
});

export const DELETE = withApi(async (req: NextRequest, ctx) => {
  const identity = { userId: ctx.session.userId, guestId: ctx.session.guestId };
  const ok = await deleteConversation(routeId(req), identity);
  if (!ok) jsonError('Conversation not found.', 404);
  return NextResponse.json({ ok: true });
});
