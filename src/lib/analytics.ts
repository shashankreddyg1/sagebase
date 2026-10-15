import { getPrisma } from './db';
import { demoAnalyticsInputs } from './demoStore';

export interface VolumePoint {
  date: string; // YYYY-MM-DD
  count: number;
}

export interface AnalyticsData {
  volume: VolumePoint[];
  /** Tickets per 100 conversations over the last 30 days. */
  escalationRate: number;
  avgConfidence: number | null;
  feedback: { up: number; down: number };
  p95LatencyMs: number | null;
  totals: {
    messages: number;
    conversations: number;
    tickets: number;
    openTickets: number;
  };
  /** True when the numbers come from labeled demo sample data. */
  sample: boolean;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function last14Days(): string[] {
  const out: string[] = [];
  const today = new Date();
  for (let i = 13; i >= 0; i--) {
    const d = new Date(today.getTime() - i * DAY_MS);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, idx))] ?? null;
}

async function liveAnalytics(): Promise<AnalyticsData> {
  const prisma = getPrisma();
  if (!prisma) throw new Error('liveAnalytics called without a database');

  const days = last14Days();
  const since14 = new Date(Date.now() - 14 * DAY_MS);
  const since30 = new Date(Date.now() - 30 * DAY_MS);

  // Assistant messages per day.
  const volRows = (await prisma.$queryRaw<{ day: string; count: bigint }[]>`
    SELECT to_char(date_trunc('day', "createdAt"), 'YYYY-MM-DD') AS day,
           COUNT(*) AS count
    FROM messages
    WHERE role = 'assistant' AND "createdAt" >= ${since14}
    GROUP BY 1
    ORDER BY 1`) as { day: string; count: bigint }[];
  const volMap = new Map(volRows.map((r) => [r.day, Number(r.count)]));
  const volume = days.map((date) => ({ date, count: volMap.get(date) ?? 0 }));

  const [ticketCount, convCount, openTickets, msgCount] = await Promise.all([
    prisma.ticket.count({ where: { createdAt: { gte: since30 } } }),
    prisma.conversation.count({ where: { createdAt: { gte: since30 } } }),
    prisma.ticket.count({ where: { status: { not: 'RESOLVED' } } }),
    prisma.message.count(),
  ]);

  const confAgg = await prisma.message.aggregate({
    _avg: { confidence: true },
    where: { confidence: { not: null } },
  });

  const fbRows = await prisma.feedback.groupBy({
    by: ['rating'],
    _count: { rating: true },
  });
  const feedback = { up: 0, down: 0 };
  for (const r of fbRows) {
    if (r.rating > 0) feedback.up += r._count.rating;
    else feedback.down += r._count.rating;
  }

  const p95Rows = (await prisma.$queryRaw<{ p95: number | null }[]>`
    SELECT percentile_cont(0.95) WITHIN GROUP (ORDER BY "latencyMs") AS p95
    FROM api_logs
    WHERE path LIKE '/api/chat%'`) as { p95: number | null }[];

  return {
    volume,
    escalationRate: convCount > 0 ? (ticketCount / convCount) * 100 : 0,
    avgConfidence: confAgg._avg.confidence,
    feedback,
    p95LatencyMs: p95Rows[0]?.p95 != null ? Math.round(Number(p95Rows[0].p95)) : null,
    totals: {
      messages: msgCount,
      conversations: convCount,
      tickets: ticketCount,
      openTickets,
    },
    sample: false,
  };
}

function demoAnalytics(): AnalyticsData {
  const { messages, apiLogs, tickets, feedbackCount } = demoAnalyticsInputs();
  const days = last14Days();
  const volMap = new Map<string, number>();
  const since14 = Date.now() - 14 * DAY_MS;
  const since30 = Date.now() - 30 * DAY_MS;

  let confSum = 0;
  let confN = 0;
  let convSet = new Set<string>();
  let tickets30 = 0;
  let convs30 = 0;

  for (const m of messages) {
    const ts = new Date(m.createdAt).getTime();
    if (m.role === 'assistant' && ts >= since14) {
      const day = m.createdAt.slice(0, 10);
      volMap.set(day, (volMap.get(day) ?? 0) + 1);
    }
    if (m.confidence != null) {
      confSum += m.confidence;
      confN++;
    }
    convSet.add(m.conversationId);
  }
  // Sample conversations are synthetic; approximate conversation count from
  // distinct conversation ids plus a share of the message volume.
  convs30 = convSet.size > 1 ? convSet.size : Math.max(1, Math.round(messages.length / 3));
  for (const t of tickets) {
    if (new Date(t.createdAt).getTime() >= since30) tickets30++;
  }

  const latencies = apiLogs
    .filter((l) => l.path.startsWith('/api/chat'))
    .map((l) => l.latencyMs)
    .sort((a, b) => a - b);

  return {
    volume: days.map((date) => ({ date, count: volMap.get(date) ?? 0 })),
    escalationRate: convs30 > 0 ? (tickets30 / convs30) * 100 : 0,
    avgConfidence: confN > 0 ? confSum / confN : null,
    feedback: feedbackCount,
    p95LatencyMs: percentile(latencies, 95),
    totals: {
      messages: messages.length,
      conversations: convs30,
      tickets: tickets.length,
      openTickets: tickets.filter((t) => t.status !== 'RESOLVED').length,
    },
    sample: true,
  };
}

export async function getAnalytics(): Promise<AnalyticsData> {
  const prisma = getPrisma();
  return prisma ? liveAnalytics() : demoAnalytics();
}
