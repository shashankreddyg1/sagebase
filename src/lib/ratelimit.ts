/**
 * In-memory sliding-window rate limiter.
 *
 * Zero dependencies and good enough for a demo / single-instance deployment.
 * On serverless (Vercel) each instance keeps its own counters, so this is
 * approximate under concurrency — a production deployment would use a shared
 * store like Upstash Redis. See README tradeoffs.
 */

const hits = new Map<string, number[]>();

export interface RateLimitResult {
  allowed: boolean;
  /** Milliseconds until the oldest hit in the window expires. */
  retryAfterMs: number;
}

export function checkRateLimit(
  key: string,
  limit = 30,
  windowMs = 60_000,
): RateLimitResult {
  const now = Date.now();
  const cutoff = now - windowMs;
  let arr = hits.get(key);
  if (!arr) {
    arr = [];
    hits.set(key, arr);
  }
  // Drop expired hits (arrays stay short; splice in place).
  let drop = 0;
  while (drop < arr.length && (arr[drop] ?? 0) <= cutoff) drop++;
  if (drop > 0) arr.splice(0, drop);

  if (arr.length >= limit) {
    const oldest = arr[0] ?? now;
    return { allowed: false, retryAfterMs: Math.max(0, oldest + windowMs - now) };
  }
  arr.push(now);
  return { allowed: true, retryAfterMs: 0 };
}

/** Forget all counters (used by tests). */
export function resetRateLimits(): void {
  hits.clear();
}
