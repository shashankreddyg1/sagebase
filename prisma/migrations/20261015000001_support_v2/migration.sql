-- SageBase v2: AI Customer Support Agent layer.
--
-- Adds users with roles, persistent conversations, per-message confidence and
-- feedback, support tickets with agent replies, and an API request log that
-- feeds the admin analytics dashboard.
--
-- All tables are plain relational (no pgvector columns), so they are fully
-- modeled in schema.prisma. This SQL mirrors what `prisma migrate dev` would
-- generate: enum types, tables with Prisma's naming conventions
-- (@@map table names, FK constraint names), and indexes.

-- Enums
CREATE TYPE "Role" AS ENUM ('ADMIN', 'SUPPORT_AGENT', 'END_USER');
CREATE TYPE "TicketStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED');

-- Users (auth: credentials login, see src/lib/auth.ts)
CREATE TABLE "users" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "name" TEXT,
  "passwordHash" TEXT NOT NULL,
  "role" "Role" NOT NULL DEFAULT 'END_USER',
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- Conversations (chat threads; userId null for anonymous guest sessions)
CREATE TABLE "conversations" (
  "id" TEXT NOT NULL,
  "userId" TEXT,
  "guestId" TEXT,
  "title" TEXT NOT NULL DEFAULT 'New conversation',
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "conversations"
  ADD CONSTRAINT "conversations_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "conversations_userId_idx" ON "conversations"("userId");
CREATE INDEX "conversations_guestId_idx" ON "conversations"("guestId");

-- Messages (persisted chat turns)
CREATE TABLE "messages" (
  "id" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "sources" JSONB,
  "confidence" DOUBLE PRECISION,
  "latencyMs" INTEGER,
  "followUps" JSONB,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "messages"
  ADD CONSTRAINT "messages_conversationId_fkey"
  FOREIGN KEY ("conversationId") REFERENCES "conversations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "messages_conversationId_idx" ON "messages"("conversationId");

-- Support tickets (escalations)
CREATE TABLE "tickets" (
  "id" TEXT NOT NULL,
  "conversationId" TEXT,
  "guestId" TEXT,
  "userId" TEXT,
  "status" "TicketStatus" NOT NULL DEFAULT 'OPEN',
  "reason" TEXT NOT NULL DEFAULT 'USER_REQUESTED',
  "summary" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt" TIMESTAMPTZ(3),
  CONSTRAINT "tickets_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "tickets"
  ADD CONSTRAINT "tickets_conversationId_fkey"
  FOREIGN KEY ("conversationId") REFERENCES "conversations"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "tickets"
  ADD CONSTRAINT "tickets_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "tickets_status_idx" ON "tickets"("status");
CREATE INDEX "tickets_userId_idx" ON "tickets"("userId");
CREATE INDEX "tickets_guestId_idx" ON "tickets"("guestId");

-- Agent replies on tickets (also mirrored into the linked conversation)
CREATE TABLE "ticket_replies" (
  "id" TEXT NOT NULL,
  "ticketId" TEXT NOT NULL,
  "authorId" TEXT,
  "authorRole" TEXT NOT NULL DEFAULT 'SUPPORT_AGENT',
  "content" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ticket_replies_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "ticket_replies"
  ADD CONSTRAINT "ticket_replies_ticketId_fkey"
  FOREIGN KEY ("ticketId") REFERENCES "tickets"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ticket_replies"
  ADD CONSTRAINT "ticket_replies_authorId_fkey"
  FOREIGN KEY ("authorId") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "ticket_replies_ticketId_idx" ON "ticket_replies"("ticketId");

-- Thumbs up/down per assistant message (one row per message)
CREATE TABLE "feedback" (
  "id" TEXT NOT NULL,
  "messageId" TEXT NOT NULL,
  "rating" INTEGER NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "feedback_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "feedback"
  ADD CONSTRAINT "feedback_messageId_fkey"
  FOREIGN KEY ("messageId") REFERENCES "messages"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
CREATE UNIQUE INDEX "feedback_messageId_key" ON "feedback"("messageId");

-- API request log (rate limiting observability + analytics input)
CREATE TABLE "api_logs" (
  "id" TEXT NOT NULL,
  "userId" TEXT,
  "ip" TEXT,
  "method" TEXT NOT NULL,
  "path" TEXT NOT NULL,
  "statusCode" INTEGER NOT NULL,
  "latencyMs" INTEGER NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "api_logs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "api_logs_createdAt_idx" ON "api_logs"("createdAt");
CREATE INDEX "api_logs_path_idx" ON "api_logs"("path");
