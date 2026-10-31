import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod";
import { enforceSharedRateLimit, type RateLimitOptions } from "@agency/core/server";
import { AppError, isAppError } from "@agency/shared";

/**
 * Fælles håndtering for API-routes: ensartede fejlsvar, Zod-validering og
 * skjulte interne fejl (stacktraces sendes aldrig til klienten).
 */
export function errorResponse(err: unknown) {
  if (isAppError(err)) {
    return NextResponse.json({ error: { code: err.code, message: err.message } }, { status: err.status });
  }
  if (err instanceof ZodError) {
    const message = err.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("; ");
    return NextResponse.json({ error: { code: "validation_error", message: `Ugyldige data — ${message}` } }, { status: 400 });
  }
  if (err instanceof SyntaxError) {
    return NextResponse.json({ error: { code: "validation_error", message: "Ugyldig JSON i forespørgslen." } }, { status: 400 });
  }
  console.error("[api] uventet fejl", err);
  return NextResponse.json({ error: { code: "internal_error", message: "Der opstod en uventet fejl." } }, { status: 500 });
}

type Handler<C> = (req: NextRequest, ctx: C) => Promise<Response> | Response;

/**
 * Misbrugsbeskyttelse for den offentlige demo (ingen login i V1): alle
 * muterende kald begrænses pr. klient og samlet for hele platformen.
 */
const perMinute = Number(process.env.WRITE_RATE_LIMIT_PER_MINUTE);
export const WRITE_LIMITS = {
  // Standard 60/min pr. klient; kan hæves via WRITE_RATE_LIMIT_PER_MINUTE (fx i e2e-testserveren).
  perClient: { limit: Number.isFinite(perMinute) && perMinute > 0 ? perMinute : 60, windowMs: 60_000 },
  global: { limit: 3000, windowMs: 60 * 60_000 },
} as const;

export function route<C = unknown>(handler: Handler<C>): Handler<C> {
  return async (req, ctx) => {
    try {
      if (req.method !== "GET" && req.method !== "HEAD") {
        await rateLimit(req, "write", WRITE_LIMITS.perClient);
        await enforceSharedRateLimit("write:global", WRITE_LIMITS.global);
      }
      return await handler(req, ctx);
    } catch (err) {
      return errorResponse(err);
    }
  };
}

const MAX_BODY_BYTES = 512 * 1024;

export async function readJson(req: NextRequest): Promise<unknown> {
  const length = Number(req.headers.get("content-length") ?? 0);
  if (length > MAX_BODY_BYTES) throw new AppError("validation_error", "Forespørgslen er for stor.");
  const text = await req.text();
  if (text.length > MAX_BODY_BYTES) throw new AppError("validation_error", "Forespørgslen er for stor.");
  return text ? JSON.parse(text) : {};
}

export function clientKey(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "local";
}

export async function rateLimit(req: NextRequest, bucket: string, options: RateLimitOptions) {
  await enforceSharedRateLimit(`${bucket}:${clientKey(req)}`, options);
}

export const json = (data: unknown, status = 200) => NextResponse.json(data, { status });
