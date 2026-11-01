import { z } from "zod";
import { assertSharedRateLimitAvailable, enforceSharedRateLimit } from "@agency/core/server";
import { AppError } from "@agency/shared";
import { json, publicRoute, rateLimit, readJson } from "@/lib/http";
import { safeNextPath } from "@/lib/auth/access";
import { hasPlatformAccess, roleOf } from "@/lib/auth/roles";
import { createSessionClient } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

const LoginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Angiv en gyldig e-mail.").max(254),
  password: z.string().min(1, "Angiv adgangskode.").max(200),
  next: z.string().max(500).optional(),
});

const INVALID = "E-mail eller adgangskode er forkert.";
// Standard 10 forsøg pr. IP pr. 15 min (kan kun hæves eksplicit, fx for e2e-testserveren). Pr. e-mail altid 5.
const ipLimit = Number(process.env.LOGIN_RATE_LIMIT_PER_IP);
const LOGIN_LIMIT_PER_IP = Number.isFinite(ipLimit) && ipLimit > 0 ? ipLimit : 10;

/**
 * Login med e-mail og adgangskode via Supabase Auth (server-side). Sessionen
 * gemmes i httpOnly-cookies. Fejlbeskeden er den samme, uanset om e-mailen
 * findes — så login afslører ikke, hvilke konti der eksisterer. Begrænset pr.
 * IP (alle forsøg) og pr. e-mail (kun mislykkede forsøg — nøglen hashes; e-mailen
 * gemmes ikke i klartekst).
 */
export const POST = publicRoute(async (req) => {
  await rateLimit(req, "login-ip", { limit: LOGIN_LIMIT_PER_IP, windowMs: 15 * 60_000 });
  const input = LoginSchema.parse(await readJson(req));
  const failKey = `login-fail:${input.email}`;
  const failLimit = { limit: 5, windowMs: 15 * 60_000 };
  await assertSharedRateLimitAvailable(failKey, failLimit);
  const client = await createSessionClient();
  if (!client) throw new AppError("integration_not_configured", "Adgangskontrol er ikke konfigureret på serveren.");
  const { data, error } = await client.auth.signInWithPassword({ email: input.email, password: input.password });
  // Netværks-/serverfejl hos Supabase Auth skelnes fra forkerte oplysninger (uden at afsløre detaljer).
  if (error && (error.name === "AuthRetryableFetchError" || !error.status || error.status >= 500)) throw new AppError("integration_error", "Login-tjenesten er midlertidigt utilgængelig. Prøv igen om lidt.");
  if (error || !data.user) {
    await enforceSharedRateLimit(failKey, failLimit).catch(() => undefined); // tæl det mislykkede forsøg
    throw new AppError("unauthorized", INVALID);
  }
  if (!hasPlatformAccess(roleOf(data.user))) {
    await client.auth.signOut({ scope: "local" }).catch(() => undefined);
    throw new AppError("forbidden", "Kontoen har ikke adgang til AI Agency. Kontakt administratoren.");
  }
  return json({ ok: true, redirect: safeNextPath(input.next) });
});

/** Ingen GET — login sker kun med POST fra login-siden. */
export async function GET() {
  return json({ error: { code: "method_not_allowed", message: "Brug POST." } }, 405);
}
