import { NextRequest, NextResponse } from 'next/server';
import { clearSessionCookieHeader } from '@/lib/auth';
import { withApi } from '@/lib/api';

export const dynamic = 'force-dynamic';

export const POST = withApi(async (req: NextRequest) => {
  // Redirect (not JSON) so the navbar's plain HTML form lands back home.
  const res = NextResponse.redirect(new URL('/', req.url), 303);
  res.headers.set('Set-Cookie', clearSessionCookieHeader);
  return res;
});
