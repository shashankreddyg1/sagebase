'use client';

import { useEffect, useState } from 'react';

interface AnalyticsData {
  volume: { date: string; count: number }[];
  escalationRate: number;
  avgConfidence: number | null;
  feedback: { up: number; down: number };
  p95LatencyMs: number | null;
  totals: { messages: number; conversations: number; tickets: number; openTickets: number };
  sample: boolean;
}

function BarChart({ data }: { data: { date: string; count: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  const W = 560;
  const H = 160;
  const bw = W / data.length;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Daily query volume">
      {data.map((d, i) => {
        const h = Math.max(2, (d.count / max) * (H - 30));
        const x = i * bw + 2;
        return (
          <g key={d.date}>
            <rect
              x={x}
              y={H - 20 - h}
              width={Math.max(1, bw - 4)}
              height={h}
              rx={2}
              className="fill-emerald-500/70"
            >
              <title>{`${d.date}: ${d.count} answers`}</title>
            </rect>
            {i % 2 === 0 && (
              <text x={x} y={H - 6} fontSize={8} className="fill-slate-500">
                {d.date.slice(5)}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

function Stat({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-3xl font-bold text-slate-100">{value}</p>
      {sub && <p className="mt-1 text-xs text-slate-500">{sub}</p>}
    </div>
  );
}

export default function AdminPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/analytics')
      .then(async (r) => {
        const d = (await r.json()) as AnalyticsData & { error?: string };
        if (!r.ok) throw new Error(d.error ?? 'Could not load analytics.');
        setData(d);
      })
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : 'Could not load analytics.'),
      )
      .finally(() => setLoading(false));
  }, []);

  const totalFb = (data?.feedback.up ?? 0) + (data?.feedback.down ?? 0);
  const positiveRatio =
    totalFb > 0 ? Math.round(((data?.feedback.up ?? 0) / totalFb) * 100) : null;

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Analytics</h1>
        <p className="text-slate-400">
          Support operations at a glance — volume, quality, and responsiveness.
        </p>
        {data?.sample && (
          <p className="mt-2 inline-block rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-xs text-amber-200">
            Sample data — use the app and these charts fill with real traffic.
          </p>
        )}
      </div>

      {loading && <p className="text-slate-500">Loading analytics…</p>}
      {error && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-8 text-center">
          <p className="mb-2 text-slate-300">{error}</p>
          <p className="text-sm text-slate-500">
            This dashboard requires the <span className="font-mono">ADMIN</span> role.{' '}
            <a href="/login" className="text-emerald-300 hover:underline">
              Log in
            </a>{' '}
            as admin@sagebase.demo.
          </p>
        </div>
      )}

      {data && (
        <>
          <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Stat
              label="Answers (14d)"
              value={String(data.volume.reduce((s, d) => s + d.count, 0))}
              sub="assistant messages served"
            />
            <Stat
              label="Escalation rate"
              value={`${data.escalationRate.toFixed(1)}%`}
              sub="tickets per 100 conversations (30d)"
            />
            <Stat
              label="Avg confidence"
              value={data.avgConfidence != null ? `${Math.round(data.avgConfidence * 100)}%` : '—'}
              sub="mean retrieval confidence"
            />
            <Stat
              label="p95 latency"
              value={data.p95LatencyMs != null ? `${(data.p95LatencyMs / 1000).toFixed(1)}s` : '—'}
              sub="chat API, 95th percentile"
            />
          </div>

          <div className="mb-6 grid gap-4 lg:grid-cols-3">
            <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5 lg:col-span-2">
              <h2 className="mb-3 font-semibold">Query volume — last 14 days</h2>
              <BarChart data={data.volume} />
            </div>
            <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5">
              <h2 className="mb-3 font-semibold">Feedback</h2>
              {totalFb === 0 ? (
                <p className="text-sm text-slate-500">No feedback yet.</p>
              ) : (
                <>
                  <div className="mb-2 h-3 overflow-hidden rounded-full bg-slate-800">
                    <div
                      className="h-full bg-emerald-500"
                      style={{ width: `${positiveRatio}%` }}
                    />
                  </div>
                  <p className="text-sm text-slate-300">
                    👍 {data.feedback.up} · 👎 {data.feedback.down}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {positiveRatio}% positive across {totalFb} ratings
                  </p>
                </>
              )}
              <div className="mt-6 border-t border-slate-800 pt-4 text-sm">
                <p className="flex justify-between text-slate-400">
                  <span>Open tickets</span>
                  <span className="font-semibold text-slate-200">{data.totals.openTickets}</span>
                </p>
                <p className="mt-1 flex justify-between text-slate-400">
                  <span>Total conversations</span>
                  <span className="font-semibold text-slate-200">{data.totals.conversations}</span>
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5 text-sm text-slate-400">
            <h2 className="mb-2 font-semibold text-slate-200">How to read this</h2>
            <ul className="list-disc space-y-1 pl-5">
              <li>Rising escalation rate + falling confidence → knowledge base has gaps; check the ticket queue for topics.</li>
              <li>p95 latency climbing → retrieval or the model is slowing down; consider fewer chunks or a faster model.</li>
              <li>Feedback ratio is the ground truth for answer quality — evals catch regressions, humans catch relevance.</li>
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
