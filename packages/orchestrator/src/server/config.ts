import { getDailyUsage, usageLimits } from "@agency/core/server";
import { getRoutineConfig, isAiConfigured, routineConfigStatus, type RoutineSlot } from "@agency/integrations";
import type { EngineKind } from "../models";
import type { EngineAvailability } from "../router";

/**
 * KONFIGURATION AF AI-INFRASTRUKTUREN
 *   AI_APPROVAL_THRESHOLD_USD        (standard 1)   — API-job over dette estimat kræver godkendelse
 *   AGENCY_PUBLIC_URL                 (fx https://ai-agency-skrotnu.vercel.app) — callback-adresse til Claude Code
 *   CLAUDE_CODE_JOB_TIMEOUT_MINUTES   (standard 90)  — herefter markeres et Claude Code-job som forsinket
 *   CLAUDE_CODE_ROUTINE_<SLOT>_ID / _TOKEN            — se integrations/claude-code/routines.ts
 */
const num = (name: string, fallback: number) => {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v >= 0 ? v : fallback;
};

export const orchestratorConfig = {
  approvalThresholdUsd: () => num("AI_APPROVAL_THRESHOLD_USD", 1),
  claudeCodeTimeoutMinutes: () => num("CLAUDE_CODE_JOB_TIMEOUT_MINUTES", 90),
  /** Engangsnøgler til callbacks udløber efter dette antal timer. */
  callbackTokenHours: () => num("CLAUDE_CODE_CALLBACK_HOURS", 24),
  publicBaseUrl: (): string | null => {
    const raw = process.env.AGENCY_PUBLIC_URL?.trim();
    if (!raw) return null;
    try {
      const url = new URL(raw);
      if (url.protocol !== "https:" && !(process.env.NODE_ENV !== "production" && url.hostname === "localhost")) return null;
      return url.origin;
    } catch {
      return null;
    }
  },
};

/** Hvilken Claude Code-rutine der udfører hvilken opgavetype. */
export const ROUTINE_SLOT_FOR_TASK: Record<string, RoutineSlot> = {
  "research.deep_research": "RESEARCH",
};

export async function apiBudgetRemainingUsd(): Promise<number> {
  const usage = await getDailyUsage("anthropic");
  return Math.max(0, usageLimits.aiDailyBudgetUsd() - usage.estimatedCostUsd);
}

/** Motorernes tilgængelighed for en opgavetype — kun ud fra konfiguration, aldrig antagelser. */
export function engineAvailability(taskType: string): Record<EngineKind, EngineAvailability> {
  const slot = ROUTINE_SLOT_FOR_TASK[taskType];
  let claudeCode: EngineAvailability;
  if (!slot) {
    claudeCode = { available: false, reason: "Der er ingen Claude Code-rutine til denne opgavetype." };
  } else {
    const status = routineConfigStatus(slot);
    if (!status.configured) claudeCode = { available: false, reason: status.reason };
    else if (!orchestratorConfig.publicBaseUrl()) claudeCode = { available: false, reason: "AGENCY_PUBLIC_URL (https) mangler — Claude Code kan ikke melde resultatet tilbage." };
    else claudeCode = { available: true, reason: `Claude Code-rutine (${slot}) er konfigureret.` };
  }
  return {
    internal: { available: true, reason: "Intern software er altid tilgængelig." },
    claude_api: isAiConfigured()
      ? { available: true, reason: "ANTHROPIC_API_KEY er konfigureret." }
      : { available: false, reason: "ANTHROPIC_API_KEY er ikke konfigureret." },
    claude_code: claudeCode,
  };
}

export function routineFor(taskType: string) {
  const slot = ROUTINE_SLOT_FOR_TASK[taskType];
  return slot ? getRoutineConfig(slot) : null;
}
