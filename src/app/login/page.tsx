'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

interface DemoAccount {
  email: string;
  role: string;
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [demoAccounts, setDemoAccounts] = useState<DemoAccount[]>([]);

  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => r.json())
      .then((d: { demoAccounts?: DemoAccount[] }) => setDemoAccounts(d.demoAccounts ?? []))
      .catch(() => undefined);
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Login failed.');
      router.push('/chat');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <h1 className="mb-1 text-3xl font-bold">Log in</h1>
      <p className="mb-8 text-slate-400">
        Roles unlock the support workflow: end users file tickets, agents work the queue,
        admins see analytics.
      </p>

      <form onSubmit={submit} className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900/40 p-6">
        <div>
          <label className="mb-1 block text-sm text-slate-300">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm outline-none placeholder:text-slate-500 focus:border-emerald-500"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm text-slate-300">Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm outline-none placeholder:text-slate-500 focus:border-emerald-500"
          />
        </div>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-xl bg-emerald-500 px-5 py-3 font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:opacity-50"
        >
          {loading ? 'Logging in…' : 'Log in'}
        </button>
      </form>

      {demoAccounts.length > 0 && (
        <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/40 p-6">
          <h2 className="mb-2 text-sm font-semibold text-slate-300">Demo logins (zero config)</h2>
          <ul className="space-y-2 text-sm">
            {demoAccounts.map((a) => (
              <li key={a.email} className="flex items-center justify-between gap-2">
                <span className="text-slate-400">
                  <span className="font-mono text-slate-300">{a.email}</span>
                  <span className="ml-2 rounded bg-slate-800 px-1.5 py-0.5 text-xs text-slate-400">
                    {a.role}
                  </span>
                </span>
                <button
                  onClick={() => {
                    setEmail(a.email);
                    setPassword(
                      a.role === 'ADMIN' ? 'admin123' : a.role === 'SUPPORT_AGENT' ? 'agent123' : 'user123',
                    );
                  }}
                  className="rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:border-emerald-500/50 hover:text-emerald-300"
                >
                  Fill
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-slate-500">
            Passwords: admin123 / agent123 / user123. In live mode these accounts are
            auto-created on first login (disable with DISABLE_DEMO_USERS=1).
          </p>
        </div>
      )}
    </div>
  );
}
