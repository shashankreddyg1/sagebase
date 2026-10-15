import { createHmac, randomBytes, scrypt as _scrypt, timingSafeEqual } from 'crypto';
import { promisify } from 'util';
import type { NextRequest } from 'next/server';
import { getPrisma, isDatabaseConfigured, isDemoMode } from './db';

const scrypt = promisify(_scrypt);

export const SESSION_COOKIE = 'sb_session';
const SESSION_MAX_AGE = 7 * 24 * 60 * 60; // 7 days, in seconds

/**
 * Signing secret. Falls back to a hard-coded dev secret ONLY in demo mode
 * (no DATABASE_URL); document this loudly: any real deployment must set
 * SESSION_SECRET.
 */
function getSecret(): string {
  return (
    process.env.SESSION_SECRET ??
    (isDatabaseConfigured ? '' : 'sagebase-demo-dev-secret-NOT-FOR-PRODUCTION')
  );
}

export type Role = 'ADMIN' | 'SUPPORT_AGENT' | 'END_USER';

export interface Session {
  userId: string | null;
  guestId: string | null;
  email: string | null;
  name: string | null;
  role: Role | 'GUEST';
}

/* ------------------------------------------------------------------ */
/* Password hashing (node:crypto scrypt — no new dependencies).        */
/* ------------------------------------------------------------------ */

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  return `scrypt:${salt}:${derived.toString('hex')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algo, salt, hash] = stored.split(':');
  if (algo !== 'scrypt' || !salt || !hash) return false;
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  const expected = Buffer.from(hash, 'hex');
  if (derived.length !== expected.length) return false;
  return timingSafeEqual(derived, expected);
}

/* ------------------------------------------------------------------ */
/* Session tokens: base64url(payload).base64url(HMAC-SHA256).          */
/* ------------------------------------------------------------------ */

function b64urlEncode(s: string): string {
  return Buffer.from(s, 'utf8').toString('base64url');
}

function sign(payload: string): string {
  const secret = getSecret();
  if (!secret) throw new Error('SESSION_SECRET must be set when a database is configured.');
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

export function createSessionToken(sess: Omit<Session, 'role'> & { role: Session['role'] }): string {
  const payload = b64urlEncode(
    JSON.stringify({ ...sess, exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE }),
  );
  return `${payload}.${sign(payload)}`;
}

export function verifySessionToken(token: string): Session | null {
  try {
    const [payload, sig] = token.split('.');
    if (!payload || !sig) return null;
    const expected = sign(payload);
    const a = Buffer.from(sig, 'base64url');
    const b = Buffer.from(expected, 'base64url');
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Session & {
      exp: number;
    };
    if (typeof data.exp !== 'number' || data.exp < Math.floor(Date.now() / 1000)) return null;
    const { exp: _exp, ...sess } = data;
    return sess as Session;
  } catch {
    return null;
  }
}

export function sessionCookieHeader(token: string): string {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return (
    `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; ` +
    `Max-Age=${SESSION_MAX_AGE}${secure}`
  );
}

export const clearSessionCookieHeader =
  `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;

/** Read the session from a request's cookies. Guests get a lightweight session. */
export function getSession(req: NextRequest): Session {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (token) {
    const sess = verifySessionToken(token);
    if (sess) return sess;
  }
  return { userId: null, guestId: null, email: null, name: null, role: 'GUEST' };
}

/* ------------------------------------------------------------------ */
/* Demo accounts. Work with zero config; in live mode they are          */
/* auto-created on first login (see ensureDemoUser).                    */
/* ------------------------------------------------------------------ */

export interface DemoAccount {
  email: string;
  password: string;
  name: string;
  role: Role;
}

export const DEMO_ACCOUNTS: DemoAccount[] = [
  { email: 'admin@sagebase.demo', password: 'admin123', name: 'Demo Admin', role: 'ADMIN' },
  { email: 'agent@sagebase.demo', password: 'agent123', name: 'Demo Agent', role: 'SUPPORT_AGENT' },
  { email: 'user@sagebase.demo', password: 'user123', name: 'Demo User', role: 'END_USER' },
];

export function findDemoAccount(email: string): DemoAccount | undefined {
  return DEMO_ACCOUNTS.find((a) => a.email.toLowerCase() === email.toLowerCase());
}

/**
 * In live (DB) mode, materialize the demo accounts on first login so the
 * documented demo logins always work. Disable by setting DISABLE_DEMO_USERS=1.
 */
export async function ensureDemoUser(account: DemoAccount) {
  if (process.env.DISABLE_DEMO_USERS === '1') return null;
  const prisma = getPrisma();
  if (!prisma) return null;
  const existing = await prisma.user.findUnique({ where: { email: account.email } });
  if (existing) return existing;
  return prisma.user.create({
    data: {
      email: account.email,
      name: account.name,
      passwordHash: await hashPassword(account.password),
      role: account.role,
    },
  });
}

/**
 * Verify credentials. Returns a session payload on success, null otherwise.
 * Demo accounts work in both demo and live mode.
 */
export async function verifyCredentials(
  email: string,
  password: string,
): Promise<Omit<Session, 'role'> & { role: Role } | null> {
  const demo = findDemoAccount(email);
  // Demo mode: never touch the database — plain in-memory check. (The app can
  // be DB-configured yet still in demo mode when the AI key is missing; DB
  // round-trips must not gate demo logins.)
  if (demo && isDemoMode) {
    if (password !== demo.password) return null;
    return {
      userId: `demo-${demo.role.toLowerCase()}`,
      guestId: null,
      email: demo.email,
      name: demo.name,
      role: demo.role,
    };
  }
  if (demo) {
    // Live mode here (demo mode returned above): DB is configured.
    const prisma = getPrisma();
    if (!prisma) return null;
    const user = (await ensureDemoUser(demo)) ?? (await prisma.user.findUnique({ where: { email: demo.email } }));
    if (!user) return null;
    if (!(await verifyPassword(password, user.passwordHash))) return null;
    return {
      userId: user.id,
      guestId: null,
      email: user.email,
      name: user.name,
      role: user.role as Role,
    };
  }

  // Non-demo accounts only exist in live mode.
  const prisma = getPrisma();
  if (!prisma) return null;
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (!user) return null;
  if (!(await verifyPassword(password, user.passwordHash))) return null;
  return {
    userId: user.id,
    guestId: null,
    email: user.email,
    name: user.name,
    role: user.role as Role,
  };
}
