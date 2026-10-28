import { AppError } from "@agency/shared";

/**
 * Enkel in-memory rate limiting (fast vindue) pr. nøgle, fx `research:<ip>`.
 * Tilstrækkeligt til én lokal instans; i produktion skal en delt lagring
 * (fx Redis/Upstash) bruges, så grænsen gælder på tværs af instanser.
 */
interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

export interface RateLimitOptions {
  limit: number;
  windowMs: number;
}

export function checkRateLimit(key: string, { limit, windowMs }: RateLimitOptions, now = Date.now()) {
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, resetAt: now + windowMs };
  }
  bucket.count += 1;
  return { allowed: bucket.count <= limit, remaining: Math.max(0, limit - bucket.count), resetAt: bucket.resetAt };
}

export function enforceRateLimit(key: string, options: RateLimitOptions): void {
  const result = checkRateLimit(key, options);
  if (!result.allowed) {
    const seconds = Math.ceil((result.resetAt - Date.now()) / 1000);
    throw new AppError("rate_limited", `For mange forespørgsler. Prøv igen om ${seconds} sekunder.`);
  }
}

export function resetRateLimits(): void {
  buckets.clear();
}
