'use client';

import { useEffect, useState } from 'react';

interface EvalCase {
  id: string;
  question: string;
  expectedKeywords: string[];
}

interface EvalResult {
  caseId: string;
  question: string;
  answer: string;
  sourcesUsed: number;
  keywordRecall: number;
  citationCoverage: number;
  score: number;
  passed: boolean;
  demo: boolean;
}

interface EvalRun {
  ranAt: string;
  demo: boolean;
  averageScore: number;
  results: EvalResult[];
}

const pct = (v: number) => `${Math.round(v * 100)}%`;

export default function EvalsPage() {
  const [cases, setCases] = useState<EvalCase[]>([]);
  const [lastRun, setLastRun] = useState<EvalRun | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetch('/api/evals')
      .then((r) => r.json())
      .then((d: { cases?: EvalCase[]; lastRun?: EvalRun | null }) => {
        setCases(d.cases ?? []);
        setLastRun(d.lastRun ?? null);
      })
      .catch(() => setError('Could not load eval cases.'));
  }, []);

  const run = async () => {
    setRunning(true);
    setError(null);
    try {
      const res = await fetch('/api/evals/run', { method: 'POST' });
      const data = (await res.json()) as EvalRun & { error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Eval run failed.');
      setLastRun(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Eval run failed.');
    } finally {
      setRunning(false);
    }
  };

  const passed = lastRun?.results.filter((r) => r.passed).length ?? 0;
  const total = lastRun?.results.length ?? 0;

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <div className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-bold">Evals</h1>
          <p className="mt-1 max-w-2xl text-slate-400">
            Five canned questions run through the same pipeline the chat uses, scored on
            citation coverage and keyword recall.
          </p>
        </div>
        <button
          onClick={() => void run()}
          disabled={running}
          className="rounded-xl bg-emerald-500 px-5 py-2.5 font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:opacity-50"
        >
          {running ? 'Running…' : 'Run evals'}
        </button>
      </div>

      <div className="mb-6 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
        Heuristic demo evals — useful for catching regressions (like citations silently
        disappearing), not a substitute for human or LLM-as-judge evaluation.
      </div>

      {error && (
        <div className="mb-6 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      )}

      {lastRun && (
        <div className="mb-6 grid grid-cols-3 gap-4">
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
            <p className="text-xs text-slate-500">Average score</p>
            <p className="text-2xl font-bold text-emerald-300">{pct(lastRun.averageScore)}</p>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
            <p className="text-xs text-slate-500">Passed</p>
            <p className="text-2xl font-bold">
              {passed} / {total}
            </p>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
            <p className="text-xs text-slate-500">Mode</p>
            <p className="text-2xl font-bold">{lastRun.demo ? 'Demo' : 'Live'}</p>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {lastRun ? (
          lastRun.results.map((r) => (
            <details
              key={r.caseId}
              className="rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3"
            >
              <summary className="flex cursor-pointer items-center justify-between gap-4">
                <span className="font-medium">{r.question}</span>
                <span className="flex shrink-0 items-center gap-3 text-sm">
                  <span className="text-slate-400">{pct(r.score)}</span>
                  <span
                    className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${
                      r.passed
                        ? 'border-emerald-500/30 bg-emerald-500/15 text-emerald-300'
                        : 'border-red-500/30 bg-red-500/15 text-red-300'
                    }`}
                  >
                    {r.passed ? 'PASS' : 'FAIL'}
                  </span>
                </span>
              </summary>
              <div className="mt-3 grid gap-2 text-sm md:grid-cols-3">
                <div className="rounded-lg bg-slate-950/60 p-3">
                  <p className="mb-1 text-xs text-slate-500">Keyword recall</p>
                  <p className="font-semibold">{pct(r.keywordRecall)}</p>
                </div>
                <div className="rounded-lg bg-slate-950/60 p-3">
                  <p className="mb-1 text-xs text-slate-500">Citation coverage</p>
                  <p className="font-semibold">{pct(r.citationCoverage)}</p>
                </div>
                <div className="rounded-lg bg-slate-950/60 p-3">
                  <p className="mb-1 text-xs text-slate-500">Sources used</p>
                  <p className="font-semibold">{r.sourcesUsed}</p>
                </div>
              </div>
              <p className="mt-3 text-xs text-slate-500">Answer:</p>
              <p className="mt-1 text-sm leading-relaxed text-slate-300">{r.answer}</p>
            </details>
          ))
        ) : (
          <div className="space-y-3">
            {cases.map((c) => (
              <div
                key={c.id}
                className="rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3"
              >
                <p className="font-medium">{c.question}</p>
                <p className="mt-1 text-xs text-slate-500">
                  Expected keywords: {c.expectedKeywords.join(', ')}
                </p>
              </div>
            ))}
            {cases.length === 0 && !error && (
              <p className="text-slate-500">Loading eval cases…</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
