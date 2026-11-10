/**
 * Rate limiting en memoria (ventana deslizante) para /login y /signup (§6).
 * NOTA: en un despliegue multi-instancia esto debe moverse a Postgres o Redis,
 * porque cada réplica tendría su propio Map y el límite se repartiría.
 */
interface Bucket {
  count: number;
  firstAt: number;
}

const buckets = new Map<string, Bucket>();

export interface RateLimitResult {
  ok: boolean;
  retryAfterSec: number;
}

export function rateLimit(key: string, max: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const entry = buckets.get(key);
  if (!entry || now - entry.firstAt > windowMs) {
    buckets.set(key, { count: 1, firstAt: now });
    return { ok: true, retryAfterSec: 0 };
  }
  entry.count += 1;
  if (entry.count > max) {
    return { ok: false, retryAfterSec: Math.ceil((windowMs - (now - entry.firstAt)) / 1000) };
  }
  return { ok: true, retryAfterSec: 0 };
}

/** Limpieza puntual para que el Map no crezca sin límite. */
export function cleanupRateLimit(now = Date.now(), windowMs = 5 * 60 * 1000): void {
  for (const [k, v] of buckets) {
    if (now - v.firstAt > windowMs) buckets.delete(k);
  }
}