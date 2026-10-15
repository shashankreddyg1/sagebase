import { PrismaClient } from '@prisma/client';

/** True when a Postgres connection string is configured. */
export const isDatabaseConfigured = Boolean(process.env.DATABASE_URL);

/** True when an OpenAI key is configured (embeddings + chat). */
export const isOpenAiConfigured = Boolean(process.env.OPENAI_API_KEY);

/**
 * Demo mode kicks in when either the database or the OpenAI key is missing.
 * The app then serves in-memory seed documents and mock answers, and says so
 * in the UI banner.
 */
export const isDemoMode = !isDatabaseConfigured || !isOpenAiConfigured;

declare global {
  // eslint-disable-next-line no-var
  var __sagebasePrisma: PrismaClient | undefined;
}

/**
 * Lazily create the Prisma client. Returns null when no DATABASE_URL is set,
 * so importing this module never throws in demo mode.
 */
export function getPrisma(): PrismaClient | null {
  if (!isDatabaseConfigured) return null;
  if (!global.__sagebasePrisma) {
    global.__sagebasePrisma = new PrismaClient();
  }
  return global.__sagebasePrisma;
}
