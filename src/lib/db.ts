import { PrismaClient } from '@prisma/client';

/** True when a Postgres connection string is configured. */
export const isDatabaseConfigured = Boolean(process.env.DATABASE_URL);

/** True when a Gemini key is configured (embeddings + chat, free tier). */
export const isAiConfigured = Boolean(process.env.GEMINI_API_KEY);

/**
 * Demo mode kicks in when either the database or the Gemini key is missing.
 * The app then serves in-memory seed documents and mock answers, and says so
 * in the UI banner.
 */
export const isDemoMode = !isDatabaseConfigured || !isAiConfigured;

declare global {
  // eslint-disable-next-line no-var
  var __sagebasePrisma: PrismaClient | undefined;
}

/**
 * Lazily create the Prisma client. Returns null in demo mode (no DATABASE_URL
 * or no GEMINI_API_KEY) so the app is fully in-memory and never touches the
 * database then — importing this module never throws, and demo logins, chat,
 * tickets, etc. all work with zero config.
 */
export function getPrisma(): PrismaClient | null {
  if (isDemoMode) return null;
  if (!global.__sagebasePrisma) {
    global.__sagebasePrisma = new PrismaClient();
  }
  return global.__sagebasePrisma;
}
