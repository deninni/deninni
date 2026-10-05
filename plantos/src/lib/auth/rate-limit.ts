/** Einfacher In-Memory-Limiter gegen Login-Brute-Force (pro Prozess). */
const buckets = new Map<string, { count: number; reset: number }>();

export function rateLimit(key: string, limit = 8, windowMs = 5 * 60_000, now = Date.now()): { ok: boolean; retryAfterS: number } {
  const b = buckets.get(key);
  if (!b || b.reset < now) {
    buckets.set(key, { count: 1, reset: now + windowMs });
    return { ok: true, retryAfterS: 0 };
  }
  b.count++;
  if (b.count > limit) return { ok: false, retryAfterS: Math.ceil((b.reset - now) / 1000) };
  return { ok: true, retryAfterS: 0 };
}

export function resetRateLimit(key: string) {
  buckets.delete(key);
}
