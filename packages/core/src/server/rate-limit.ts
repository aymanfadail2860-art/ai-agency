import { createHash } from "node:crypto";
import { z } from "zod";
import { AppError } from "@agency/shared";
import { createCollectionStore, getStorageBackend } from "./json-store";

/**
 * Enkel in-memory rate limiting (fast vindue) pr. nøgle, fx `research:<ip>`.
 * Gælder kun én instans; `enforceSharedRateLimit` nedenfor tæller også i
 * Supabase, så grænsen holder på tværs af Vercels serverinstanser.
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

/* -------------------------------------------------------------------------- */
/* Delt rate limiting (serverless)                                            */
/* -------------------------------------------------------------------------- */

const RateWindowSchema = z.object({ id: z.string(), count: z.number().int().min(0), resetAt: z.number() });
const windowStore = createCollectionStore("platform", "rate-limits", RateWindowSchema);

/** IP-adresser gemmes ikke i klartekst — kun en kort, envejs-hashet nøgle (dataminimering). */
function hashKey(key: string): string {
  return createHash("sha256").update(key).digest("hex").slice(0, 24);
}

/**
 * Som `enforceRateLimit`, men tæller også i den fælles lagring, når platformen
 * kører på Supabase (Vercel), så grænsen gælder på tværs af serverinstanser.
 * Lokalt (filbaseret lagring) bruges kun hukommelsen.
 */
export async function enforceSharedRateLimit(key: string, options: RateLimitOptions): Promise<void> {
  enforceRateLimit(key, options);
  if (getStorageBackend() !== "supabase") return;
  const now = Date.now();
  const windowStart = Math.floor(now / options.windowMs) * options.windowMs;
  const id = `${hashKey(key)}-${windowStart}`;
  const resetAt = windowStart + options.windowMs;
  const updated = await windowStore.update(id, (w) => ({ ...w, count: w.count + 1 }));
  const count = updated ? updated.count : (await windowStore.upsert({ id, count: 1, resetAt })).count;
  if (count > options.limit) {
    const seconds = Math.max(1, Math.ceil((resetAt - now) / 1000));
    throw new AppError("rate_limited", `For mange forespørgsler. Prøv igen om ${seconds} sekunder.`);
  }
}
