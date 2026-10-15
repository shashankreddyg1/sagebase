import { getPrisma } from './db';
import {
  demoListConversations,
  demoCreateConversation,
  demoGetConversation,
  demoDeleteConversation,
  demoListMessages,
  demoAddMessage,
  type Identity,
  type StoredMessage,
} from './demoStore';

export type { Identity };

export interface MessageDTO {
  id: string;
  role: 'user' | 'assistant' | 'agent';
  content: string;
  sources: unknown[] | null;
  confidence: number | null;
  latencyMs: number | null;
  followUps: string[] | null;
  createdAt: string;
  feedback: number | null;
}

export interface ConversationDTO {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

function toMessageDTO(m: StoredMessage, fb: number | null = null): MessageDTO {
  return {
    id: m.id,
    role: m.role,
    content: m.content,
    sources: m.sources,
    confidence: m.confidence,
    latencyMs: m.latencyMs,
    followUps: m.followUps,
    createdAt: m.createdAt,
    feedback: fb,
  };
}

export async function listConversations(id: Identity): Promise<ConversationDTO[]> {
  const prisma = getPrisma();
  if (!prisma) {
    return demoListConversations(id).map((c) => ({
      id: c.id,
      title: c.title,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    }));
  }
  const where = id.userId ? { userId: id.userId } : { guestId: id.guestId ?? undefined };
  const rows = await prisma.conversation.findMany({
    where,
    orderBy: { updatedAt: 'desc' },
    take: 50,
  });
  return rows.map((c) => ({
    id: c.id,
    title: c.title,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  }));
}

export async function createConversation(
  id: Identity,
  title = 'New conversation',
): Promise<ConversationDTO> {
  const prisma = getPrisma();
  if (!prisma) {
    const c = demoCreateConversation(id, title);
    return { id: c.id, title: c.title, createdAt: c.createdAt, updatedAt: c.updatedAt };
  }
  const c = await prisma.conversation.create({
    data: { userId: id.userId, guestId: id.guestId, title },
  });
  return {
    id: c.id,
    title: c.title,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}

export async function getConversationWithMessages(
  convId: string,
  id: Identity,
): Promise<{ conversation: ConversationDTO; messages: MessageDTO[] } | null> {
  const prisma = getPrisma();
  if (!prisma) {
    const c = demoGetConversation(convId, id);
    if (!c) return null;
    return {
      conversation: {
        id: c.id,
        title: c.title,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
      },
      messages: demoListMessages(convId).map((m) => toMessageDTO(m)),
    };
  }
  const c = await prisma.conversation.findFirst({
    where: {
      id: convId,
      ...(id.userId ? { userId: id.userId } : { guestId: id.guestId ?? undefined }),
    },
    include: { messages: { orderBy: { createdAt: 'asc' }, include: { feedback: true } } },
  });
  if (!c) return null;
  return {
    conversation: {
      id: c.id,
      title: c.title,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
    },
    messages: c.messages.map((m) =>
      toMessageDTO(
        {
          id: m.id,
          conversationId: m.conversationId,
          role: m.role as StoredMessage['role'],
          content: m.content,
          sources: (m.sources as unknown[]) ?? null,
          confidence: m.confidence,
          latencyMs: m.latencyMs,
          followUps: (m.followUps as string[]) ?? null,
          createdAt: m.createdAt.toISOString(),
        },
        m.feedback?.rating ?? null,
      ),
    ),
  };
}

export async function deleteConversation(convId: string, id: Identity): Promise<boolean> {
  const prisma = getPrisma();
  if (!prisma) return demoDeleteConversation(convId, id);
  const res = await prisma.conversation.deleteMany({
    where: {
      id: convId,
      ...(id.userId ? { userId: id.userId } : { guestId: id.guestId ?? undefined }),
    },
  });
  return res.count > 0;
}

export async function addMessage(input: {
  conversationId: string;
  role: 'user' | 'assistant' | 'agent';
  content: string;
  sources?: unknown[] | null;
  confidence?: number | null;
  latencyMs?: number | null;
  followUps?: string[] | null;
}): Promise<MessageDTO> {
  const prisma = getPrisma();
  if (!prisma) {
    return toMessageDTO(demoAddMessage(input));
  }
  const m = await prisma.message.create({
    data: {
      conversationId: input.conversationId,
      role: input.role,
      content: input.content,
      sources: (input.sources ?? undefined) as never,
      confidence: input.confidence ?? undefined,
      latencyMs: input.latencyMs ?? undefined,
      followUps: (input.followUps ?? undefined) as never,
    },
  });
  await prisma.conversation.update({
    where: { id: input.conversationId },
    data: { updatedAt: new Date() },
  });
  // Auto-title from the first user message.
  if (input.role === 'user') {
    const conv = await prisma.conversation.findUnique({
      where: { id: input.conversationId },
      select: { title: true },
    });
    if (conv && conv.title === 'New conversation') {
      await prisma.conversation.update({
        where: { id: input.conversationId },
        data: {
          title:
            input.content.slice(0, 48) + (input.content.length > 48 ? '…' : ''),
        },
      });
    }
  }
  return toMessageDTO(
    {
      id: m.id,
      conversationId: m.conversationId,
      role: m.role as StoredMessage['role'],
      content: m.content,
      sources: (m.sources as unknown[]) ?? null,
      confidence: m.confidence,
      latencyMs: m.latencyMs,
      followUps: (m.followUps as string[]) ?? null,
      createdAt: m.createdAt.toISOString(),
    },
    null,
  );
}

export async function setFeedback(
  messageId: string,
  rating: number,
): Promise<boolean> {
  const prisma = getPrisma();
  const r = rating > 0 ? 1 : -1;
  if (!prisma) {
    const { demoSetFeedback } = await import('./demoStore');
    return demoSetFeedback(messageId, r);
  }
  const msg = await prisma.message.findUnique({ where: { id: messageId } });
  if (!msg) return false;
  await prisma.feedback.upsert({
    where: { messageId },
    update: { rating: r },
    create: { messageId, rating: r },
  });
  return true;
}
