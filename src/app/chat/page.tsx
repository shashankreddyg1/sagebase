'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import FadeIn from '@/components/FadeIn';

interface Source {
  index: number;
  documentId: string;
  documentName: string;
  chunkIndex: number;
  content: string;
  score: number;
}

interface Msg {
  id?: string;
  role: 'user' | 'assistant' | 'agent';
  text: string;
  sources?: Source[];
  confidence?: number | null;
  followUps?: string[] | null;
  feedback?: number | null;
  ticketId?: string | null;
  streaming?: boolean;
}

interface Conversation {
  id: string;
  title: string;
  updatedAt: string;
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

function ConfidenceBadge({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color =
    value >= 0.7
      ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
      : value >= 0.45
        ? 'border-amber-500/40 bg-amber-500/10 text-amber-300'
        : 'border-red-500/40 bg-red-500/10 text-red-300';
  return (
    <span
      className={`inline-block rounded-full border px-2 py-0.5 text-xs font-medium ${color}`}
      title="Mean of the top-3 retrieval scores — a rough answer-confidence signal"
    >
      {pct}% confidence
    </span>
  );
}

function ChatInner() {
  const searchParams = useSearchParams();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [activeSource, setActiveSource] = useState<number | null>(null);
  const [escalating, setEscalating] = useState(false);
  const [notice, setNotice] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  const refreshConversations = useCallback(async () => {
    try {
      const res = await fetch('/api/conversations');
      const data = (await res.json()) as { conversations?: Conversation[] };
      setConversations(data.conversations ?? []);
    } catch {
      /* sidebar is best-effort */
    }
  }, []);

  const openConversation = useCallback(
    async (id: string | null) => {
      setActiveId(id);
      setActiveSource(null);
      if (!id) {
        setMessages([
          {
            role: 'assistant',
            text: 'Ask me anything about your documents. Answers stream in with [n] citations — click one to inspect the exact source chunk.',
          },
        ]);
        return;
      }
      try {
        const res = await fetch(`/api/conversations/${id}`);
        const data = (await res.json()) as {
          messages?: Array<{
            id: string;
            role: 'user' | 'assistant' | 'agent';
            content: string;
            sources: Source[] | null;
            confidence: number | null;
            followUps: string[] | null;
            feedback: number | null;
          }>;
        };
        setMessages(
          (data.messages ?? []).map((m) => ({
            id: m.id,
            role: m.role,
            text: m.content,
            sources: m.sources ?? undefined,
            confidence: m.confidence,
            followUps: m.followUps,
            feedback: m.feedback,
          })),
        );
      } catch {
        setMessages([{ role: 'assistant', text: 'Could not load this conversation.' }]);
      }
    },
    [],
  );

  useEffect(() => {
    void refreshConversations();
    const c = searchParams.get('c');
    void openConversation(c);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  const lastAssistant = [...messages].reverse().find((m) => m.role !== 'user');
  const lastSources: Source[] = lastAssistant?.sources ?? [];

  const onCite = (n: number) => {
    setActiveSource(n);
    document.getElementById(`src-${n}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const send = async (text: string) => {
    const q = text.trim();
    if (!q || loading) return;
    setNotice('');
    setMessages((m) => [...m, { role: 'user', text: q }]);
    setInput('');
    setLoading(true);

    // Placeholder assistant message that fills in as tokens stream.
    const placeholder: Msg = { role: 'assistant', text: '', streaming: true };
    setMessages((m) => [...m, placeholder]);

    try {
      const res = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q, conversationId: activeId }),
      });
      if (!res.ok || !res.body) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? `Chat request failed (${res.status}).`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      // Mutable holder (not a narrowed `let`) because it is assigned inside
      // the applyTokens closure below.
      const doneRef: {
        current: {
          messageId?: string;
          conversationId?: string;
          sources?: Source[];
          confidence?: number;
          followUps?: string[];
          ticketId?: string | null;
        } | null;
      } = { current: null };

      const applyTokens = (chunk: string) => {
        buffer += chunk;
        const blocks = buffer.split('\n\n');
        buffer = blocks.pop() ?? '';
        for (const block of blocks) {
          const eventMatch = /^event: (\w+)\ndata: ([\s\S]*)$/.exec(block.trim());
          if (!eventMatch) continue;
          const [, event, json] = eventMatch;
          try {
            const data = JSON.parse(json) as { text?: string; message?: string };
            if (event === 'token' && typeof data.text === 'string') {
              const t = data.text;
              setMessages((m) => {
                const copy = [...m];
                const last = copy[copy.length - 1];
                if (last && last.streaming) last.text += t;
                return copy;
              });
            } else if (event === 'done') {
              doneRef.current = data as NonNullable<typeof doneRef.current>;
            } else if (event === 'error') {
              throw new Error(data.message ?? 'Streaming failed.');
            }
          } catch (e) {
            if (e instanceof Error && e.message !== 'Streaming failed.') continue;
            throw e;
          }
        }
      };

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        applyTokens(decoder.decode(value, { stream: true }));
      }
      applyTokens(decoder.decode());

      const dp = doneRef.current;
      setMessages((m) => {
        const copy = [...m];
        const last = copy[copy.length - 1];
        if (last && last.streaming) {
          copy[copy.length - 1] = {
            role: 'assistant',
            id: dp?.messageId,
            text: last.text,
            sources: dp?.sources ?? [],
            confidence: dp?.confidence ?? null,
            followUps: dp?.followUps ?? null,
            ticketId: dp?.ticketId ?? null,
            feedback: null,
          };
          if (dp?.ticketId) {
            setNotice(
              'This answer looked uncertain, so I opened a support ticket — a human will follow up here.',
            );
          }
        }
        return copy;
      });
      if (dp?.conversationId) {
        setActiveId(dp.conversationId);
        void refreshConversations();
      }
    } catch (e) {
      setMessages((m) => {
        const copy = [...m];
        const last = copy[copy.length - 1];
        if (last && last.streaming) {
          copy[copy.length - 1] = {
            role: 'assistant',
            text: `Error: ${e instanceof Error ? e.message : 'request failed'}`,
          };
        }
        return copy;
      });
    } finally {
      setLoading(false);
    }
  };

  const giveFeedback = async (messageId: string | undefined, rating: 1 | -1) => {
    if (!messageId) return;
    setMessages((m) =>
      m.map((msg) => (msg.id === messageId ? { ...msg, feedback: rating } : msg)),
    );
    try {
      await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId, rating }),
      });
    } catch {
      /* optimistic UI; log failure silently */
    }
  };

  const escalate = async () => {
    if (!activeId || escalating) return;
    setEscalating(true);
    setNotice('');
    try {
      const lastQ = [...messages].reverse().find((m) => m.role === 'user')?.text ?? '';
      const res = await fetch('/api/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId: activeId,
          reason: 'USER_REQUESTED',
          summary: `User requested human support: "${lastQ.slice(0, 120)}"`,
        }),
      });
      const data = (await res.json()) as { error?: string; ticket?: { id: string } };
      if (res.status === 401) {
        setNotice('Log in to file a support ticket — it takes 10 seconds.');
        return;
      }
      if (!res.ok) throw new Error(data.error ?? 'Could not create ticket.');
      setNotice(
        `Support ticket opened (#${(data.ticket?.id ?? '').slice(-6)}). An agent will reply here in the chat.`,
      );
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'Could not create ticket.');
    } finally {
      setEscalating(false);
    }
  };

  const newChat = () => {
    void openConversation(null);
  };

  const deleteChat = async (id: string) => {
    try {
      await fetch(`/api/conversations/${id}`, { method: 'DELETE' });
    } finally {
      if (activeId === id) void openConversation(null);
      void refreshConversations();
    }
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <FadeIn>
        <h1 className="mb-1 text-3xl font-bold">Support chat</h1>
        <p className="mb-6 text-slate-400">
          Answers stream in with citations, a confidence score, and follow-ups.
        </p>
      </FadeIn>

      {notice && (
        <div className="mb-4 rounded-xl border border-sky-500/30 bg-sky-500/10 px-4 py-3 text-sm text-sky-200">
          {notice}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-4">
        {/* Conversation sidebar */}
        <aside className="rounded-2xl border border-slate-800 bg-slate-900/40 p-3 lg:col-span-1">
          <button
            onClick={newChat}
            className="mb-3 w-full rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400"
          >
            + New chat
          </button>
          <div className="slim-scroll max-h-[52vh] space-y-1 overflow-y-auto">
            {conversations.length === 0 && (
              <p className="p-2 text-xs text-slate-500">No conversations yet.</p>
            )}
            {conversations.map((c) => (
              <div
                key={c.id}
                className={`group flex items-center rounded-lg transition ${
                  activeId === c.id ? 'bg-slate-800' : 'hover:bg-slate-800/60'
                }`}
              >
                <button
                  onClick={() => void openConversation(c.id)}
                  className="min-w-0 flex-1 truncate px-3 py-2 text-left text-sm text-slate-300"
                  title={c.title}
                >
                  {c.title}
                </button>
                <button
                  onClick={() => void deleteChat(c.id)}
                  title="Delete conversation"
                  className="mr-1 hidden rounded px-1.5 py-0.5 text-xs text-slate-500 hover:text-red-400 group-hover:block"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </aside>

        {/* Messages */}
        <div className="lg:col-span-2">
          <div
            ref={scrollRef}
            className="slim-scroll h-[52vh] space-y-4 overflow-y-auto rounded-2xl border border-slate-800 bg-slate-900/40 p-4"
          >
            {messages.map((msg, i) => (
              <div key={msg.id ?? i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[88%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-emerald-600 text-white'
                      : msg.role === 'agent'
                        ? 'border border-sky-500/40 bg-sky-500/10 text-slate-100'
                        : 'bg-slate-800 text-slate-100'
                  }`}
                >
                  {msg.role !== 'user' && msg.sources ? (
                    <CitedText text={msg.text} sources={msg.sources} onCite={onCite} />
                  ) : (
                    msg.text
                  )}
                  {msg.role === 'assistant' && !msg.streaming && (
                    <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-slate-700/60 pt-2">
                      {msg.confidence != null && <ConfidenceBadge value={msg.confidence} />}
                      <div className="flex gap-1">
                        <button
                          onClick={() => void giveFeedback(msg.id, 1)}
                          title="Helpful"
                          className={`rounded px-1.5 py-0.5 text-sm transition ${
                            msg.feedback === 1 ? 'bg-emerald-500/30' : 'hover:bg-slate-700'
                          }`}
                        >
                          👍
                        </button>
                        <button
                          onClick={() => void giveFeedback(msg.id, -1)}
                          title="Not helpful"
                          className={`rounded px-1.5 py-0.5 text-sm transition ${
                            msg.feedback === -1 ? 'bg-red-500/30' : 'hover:bg-slate-700'
                          }`}
                        >
                          👎
                        </button>
                      </div>
                      {msg.confidence != null && msg.confidence < 0.45 && !msg.ticketId && (
                        <button
                          onClick={() => void escalate()}
                          disabled={escalating}
                          className="rounded-full border border-amber-500/50 px-2 py-0.5 text-xs text-amber-300 transition hover:bg-amber-500/10 disabled:opacity-50"
                        >
                          Talk to a human
                        </button>
                      )}
                      {msg.ticketId && (
                        <span className="text-xs text-slate-500">ticket opened ✓</span>
                      )}
                    </div>
                  )}
                  {msg.followUps && msg.followUps.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {msg.followUps.map((f) => (
                        <button
                          key={f}
                          onClick={() => void send(f)}
                          className="rounded-full border border-slate-600 px-2 py-0.5 text-xs text-slate-300 transition hover:border-emerald-500/50 hover:text-emerald-300"
                        >
                          {f}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {loading && messages[messages.length - 1]?.streaming !== true && (
              <p className="text-sm text-slate-500">Thinking…</p>
            )}
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

          {activeId && (
            <button
              onClick={() => void escalate()}
              disabled={escalating}
              className="mt-2 text-xs text-slate-500 underline-offset-2 hover:text-slate-300 hover:underline disabled:opacity-50"
            >
              Talk to a human instead →
            </button>
          )}
        </div>

        {/* Sources panel */}
        <aside className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4 lg:col-span-1">
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

export default function ChatPage() {
  return (
    <Suspense fallback={<p className="mx-auto max-w-6xl px-4 py-10 text-slate-500">Loading chat…</p>}>
      <ChatInner />
    </Suspense>
  );
}
