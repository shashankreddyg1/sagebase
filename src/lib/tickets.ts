import { getPrisma } from './db';
import {
  demoCreateTicket,
  demoFindOpenTicketForConversation,
  demoListTickets,
  demoGetTicket,
  demoUpdateTicketStatus,
  demoAddTicketReply,
  type Identity,
  type TicketStatus,
} from './demoStore';

export type { TicketStatus };

export interface TicketReplyDTO {
  id: string;
  authorId: string | null;
  authorRole: string;
  authorName: string | null;
  content: string;
  createdAt: string;
}

export interface TicketDTO {
  id: string;
  conversationId: string | null;
  userId: string | null;
  guestId: string | null;
  status: TicketStatus;
  reason: string;
  summary: string;
  createdAt: string;
  resolvedAt: string | null;
  userEmail: string | null;
  replies: TicketReplyDTO[];
}

export async function createTicket(input: {
  conversationId?: string | null;
  id: Identity;
  reason: string;
  summary: string;
  /** When true, reuse an existing open ticket for the conversation. */
  dedupe?: boolean;
}): Promise<TicketDTO> {
  const prisma = getPrisma();
  if (!prisma) {
    if (input.dedupe && input.conversationId) {
      const existing = demoFindOpenTicketForConversation(input.conversationId);
      if (existing) return toDTO(existing, null);
    }
    return toDTO(
      demoCreateTicket({
        conversationId: input.conversationId,
        userId: input.id.userId,
        guestId: input.id.guestId,
        reason: input.reason,
        summary: input.summary,
      }),
      null,
    );
  }

  if (input.dedupe && input.conversationId) {
    const existing = await prisma.ticket.findFirst({
      where: {
        conversationId: input.conversationId,
        status: { not: 'RESOLVED' },
      },
      include: { replies: { include: { author: true } }, user: true },
    });
    if (existing) return toDbDTO(existing);
  }

  const t = await prisma.ticket.create({
    data: {
      conversationId: input.conversationId ?? undefined,
      userId: input.id.userId,
      guestId: input.id.guestId,
      reason: input.reason,
      summary: input.summary,
    },
    include: { replies: { include: { author: true } }, user: true },
  });
  return toDbDTO(t);
}

export async function listTickets(
  id: Identity,
  all: boolean,
): Promise<TicketDTO[]> {
  const prisma = getPrisma();
  if (!prisma) return demoListTickets(id, all).map((t) => toDTO(t, null));
  const where = all
    ? {}
    : id.userId
      ? { userId: id.userId }
      : { guestId: id.guestId ?? undefined };
  const rows = await prisma.ticket.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: { replies: { include: { author: true }, orderBy: { createdAt: 'asc' } }, user: true },
  });
  return rows.map(toDbDTO);
}

export async function getTicket(ticketId: string): Promise<TicketDTO | null> {
  const prisma = getPrisma();
  if (!prisma) {
    const t = demoGetTicket(ticketId);
    return t ? toDTO(t, null) : null;
  }
  const t = await prisma.ticket.findUnique({
    where: { id: ticketId },
    include: { replies: { include: { author: true }, orderBy: { createdAt: 'asc' } }, user: true },
  });
  return t ? toDbDTO(t) : null;
}

export async function setTicketStatus(
  ticketId: string,
  status: TicketStatus,
): Promise<TicketDTO | null> {
  const prisma = getPrisma();
  if (!prisma) {
    const t = demoUpdateTicketStatus(ticketId, status);
    return t ? toDTO(t, null) : null;
  }
  const t = await prisma.ticket.update({
    where: { id: ticketId },
    data: { status, resolvedAt: status === 'RESOLVED' ? new Date() : null },
    include: { replies: { include: { author: true }, orderBy: { createdAt: 'asc' } }, user: true },
  });
  return toDbDTO(t);
}

export async function addTicketReply(input: {
  ticketId: string;
  authorId: string | null;
  authorRole: string;
  content: string;
}): Promise<TicketReplyDTO | null> {
  const prisma = getPrisma();
  if (!prisma) {
    const r = demoAddTicketReply(input);
    return r
      ? {
          id: r.id,
          authorId: r.authorId,
          authorRole: r.authorRole,
          authorName: null,
          content: r.content,
          createdAt: r.createdAt,
        }
      : null;
  }
  const ticket = await prisma.ticket.findUnique({
    where: { id: input.ticketId },
    select: { conversationId: true },
  });
  if (!ticket) return null;
  const r = await prisma.ticketReply.create({
    data: {
      ticketId: input.ticketId,
      authorId: input.authorId,
      authorRole: input.authorRole,
      content: input.content,
    },
    include: { author: true },
  });
  // Mirror the reply into the linked conversation so the requester sees it.
  if (ticket.conversationId) {
    await prisma.message.create({
      data: {
        conversationId: ticket.conversationId,
        role: 'agent',
        content: `Support agent: ${input.content}`,
      },
    });
  }
  return {
    id: r.id,
    authorId: r.authorId,
    authorRole: r.authorRole,
    authorName: r.author?.name ?? r.author?.email ?? null,
    content: r.content,
    createdAt: r.createdAt.toISOString(),
  };
}

/* ------------------------------- DTO mappers ------------------------------ */

function toDTO(
  t: {
    id: string;
    conversationId: string | null;
    userId: string | null;
    guestId: string | null;
    status: TicketStatus;
    reason: string;
    summary: string;
    createdAt: string;
    resolvedAt: string | null;
    replies: Array<{
      id: string;
      authorId: string | null;
      authorRole: string;
      content: string;
      createdAt: string;
    }>;
  },
  userEmail: string | null,
): TicketDTO {
  return {
    id: t.id,
    conversationId: t.conversationId,
    userId: t.userId,
    guestId: t.guestId,
    status: t.status,
    reason: t.reason,
    summary: t.summary,
    createdAt: t.createdAt,
    resolvedAt: t.resolvedAt,
    userEmail,
    replies: t.replies.map((r) => ({
      id: r.id,
      authorId: r.authorId,
      authorRole: r.authorRole,
      authorName: null,
      content: r.content,
      createdAt: r.createdAt,
    })),
  };
}

type DbTicket = {
  id: string;
  conversationId: string | null;
  userId: string | null;
  guestId: string | null;
  status: TicketStatus;
  reason: string;
  summary: string;
  createdAt: Date;
  resolvedAt: Date | null;
  user: { email: string } | null;
  replies: Array<{
    id: string;
    authorId: string | null;
    authorRole: string;
    content: string;
    createdAt: Date;
    author: { name: string | null; email: string } | null;
  }>;
};

function toDbDTO(t: DbTicket): TicketDTO {
  return {
    id: t.id,
    conversationId: t.conversationId,
    userId: t.userId,
    guestId: t.guestId,
    status: t.status,
    reason: t.reason,
    summary: t.summary,
    createdAt: t.createdAt.toISOString(),
    resolvedAt: t.resolvedAt?.toISOString() ?? null,
    userEmail: t.user?.email ?? null,
    replies: t.replies.map((r) => ({
      id: r.id,
      authorId: r.authorId,
      authorRole: r.authorRole,
      authorName: r.author?.name ?? r.author?.email ?? null,
      content: r.content,
      createdAt: r.createdAt.toISOString(),
    })),
  };
}
