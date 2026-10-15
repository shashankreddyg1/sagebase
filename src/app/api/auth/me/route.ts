import { NextResponse } from 'next/server';
import { DEMO_ACCOUNTS } from '@/lib/auth';
import { isDemoMode } from '@/lib/db';
import { withApi } from '@/lib/api';

export const dynamic = 'force-dynamic';

/**
 * Current session info. In demo mode the response also advertises the
 * seeded demo logins so the login page can show them.
 */
export const GET = withApi(async (_req, ctx) => {
  const s = ctx.session;
  return NextResponse.json({
    userId: s.userId,
    email: s.email,
    name: s.name,
    role: s.role,
    demoMode: isDemoMode,
    demoAccounts: isDemoMode
      ? DEMO_ACCOUNTS.map((a) => ({ email: a.email, role: a.role }))
      : [],
  });
});
