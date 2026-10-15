import Link from 'next/link';
import { cookies } from 'next/headers';
import { verifySessionToken, SESSION_COOKIE } from '@/lib/auth';

const LINKS = [
  { href: '/', label: 'Home' },
  { href: '/library', label: 'Library' },
  { href: '/chat', label: 'Chat' },
  { href: '/tickets', label: 'Tickets' },
  { href: '/evals', label: 'Evals' },
];

const ROLE_BADGE: Record<string, string> = {
  ADMIN: 'bg-red-500/15 text-red-300 border-red-500/30',
  SUPPORT_AGENT: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  END_USER: 'bg-slate-500/15 text-slate-300 border-slate-500/30',
};

export default function Navbar() {
  const token = cookies().get(SESSION_COOKIE)?.value;
  const session = token ? verifySessionToken(token) : null;
  const loggedIn = !!session?.userId;
  const isAdmin = session?.role === 'ADMIN';

  return (
    <header className="border-b border-slate-800">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
        <Link href="/" className="text-lg font-bold tracking-tight">
          <span className="text-emerald-400">Sage</span>Base
        </Link>
        <nav className="flex items-center gap-1">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="rounded-md px-3 py-2 text-sm text-slate-300 transition hover:bg-slate-800 hover:text-white"
            >
              {l.label}
            </Link>
          ))}
          {isAdmin && (
            <Link
              href="/admin"
              className="rounded-md px-3 py-2 text-sm text-slate-300 transition hover:bg-slate-800 hover:text-white"
            >
              Analytics
            </Link>
          )}
          {loggedIn ? (
            <form action="/api/auth/logout" method="POST" className="flex items-center gap-2">
              {session?.role && session.role !== 'GUEST' && (
                <span
                  className={`rounded-full border px-2 py-0.5 text-xs ${ROLE_BADGE[session.role] ?? ROLE_BADGE.END_USER}`}
                >
                  {session.role.replace('_', ' ')}
                </span>
              )}
              <button
                type="submit"
                className="rounded-md px-3 py-2 text-sm text-slate-300 transition hover:bg-slate-800 hover:text-white"
              >
                Log out
              </button>
            </form>
          ) : (
            <Link
              href="/login"
              className="rounded-md bg-emerald-500/15 px-3 py-2 text-sm font-medium text-emerald-300 transition hover:bg-emerald-500/25"
            >
              Log in
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
