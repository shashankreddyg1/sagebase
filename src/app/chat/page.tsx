'use client';

import { useState } from 'react';

interface Source {
  index: number;
  documentId: string;
  documentName: string;
  chunkIndex: number;
  content: string;
  score: number;
}

interface Msg {
  role: 'user' | 'assistant';
  text: string;
  sources?: Source[];
}

const SUGGESTIONS = [
  'How does SageBase chunk uploaded documents?',
  'What is the refund window for annual plans?',
  'Which embedding model does SageBase use?',
];

function CitedText({
  text,
  sources,
  onCite,
}: {
  text: string;
  sources: Source[];
  onCite: (n: number) => void;
}) {
  const parts = text.split(/(\[\d+\])/g);
  return (
    <>
      {parts.map((part, i) => {
        const m = /^\[(\d+)\]$/.exec(part);
        if (!m) return <span key={i}>{part}</span>;
        const n = parseInt(m[1] ?? '0', 10);
        const known = sources.some((s) => s.index === n);
        return (
          <button
            key={i}
            onClick={() => onCite(n)}
            disabled={!known}
            title={known ? 'Show source chunk' : 'Unknown source'}
            className="mx-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded bg-emerald-500/20 px-1 align-baseline text-xs font-semibold text-emerald-300 transition hover:bg-emerald-500/40 disabled:cursor-default disabled:opacity-50"
          >
            [{n}]
          </button>
        );
      })}
    </>
  );
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Msg[]>([
    {
      role: 'assistant',
      text: 'Ask me anything about your documents. Answers come with [n] citations — click one to inspect the exact source chunk.',
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [activeSource, setActiveSource] = useState<number | null>(null);

  const lastSources: Source[] = (() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const s = messages[i]?.sources;
      if (s && s.length > 0) return s;
    }
    return [];
  })();

  const onCite = (n: number) => {
    setActiveSource(n);
    document.getElementById(`src-${n}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const send = async (text: string) => {
    const q = text.trim();
    if (!q || loading) return;
    setMessages((m) => [...m, { role: 'user', text: q }]);
    setInput('');
    setLoading(true);
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q }),
      });
      const data = (await res.json()) as { answer?: string; sources?: Source[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Chat request failed.');
      setMessages((m) => [
        ...m,
        { role: 'assistant', text: data.answer ?? '', sources: data.sources ?? [] },
      ]);
    } catch (e) {
      setMessages((m) => [
        ...m,
        { role: 'assistant', text: `Error: ${e instanceof Error ? e.message : 'request failed'}` },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="mb-1 text-3xl font-bold">Chat</h1>
      <p className="mb-6 text-slate-400">Ask questions; every claim is cited to a retrieved chunk.</p>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="slim-scroll h-[52vh] space-y-4 overflow-y-auto rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                    msg.role === 'user' ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-100'
                  }`}
                >
                  {msg.role === 'assistant' && msg.sources ? (
                    <CitedText text={msg.text} sources={msg.sources} onCite={onCite} />
                  ) : (
                    msg.text
                  )}
                </div>
              </div>
            ))}
            {loading && <p className="text-sm text-slate-500">Thinking…</p>}
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => void send(s)}
                className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-300 transition hover:border-emerald-500/50 hover:text-emerald-300"
              >
                {s}
              </button>
            ))}
          </div>

          <form
            className="mt-3 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void send(input);
            }}
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about your documents…"
              className="flex-1 rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm outline-none placeholder:text-slate-500 focus:border-emerald-500"
            />
            <button
              type="submit"
              disabled={loading}
              className="rounded-xl bg-emerald-500 px-5 font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:opacity-50"
            >
              Send
            </button>
          </form>
        </div>

        <aside className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
          <h2 className="mb-3 font-semibold">Sources</h2>
          {lastSources.length === 0 ? (
            <p className="text-sm text-slate-500">
              Retrieved chunks for the latest answer will appear here.
            </p>
          ) : (
            <div className="slim-scroll max-h-[52vh] space-y-3 overflow-y-auto pr-1">
              {lastSources.map((s) => (
                <div
                  key={`${s.documentId}-${s.chunkIndex}`}
                  id={`src-${s.index}`}
                  className={`rounded-xl border p-3 text-xs transition ${
                    activeSource === s.index
                      ? 'border-emerald-400 bg-emerald-500/10'
                      : 'border-slate-700 bg-slate-900'
                  }`}
                >
                  <div className="mb-1 flex items-center justify-between">
                    <span className="font-semibold text-emerald-300">[{s.index}]</span>
                    <span className="text-slate-500">score {s.score.toFixed(2)}</span>
                  </div>
                  <p className="mb-1 truncate font-medium text-slate-300" title={s.documentName}>
                    {s.documentName} · chunk {s.chunkIndex}
                  </p>
                  <p className="leading-relaxed text-slate-400">{s.content}</p>
                </div>
              ))}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
