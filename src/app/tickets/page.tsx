'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';

interface Reply {
  id: string;
  authorRole: string;
  authorName: string | null;
  content: string;
  createdAt: string;
}

interface Ticket {
  id: string;
  conversationId: string | null;
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED';
  reason: string;
  summary: string;
  createdAt: string;
  userEmail: string | null;
  replies: Reply[];
}

const STATUS_STYLES: Record<Ticket['status'], string> = {
  OPEN: 'bg-red-500/15 text-red-300 border-red-500/30',
  IN_PROGRESS: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  RESOLVED: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
};

export default function TicketsPage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [filter, setFilter] = useState<'ALL' | Ticket['status']>('ALL');
  const [selected, setSelected] = useState<Ticket | null>(null);
  const [role, setRole] = useState<string>('GUEST');
  const [reply, setReply] = useState('');
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState('');

  const canWork = role === 'ADMIN' || role === 'SUPPORT_AGENT';

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [tRes, mRes] = await Promise.all([
        fetch('/api/tickets'),
        fetch('/api/auth/me'),
      ]);
      const tData = (await tRes.json()) as { tickets?: Ticket[]; error?: string };
      const mData = (await mRes.json()) as { role?: string; error?: string };
      if (!tRes.ok) throw new Error(tData.error ?? 'Could not load tickets.');
      setTickets(tData.tickets ?? []);
      setRole(mData.role ?? 'GUEST');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load tickets.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = tickets.filter((t) => filter === 'ALL' || t.status === filter);

  const setStatus = async (status: Ticket['status']) => {
    if (!selected) return;
    setActing(true);
    try {
      const res = await fetch(`/api/tickets/${selected.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const data = (await res.json()) as { ticket?: Ticket; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Status update failed.');
      setSelected(data.ticket ?? null);
      setTickets((ts) => ts.map((t) => (t.id === data.ticket?.id ? data.ticket : t)));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Status update failed.');
    } finally {
      setActing(false);
    }
  };

  const sendReply = async () => {
    if (!selected || !reply.trim()) return;
    setActing(true);
    try {
      const res = await fetch(`/api/tickets/${selected.id}/replies`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: reply.trim() }),
      });
      const data = (await res.json()) as { reply?: Reply; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Reply failed.');
      setReply('');
      // Refresh the ticket to pick up the mirrored conversation state.
      const tRes = await fetch(`/api/tickets/${selected.id}`);
      const tData = (await tRes.json()) as { ticket?: Ticket };
      if (tData.ticket) {
        setSelected(tData.ticket);
        setTickets((ts) => ts.map((t) => (t.id === tData.ticket?.id ? tData.ticket : t)));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Reply failed.');
    } finally {
      setActing(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Support queue</h1>
          <p className="text-slate-400">
            {canWork
              ? 'Escalations from low-confidence answers and user requests.'
              : 'Your escalations. Log in as an agent to work the queue.'}
          </p>
        </div>
        <div className="flex gap-2">
          {(['ALL', 'OPEN', 'IN_PROGRESS', 'RESOLVED'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`rounded-full border px-3 py-1 text-xs transition ${
                filter === s
                  ? 'border-emerald-500/60 bg-emerald-500/10 text-emerald-300'
                  : 'border-slate-700 text-slate-400 hover:text-slate-200'
              }`}
            >
              {s.replace('_', ' ')}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="mb-4 text-sm text-red-400">{error}</p>}

      {loading ? (
        <p className="text-slate-500">Loading tickets…</p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="space-y-3">
            {visible.length === 0 && (
              <p className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6 text-sm text-slate-500">
                No tickets here. Low-confidence answers and “talk to a human” requests will
                land in this queue.
              </p>
            )}
            {visible.map((t) => (
              <button
                key={t.id}
                onClick={() => setSelected(t)}
                className={`w-full rounded-2xl border p-4 text-left transition ${
                  selected?.id === t.id
                    ? 'border-emerald-500/60 bg-emerald-500/5'
                    : 'border-slate-800 bg-slate-900/40 hover:border-slate-600'
                }`}
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span
                    className={`rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[t.status]}`}
                  >
                    {t.status.replace('_', ' ')}
                  </span>
                  <span className="text-xs text-slate-500">
                    {new Date(t.createdAt).toLocaleString()}
                  </span>
                </div>
                <p className="text-sm font-medium text-slate-200">{t.summary}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {t.reason.replace('_', ' ')}
                  {t.userEmail ? ` · ${t.userEmail}` : ''}
                  {t.replies.length > 0 ? ` · ${t.replies.length} replies` : ''}
                </p>
              </button>
            ))}
          </div>

          <div className="lg:col-span-2">
            {!selected ? (
              <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-8 text-center text-sm text-slate-500">
                Select a ticket to see the thread.
              </div>
            ) : (
              <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <span
                    className={`rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[selected.status]}`}
                  >
                    {selected.status.replace('_', ' ')}
                  </span>
                  {canWork && (
                    <div className="flex gap-2">
                      {(['OPEN', 'IN_PROGRESS', 'RESOLVED'] as const).map((s) => (
                        <button
                          key={s}
                          disabled={acting || selected.status === s}
                          onClick={() => void setStatus(s)}
                          className="rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-300 transition hover:border-emerald-500/50 hover:text-emerald-300 disabled:opacity-40"
                        >
                          {s.replace('_', ' ')}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <p className="mb-1 text-sm font-medium text-slate-200">{selected.summary}</p>
                <p className="mb-6 text-xs text-slate-500">
                  {selected.reason.replace('_', ' ')} · opened{' '}
                  {new Date(selected.createdAt).toLocaleString()}
                  {selected.conversationId && (
                    <>
                      {' · '}
                      <Link
                        href={`/chat?c=${selected.conversationId}`}
                        className="text-emerald-300 hover:underline"
                      >
                        view conversation
                      </Link>
                    </>
                  )}
                </p>

                <div className="mb-6 space-y-3">
                  {selected.replies.length === 0 && (
                    <p className="text-sm text-slate-500">No replies yet.</p>
                  )}
                  {selected.replies.map((r) => (
                    <div key={r.id} className="rounded-xl bg-slate-800 p-3 text-sm">
                      <p className="mb-1 text-xs text-slate-500">
                        {r.authorName ?? r.authorRole.replace('_', ' ')} ·{' '}
                        {new Date(r.createdAt).toLocaleString()}
                      </p>
                      <p className="text-slate-200">{r.content}</p>
                    </div>
                  ))}
                </div>

                {canWork ? (
                  <div className="flex gap-2">
                    <input
                      value={reply}
                      onChange={(e) => setReply(e.target.value)}
                      placeholder="Reply as support agent… (mirrored into the chat)"
                      className="flex-1 rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm outline-none placeholder:text-slate-500 focus:border-emerald-500"
                    />
                    <button
                      onClick={() => void sendReply()}
                      disabled={acting || !reply.trim()}
                      className="rounded-xl bg-emerald-500 px-5 font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:opacity-50"
                    >
                      Reply
                    </button>
                  </div>
                ) : (
                  <p className="text-sm text-slate-500">
                    <Link href="/login" className="text-emerald-300 hover:underline">
                      Log in
                    </Link>{' '}
                    as a support agent to reply.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
