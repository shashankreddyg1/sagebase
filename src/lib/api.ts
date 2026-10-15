import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import {
  SESSION_COOKIE,
  createSessionToken,
  getSession,
  sessionCookieHeader,
  type Session,
} from './auth';
import { getPrisma } from './db';
import { checkRateLimit } from './ratelimit';
import { demoLogApi } from './demoStore';

export interface ApiContext {
  session: Session;
  ip: string;
}

type Handler = (req: NextRequest, ctx: ApiContext) => Promise<Response>;

interface WithApiOptions {
  /** Max requests per window for the caller (default 60/min). */
  limit?: number;
  windowMs?: number;
  /** Skip rate limiting (e.g. for the login route itself). */
  noRateLimit?: boolean;
}

function clientIp(req: NextRequest): string {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0]?.trim() || 'unknown';
  return 'unknown';
}

async function persistLog(entry: {
  userId: string | null;
  ip: string;
  method: string;
  path: string;
  statusCode: number;
  latencyMs: number;
}): Promise<void> {
  const prisma = getPrisma();
  if (prisma) {
    await prisma.apiLog.create({ data: entry });
  } else {
    demoLogApi(entry);
  }
}

/**
 * Wrap an API route handler with: session parsing, per-caller rate limiting,
 * latency timing, and request logging (ApiLog table or the demo in-memory
 * log). Keeps every route's observability identical with one line.
 */
export function withApi(handler: Handler, opts: WithApiOptions = {}): Handler {
  const limit = opts.limit ?? 60;
  const windowMs = opts.windowMs ?? 60_000;

  return async (req: NextRequest) => {
    const started = Date.now();
    // Mint a stable guest id for anonymous callers so their conversations
    // and tickets persist across requests (stored in the session cookie).
    let session = getSession(req);
    let guestCookie: string | null = null;
    if (session.role === 'GUEST' && !session.guestId) {
      session = { ...session, guestId: `guest-${randomUUID()}` };
      guestCookie = sessionCookieHeader(createSessionToken(session));
    }
    const ip = clientIp(req);
    const ctx: ApiContext = { session, ip };

    const finish = (res: Response): Response => {
      // Don't clobber a session cookie the handler set itself (e.g. login).
      const alreadySet = res.headers
        .getSetCookie?.()
        .some((c) => c.startsWith(`${SESSION_COOKIE}=`));
      if (guestCookie && !alreadySet) res.headers.append('Set-Cookie', guestCookie);
      const latencyMs = Date.now() - started;
      // Best-effort logging; never break the response if logging fails.
      void persistLog({
        userId: session.userId,
        ip,
        method: req.method,
        path: new URL(req.url).pathname,
        statusCode: res.status,
        latencyMs,
      }).catch((e) => console.error('ApiLog write failed:', e));
      return res;
    };

    if (!opts.noRateLimit) {
      const key = session.userId ?? `ip:${ip}`;
      const rl = checkRateLimit(key, limit, windowMs);
      if (!rl.allowed) {
        const res = NextResponse.json(
          { error: 'Rate limit exceeded. Slow down and try again shortly.' },
          { status: 429 },
        );
        res.headers.set('Retry-After', String(Math.ceil(rl.retryAfterMs / 1000)));
        return finish(res);
      }
    }

    try {
      return finish(await handler(req, ctx));
    } catch (err) {
      if (isJsonError(err)) {
        return finish(NextResponse.json({ error: err.message }, { status: err.status }));
      }
      console.error('API handler failed:', err);
      return finish(
        NextResponse.json({ error: 'Internal server error.' }, { status: 500 }),
      );
    }
  };
}

/** Convenience: 401 when there is no logged-in user. */
export function requireUser(ctx: ApiContext): Session & { userId: string } {
  if (!ctx.session.userId) {
    throw jsonError('Login required.', 401);
  }
  return ctx.session as Session & { userId: string };
}

/** Convenience: 403 unless the session role is in the allowed set. */
export function requireRole(
  ctx: ApiContext,
  roles: Array<Session['role']>,
): Session {
  if (!roles.includes(ctx.session.role)) {
    throw jsonError('Forbidden: insufficient role.', 403);
  }
  return ctx.session;
}

/**
 * Throw a JSON error response from inside a withApi handler. withApi's
 * catch converts it into the final response (and still logs the request).
 */
function isJsonError(err: unknown): err is Error & { status: number; json: true } {
  return (
    err instanceof Error &&
    (err as Error & { json?: unknown }).json === true &&
    typeof (err as Error & { status?: unknown }).status === 'number'
  );
}

export function jsonError(message: string, status: number): never {
  const err = new Error(message) as Error & { status: number; json: true };
  err.status = status;
  err.json = true;
  throw err;
}
