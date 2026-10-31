import { httpRequest, isAbortError } from "../http/client";

/**
 * CLAUDE CODE-RUTINER (officielt, research preview)
 * -------------------------------------------------
 * Dokumentation: https://platform.claude.com/docs/en/api/claude-code/routines-fire
 * og https://code.claude.com/docs/en/routines
 *
 *  POST https://api.anthropic.com/v1/claude_code/routines/{routine_id}/fire
 *  Authorization: Bearer <rutine-token, sk-ant-oat01-…>   (ét token pr. rutine, ingen læseadgang)
 *  anthropic-version: 2023-06-01
 *  Body: { "text": "<højst 65.536 tegn>" }
 *  200 → { type: "routine_fire", claude_code_session_id, claude_code_session_url }
 *
 * Vigtige begrænsninger (dokumenterede):
 *  - Ingen idempotensnøgle: hvert vellykket kald starter en ny session.
 *  - Ingen status- eller resultat-API for tokenet: sessionen skal selv melde tilbage.
 *  - 30 kald/time pr. rutine og 100/time pr. konto (429 + Retry-After).
 *  - Kørsler bruger abonnementets forbrug og kører som kontoens ejer.
 *
 * Rutiner konfigureres pr. "slot" via miljøvariabler, så kontoen og tokens kan
 * udskiftes uden kodeændringer (fx ved overgang til en virksomhedskonto):
 *   CLAUDE_CODE_ROUTINE_<SLOT>_ID     (trig_…)
 *   CLAUDE_CODE_ROUTINE_<SLOT>_TOKEN  (sk-ant-oat01-…, markeres som Sensitive i Vercel)
 */

export const ROUTINE_FIRE_BASE_URL = "https://api.anthropic.com/v1/claude_code/routines";
export const ROUTINE_TEXT_MAX_CHARS = 65_536;

export type RoutineSlot = "RESEARCH";

export interface RoutineConfig {
  slot: RoutineSlot;
  routineId: string;
  token: string;
}

export function getRoutineConfig(slot: RoutineSlot): RoutineConfig | null {
  const routineId = process.env[`CLAUDE_CODE_ROUTINE_${slot}_ID`]?.trim();
  const token = process.env[`CLAUDE_CODE_ROUTINE_${slot}_TOKEN`]?.trim();
  if (!routineId || !token) return null;
  if (!/^trig_[A-Za-z0-9]+$/.test(routineId)) return null;
  return { slot, routineId, token };
}

export function routineConfigStatus(slot: RoutineSlot): { configured: boolean; reason: string } {
  const id = process.env[`CLAUDE_CODE_ROUTINE_${slot}_ID`]?.trim();
  const token = process.env[`CLAUDE_CODE_ROUTINE_${slot}_TOKEN`]?.trim();
  if (!id && !token) return { configured: false, reason: `Rutinen er ikke konfigureret (CLAUDE_CODE_ROUTINE_${slot}_ID og _TOKEN mangler).` };
  if (!id) return { configured: false, reason: `CLAUDE_CODE_ROUTINE_${slot}_ID mangler.` };
  if (!token) return { configured: false, reason: `CLAUDE_CODE_ROUTINE_${slot}_TOKEN mangler.` };
  if (!/^trig_[A-Za-z0-9]+$/.test(id)) return { configured: false, reason: `CLAUDE_CODE_ROUTINE_${slot}_ID skal starte med "trig_".` };
  return { configured: true, reason: "Rutine og token er konfigureret (testes først ved en reel kørsel)." };
}

export type RoutineFireOutcome =
  | { ok: true; sessionId: string; sessionUrl: string }
  | {
      ok: false;
      status: number | null;
      code: "invalid_request" | "authentication" | "permission" | "not_found" | "rate_limited" | "server_error" | "network" | "unexpected_response";
      message: string;
      /** Kan kaldet have startet en session alligevel? (5xx/timeout uden svar) */
      ambiguous: boolean;
      retryAfterSeconds: number | null;
    };

const STATUS_CODES: Record<number, Exclude<RoutineFireOutcome, { ok: true }>["code"]> = {
  400: "invalid_request",
  401: "authentication",
  403: "permission",
  404: "not_found",
  429: "rate_limited",
};

/** Starter en kørsel af rutinen. Kaldes aldrig automatisk igen ved fejl — se `ambiguous`. */
export async function fireRoutine(config: RoutineConfig, text: string): Promise<RoutineFireOutcome> {
  if (text.length > ROUTINE_TEXT_MAX_CHARS) {
    return { ok: false, status: null, code: "invalid_request", message: "Opgaveteksten overstiger 65.536 tegn.", ambiguous: false, retryAfterSeconds: null };
  }
  let res;
  try {
    res = await httpRequest(`${ROUTINE_FIRE_BASE_URL}/${encodeURIComponent(config.routineId)}/fire`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.token}`,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text }),
      timeoutMs: 20_000,
      redirect: "error",
    });
  } catch (err) {
    return {
      ok: false,
      status: null,
      code: "network",
      message: isAbortError(err) ? "Claude Code svarede ikke inden for 20 sekunder." : "Netværksfejl ved kald til Claude Code.",
      // Uden svar ved vi ikke, om sessionen blev startet.
      ambiguous: true,
      retryAfterSeconds: null,
    };
  }
  if (res.status === 200) {
    const body = (await res.json().catch(() => null)) as { type?: string; claude_code_session_id?: unknown; claude_code_session_url?: unknown } | null;
    if (body?.type === "routine_fire" && typeof body.claude_code_session_id === "string" && typeof body.claude_code_session_url === "string") {
      return { ok: true, sessionId: body.claude_code_session_id, sessionUrl: body.claude_code_session_url };
    }
    return { ok: false, status: 200, code: "unexpected_response", message: "Uventet svar fra Claude Code.", ambiguous: true, retryAfterSeconds: null };
  }
  const errorBody = (await res.json().catch(() => null)) as { error?: { message?: unknown } } | null;
  const upstream = typeof errorBody?.error?.message === "string" ? errorBody.error.message.slice(0, 300) : null;
  const retryAfter = Number(res.headers.get("retry-after"));
  const code = STATUS_CODES[res.status] ?? "server_error";
  const messages: Record<typeof code, string> = {
    invalid_request: "Claude Code afviste forespørgslen (fx sat på pause eller ugyldig version).",
    authentication: "Rutinens token er ugyldigt eller tilhører en anden rutine.",
    permission: "Kontoen har ikke adgang til Claude Code-rutiner.",
    not_found: "Rutinen findes ikke.",
    rate_limited: "Timegrænsen for rutinen eller kontoen er nået.",
    server_error: "Claude Code returnerede en serverfejl.",
    network: "",
    unexpected_response: "",
  };
  return {
    ok: false,
    status: res.status,
    code,
    message: upstream ? `${messages[code]} (${upstream})` : messages[code],
    ambiguous: code === "server_error",
    retryAfterSeconds: Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : null,
  };
}
