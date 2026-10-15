import { NextRequest, NextResponse } from 'next/server';
import { withApi } from '@/lib/api';
import { listConversations, createConversation } from '@/lib/conversations';

export const dynamic = 'force-dynamic';

export const GET = withApi(async (_req, ctx) => {
  const identity = { userId: ctx.session.userId, guestId: ctx.session.guestId };
  return NextResponse.json({ conversations: await listConversations(identity) });
});

export const POST = withApi(async (_req, ctx) => {
  const identity = { userId: ctx.session.userId, guestId: ctx.session.guestId };
  const conv = await createConversation(identity);
  return NextResponse.json({ conversation: conv }, { status: 201 });
});
