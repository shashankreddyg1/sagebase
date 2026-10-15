import { randomUUID } from 'crypto';

/**
 * Demo-mode in-memory mirror of the v2 support tables. Used when no
 * DATABASE_URL is configured, so conversations, tickets, feedback and
 * analytics all work with zero config (data is ephemeral — it vanishes on
 * restart, exactly like the demo document store in demo.ts).
 */

export interface StoredConversation {
  id: string;
  userId: string | null;
  guestId: string | null;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface StoredMessage {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant' | 'agent';
  content: string;
  sources: unknown[] | null;
  confidence: number | null;
  latencyMs: number | null;
  followUps: string[] | null;
  createdAt: string;
}

export type TicketStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED';

export interface StoredTicketReply {
  id: string;
  ticketId: string;
  authorId: string | null;
  authorRole: string;
  content: string;
  createdAt: string;
}

export interface StoredTicket {
  id: string;
  conversationId: string | null;
  userId: string | null;
  guestId: string | null;
  status: TicketStatus;
  reason: string;
  summary: string;
  createdAt: string;
  resolvedAt: string | null;
  replies: StoredTicketReply[];
}

export interface StoredApiLog {
  id: string;
  userId: string | null;
  ip: string | null;
  method: string;
  path: string;
  statusCode: number;
  latencyMs: number;
  createdAt: string;
}

export interface Identity {
  userId: string | null;
  guestId: string | null;
}

interface DemoState {
  conversations: Map<string, StoredConversation>;
  messages: Map<string, StoredMessage[]>; // by conversationId
  messageById: Map<string, StoredMessage>;
  tickets: Map<string, StoredTicket>;
  feedback: Map<string, { rating: number; createdAt: string }>; // by messageId
  apiLogs: StoredApiLog[];
  sampleSeeded: boolean;
}

/**
 * All demo state lives on globalThis, NOT in module scope. Next.js bundles
 * each API route separately, so module-level Maps would be per-route and a
 * conversation created by /api/chat/stream would be invisible to
 * /api/conversations. globalThis is shared process-wide (same pattern as
 * the Prisma client singleton in db.ts).
 */
function state(): DemoState {
  const g = globalThis as unknown as { __sagebaseDemoStore?: DemoState };
  if (!g.__sagebaseDemoStore) {
    g.__sagebaseDemoStore = {
      conversations: new Map(),
      messages: new Map(),
      messageById: new Map(),
      tickets: new Map(),
      feedback: new Map(),
      apiLogs: [],
      sampleSeeded: false,
    };
  }
  return g.__sagebaseDemoStore;
}

const now = () => new Date().toISOString();

function matchesIdentity(
  c: { userId: string | null; guestId: string | null },
  id: Identity,
): boolean {
  if (id.userId) return c.userId === id.userId;
  if (id.guestId) return c.guestId === id.guestId;
  return false;
}

/* ------------------------------ conversations ------------------------------ */

export function demoListConversations(id: Identity): StoredConversation[] {
  return [...state().conversations.values()]
    .filter((c) => matchesIdentity(c, id))
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
}

export function demoCreateConversation(
  id: Identity,
  title = 'New conversation',
): StoredConversation {
  const c: StoredConversation = {
    id: `conv-${randomUUID()}`,
    userId: id.userId,
    guestId: id.guestId,
    title,
    createdAt: now(),
    updatedAt: now(),
  };
  state().conversations.set(c.id, c);
  state().messages.set(c.id, []);
  return c;
}

export function demoGetConversation(convId: string, id: Identity): StoredConversation | null {
  const c = state().conversations.get(convId);
  if (!c || !matchesIdentity(c, id)) return null;
  return c;
}

export function demoDeleteConversation(convId: string, id: Identity): boolean {
  const c = demoGetConversation(convId, id);
  if (!c) return false;
  for (const m of state().messages.get(convId) ?? []) state().messageById.delete(m.id);
  state().messages.delete(convId);
  state().conversations.delete(convId);
  return true;
}

export function demoListMessages(convId: string): StoredMessage[] {
  return [...(state().messages.get(convId) ?? [])].sort((a, b) =>
    a.createdAt < b.createdAt ? -1 : 1,
  );
}

export function demoAddMessage(input: {
  conversationId: string;
  role: StoredMessage['role'];
  content: string;
  sources?: unknown[] | null;
  confidence?: number | null;
  latencyMs?: number | null;
  followUps?: string[] | null;
}): StoredMessage {
  const m: StoredMessage = {
    id: `msg-${randomUUID()}`,
    conversationId: input.conversationId,
    role: input.role,
    content: input.content,
    sources: input.sources ?? null,
    confidence: input.confidence ?? null,
    latencyMs: input.latencyMs ?? null,
    followUps: input.followUps ?? null,
    createdAt: now(),
  };
  const list = state().messages.get(input.conversationId) ?? [];
  list.push(m);
  state().messages.set(input.conversationId, list);
  state().messageById.set(m.id, m);
  const conv = state().conversations.get(input.conversationId);
  if (conv) {
    conv.updatedAt = now();
    if (conv.title === 'New conversation' && input.role === 'user') {
      conv.title = input.content.slice(0, 48) + (input.content.length > 48 ? '…' : '');
    }
  }
  return m;
}

export function demoGetMessage(messageId: string): StoredMessage | null {
  return state().messageById.get(messageId) ?? null;
}

/* --------------------------------- state().tickets --------------------------------- */

export function demoCreateTicket(input: {
  conversationId?: string | null;
  userId: string | null;
  guestId: string | null;
  reason: string;
  summary: string;
}): StoredTicket {
  const t: StoredTicket = {
    id: `tkt-${randomUUID()}`,
    conversationId: input.conversationId ?? null,
    userId: input.userId,
    guestId: input.guestId,
    status: 'OPEN',
    reason: input.reason,
    summary: input.summary,
    createdAt: now(),
    resolvedAt: null,
    replies: [],
  };
  state().tickets.set(t.id, t);
  return t;
}

/** One open ticket per conversation max — avoids duplicate escalations. */
export function demoFindOpenTicketForConversation(convId: string): StoredTicket | null {
  for (const t of state().tickets.values()) {
    if (t.conversationId === convId && t.status !== 'RESOLVED') return t;
  }
  return null;
}

export function demoListTickets(id: Identity, all: boolean): StoredTicket[] {
  return [...state().tickets.values()]
    .filter((t) => (all ? true : matchesIdentity(t, id)))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export function demoGetTicket(ticketId: string): StoredTicket | null {
  return state().tickets.get(ticketId) ?? null;
}

export function demoUpdateTicketStatus(
  ticketId: string,
  status: TicketStatus,
): StoredTicket | null {
  const t = state().tickets.get(ticketId);
  if (!t) return null;
  t.status = status;
  t.resolvedAt = status === 'RESOLVED' ? now() : null;
  return t;
}

export function demoAddTicketReply(input: {
  ticketId: string;
  authorId: string | null;
  authorRole: string;
  content: string;
}): StoredTicketReply | null {
  const t = state().tickets.get(input.ticketId);
  if (!t) return null;
  const r: StoredTicketReply = {
    id: `rpl-${randomUUID()}`,
    ticketId: t.id,
    authorId: input.authorId,
    authorRole: input.authorRole,
    content: input.content,
    createdAt: now(),
  };
  t.replies.push(r);
  // Mirror the reply into the linked conversation so the requester sees it.
  if (t.conversationId) {
    demoAddMessage({
      conversationId: t.conversationId,
      role: 'agent',
      content: `Support agent: ${input.content}`,
    });
  }
  return r;
}

/* --------------------------------- state().feedback -------------------------------- */

export function demoSetFeedback(messageId: string, rating: number): boolean {
  if (!state().messageById.has(messageId)) return false;
  state().feedback.set(messageId, { rating: rating > 0 ? 1 : -1, createdAt: now() });
  return true;
}

/* --------------------------------- api logs -------------------------------- */

const MAX_API_LOGS = 2000;

export function demoLogApi(entry: Omit<StoredApiLog, 'id' | 'createdAt'>): void {
  state().apiLogs.push({ ...entry, id: `log-${randomUUID()}`, createdAt: now() });
  if (state().apiLogs.length > MAX_API_LOGS) state().apiLogs.splice(0, state().apiLogs.length - MAX_API_LOGS);
}

export function demoGetApiLogs(): StoredApiLog[] {
  return state().apiLogs;
}

/* ------------------------- sample analytics dataset ------------------------ */
/* Deterministic, clearly-labeled sample data so the admin dashboard renders   */
/* something useful in demo mode before real traffic exists.                   */

let sampleSeeded = false;

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

export function ensureSampleAnalytics(): void {
  if (state().sampleSeeded || state().messages.size > 0 || state().apiLogs.length > 0) {
    state().sampleSeeded = true;
    return;
  }
  state().sampleSeeded = true;
  const rand = seededRandom(42);
  const dayMs = 24 * 60 * 60 * 1000;
  const base = Date.now() - 14 * dayMs;

  for (let d = 0; d < 14; d++) {
    const dayStart = base + d * dayMs;
    const n = 4 + Math.floor(rand() * 14); // 4..17 chats per day
    for (let i = 0; i < n; i++) {
      const ts = new Date(dayStart + Math.floor(rand() * dayMs)).toISOString();
      const conf = 0.35 + rand() * 0.6;
      const latency = 400 + Math.floor(rand() * 2600);
      state().apiLogs.push({
        id: `sample-log-${d}-${i}`,
        userId: null,
        ip: '127.0.0.1',
        method: 'POST',
        path: '/api/chat/stream',
        statusCode: 200,
        latencyMs: latency,
        createdAt: ts,
      });
      const msgId = `sample-msg-${d}-${i}`;
      const msg: StoredMessage = {
        id: msgId,
        conversationId: 'sample',
        role: 'assistant',
        content: 'sample',
        sources: null,
        confidence: Math.round(conf * 100) / 100,
        latencyMs: latency,
        followUps: null,
        createdAt: ts,
      };
      state().messageById.set(msgId, msg);
      if (rand() < 0.45) {
        state().feedback.set(msgId, {
          rating: rand() < 0.78 ? 1 : -1,
          createdAt: ts,
        });
      }
      if (conf < 0.45 && rand() < 0.7) {
        state().tickets.set(`sample-tkt-${d}-${i}`, {
          id: `sample-tkt-${d}-${i}`,
          conversationId: null,
          userId: null,
          guestId: null,
          status: rand() < 0.6 ? 'RESOLVED' : 'OPEN',
          reason: 'LOW_CONFIDENCE',
          summary: 'Sample low-confidence escalation',
          createdAt: ts,
          resolvedAt: null,
          replies: [],
        });
      }
    }
  }
}

export function demoAnalyticsInputs(): {
  messages: StoredMessage[];
  apiLogs: StoredApiLog[];
  tickets: StoredTicket[];
  feedbackCount: { up: number; down: number };
} {
  ensureSampleAnalytics();
  let up = 0;
  let down = 0;
  for (const f of state().feedback.values()) {
    if (f.rating > 0) up++;
    else down++;
  }
  return {
    messages: [...state().messageById.values()],
    apiLogs: [...state().apiLogs],
    tickets: [...state().tickets.values()],
    feedbackCount: { up, down },
  };
}
