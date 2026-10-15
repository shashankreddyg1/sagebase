import { NextResponse } from 'next/server';
import { withApi, requireRole } from '@/lib/api';
import { getAnalytics } from '@/lib/analytics';

export const dynamic = 'force-dynamic';

/** GET /api/analytics — admin-only dashboard metrics. */
export const GET = withApi(async (_req, ctx) => {
  requireRole(ctx, ['ADMIN']);
  const data = await getAnalytics();
  return NextResponse.json(data);
});
