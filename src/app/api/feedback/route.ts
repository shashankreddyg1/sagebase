import { NextRequest, NextResponse } from 'next/server';
import { withApi, jsonError } from '@/lib/api';
import { setFeedback } from '@/lib/conversations';

export const dynamic = 'force-dynamic';

/** POST /api/feedback { messageId, rating: 1 | -1 } — thumbs up/down. */
export const POST = withApi(async (req: NextRequest) => {
  let messageId = '';
  let rating = 0;
  try {
    const body = (await req.json()) as { messageId?: unknown; rating?: unknown };
    if (typeof body.messageId === 'string') messageId = body.messageId;
    if (typeof body.rating === 'number') rating = body.rating;
  } catch {
    jsonError('Request body must be JSON.', 400);
  }
  if (!messageId) jsonError('Provide a "messageId".', 400);
  if (rating !== 1 && rating !== -1) jsonError('Rating must be 1 or -1.', 400);

  const ok = await setFeedback(messageId, rating);
  if (!ok) jsonError('Message not found.', 404);
  return NextResponse.json({ ok: true, rating });
});
