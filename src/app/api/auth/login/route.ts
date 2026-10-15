import { NextRequest, NextResponse } from 'next/server';
import {
  createSessionToken,
  sessionCookieHeader,
  verifyCredentials,
} from '@/lib/auth';
import { withApi } from '@/lib/api';

export const dynamic = 'force-dynamic';

export const POST = withApi(
  async (req: NextRequest) => {
    let email = '';
    let password = '';
    try {
      const body = (await req.json()) as { email?: unknown; password?: unknown };
      if (typeof body.email === 'string') email = body.email.trim().toLowerCase();
      if (typeof body.password === 'string') password = body.password;
    } catch {
      return NextResponse.json({ error: 'Request body must be JSON.' }, { status: 400 });
    }
    if (!email || !password) {
      return NextResponse.json(
        { error: 'Provide "email" and "password".' },
        { status: 400 },
      );
    }

    const verified = await verifyCredentials(email, password);
    if (!verified) {
      return NextResponse.json(
        { error: 'Invalid email or password.' },
        { status: 401 },
      );
    }

    const token = createSessionToken(verified);
    const res = NextResponse.json({
      ok: true,
      user: {
        email: verified.email,
        name: verified.name,
        role: verified.role,
      },
    });
    res.headers.set('Set-Cookie', sessionCookieHeader(token));
    return res;
  },
  { noRateLimit: false, limit: 20 },
);
