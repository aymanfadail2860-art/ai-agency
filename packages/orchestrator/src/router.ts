import type { EngineKind, ExecutionPolicy, RoutingDecision } from "./models";
import type { TaskTypeDefinition } from "./task-types";

/**
 * AI EXECUTION ROUTER
 * -------------------
 * Ren, deterministisk funktion: samme input giver samme beslutning, og hver
 * beslutning har en læsbar begrundelse (`trace`). Ingen AI-kald.
 *
 * Regler i rækkefølge:
 *  1. Demo Mode bruger altid `internal` (kun fiktive data, ingen eksterne motorer).
 *  2. Politikken bestemmer kandidaterne:
 *       *_ONLY    → kun den motor; ingen stille fallback.
 *       *_PREFERRED → den motor først, derefter de øvrige.
 *       AUTO      → opgavetypens rækkefølge, justeret for hastighed/abonnement.
 *       NO_AI     → kun `internal`.
 *  3. En kandidat afvises, hvis opgaven ikke er implementeret til den, motoren
 *     ikke er tilgængelig (credentials/konfiguration), eller budgettet ikke rækker.
 *  4. Godkendelse kræves ved kritiske bivirkninger eller API-omkostning over tærsklen.
 */

export interface EngineAvailability {
  available: boolean;
  reason: string;
}

export interface RoutingInput {
  task: TaskTypeDefinition;
  policy: ExecutionPolicy;
  mode: "demo" | "live";
  availability: Record<EngineKind, EngineAvailability>;
  /** Resterende API-budget i dag (USD). */
  apiBudgetRemainingUsd: number;
  /** Over denne estimerede API-omkostning pr. job kræves godkendelse. */
  approvalThresholdUsd: number;
  /** Sat, når den ansvarlige agent ikke må få opgaver (fx deaktiveret). Gælder i alle tilstande. */
  agentBlockedReason?: string | null;
  now?: Date;
}

const ENGINE_LABEL: Record<EngineKind, string> = {
  internal: "Intern software (uden AI)",
  claude_api: "Claude API",
  claude_code: "Claude Code-rutine",
};

export function engineLabel(engine: EngineKind | null): string {
  return engine ? ENGINE_LABEL[engine] : "Ingen motor";
}

const SIDE_EFFECT_LABEL: Record<string, string> = {
  production_change: "Ændring i produktion",
  deployment: "Deployment",
  customer_system_change: "Ændring i kundesystem",
  paid_external_action: "Betalt ekstern handling",
  mass_action: "Massehandling",
  destructive_database_change: "Destruktiv databaseændring",
  customer_communication: "Kommunikation til kunde",
};

function candidateOrder(task: TaskTypeDefinition, policy: ExecutionPolicy): { order: EngineKind[]; strict: boolean; note: string } {
  const all: EngineKind[] = ["claude_code", "claude_api", "internal"];
  switch (policy) {
    case "CLAUDE_CODE_ONLY":
      return { order: ["claude_code"], strict: true, note: "Politik CLAUDE_CODE_ONLY: kun Claude Code; ingen fallback." };
    case "CLAUDE_API_ONLY":
      return { order: ["claude_api"], strict: true, note: "Politik CLAUDE_API_ONLY: kun Claude API; ingen fallback." };
    case "NO_AI":
      return { order: ["internal"], strict: true, note: "Politik NO_AI: kun intern software uden AI." };
    case "CLAUDE_CODE_PREFERRED":
      return { order: ["claude_code", "claude_api", "internal"], strict: false, note: "Politik CLAUDE_CODE_PREFERRED: Claude Code først, derefter Claude API og intern software." };
    case "CLAUDE_API_PREFERRED":
      return { order: ["claude_api", "claude_code", "internal"], strict: false, note: "Politik CLAUDE_API_PREFERRED: Claude API først, derefter Claude Code og intern software." };
    case "AUTO": {
      // Opgavetypens egen rækkefølge. Interaktive opgaver (brugeren venter) foretrækker
      // den hurtige API; længere agentopgaver foretrækker abonnementsbaseret Claude Code.
      const declared = [...task.engines];
      const order = task.interactive
        ? declared
        : [...declared].sort((a, b) => Number(b === "claude_code") - Number(a === "claude_code"));
      const rest = all.filter((e) => !order.includes(e));
      return {
        order: [...order, ...rest],
        strict: false,
        note: task.interactive
          ? "Politik AUTO: interaktiv opgave — hastighed prioriteres (opgavetypens rækkefølge)."
          : "Politik AUTO: baggrundsopgave — Claude Code (abonnement) foretrækkes før betalt API.",
      };
    }
  }
}

export function routeTask(input: RoutingInput): RoutingDecision {
  const { task, policy } = input;
  const trace: string[] = [];
  const candidates: RoutingDecision["candidates"] = [];
  const decidedAt = (input.now ?? new Date()).toISOString();
  const blocked = (reason: string): RoutingDecision => ({
    policy,
    engine: null,
    trace: [...trace, `Blokeret: ${reason}`],
    candidates,
    requiresApproval: false,
    approvalReasons: [],
    blockedReason: reason,
    fallback: false,
    decidedAt,
  });

  if (!task.implemented) {
    trace.push(`Opgavetypen "${task.label}" er planlagt, men ikke implementeret endnu.`);
    return blocked("Opgavetypen er ikke implementeret i denne version.");
  }

  if (input.agentBlockedReason) {
    trace.push(input.agentBlockedReason);
    return blocked(input.agentBlockedReason);
  }

  let engine: EngineKind | null = null;
  let fallback = false;

  if (input.mode === "demo") {
    trace.push("Demo Mode: kun fiktive data — eksterne AI-motorer bruges ikke.");
    if (!task.canRunWithoutAi) {
      candidates.push({ engine: "internal", accepted: false, reason: "Opgaven kræver AI og kan ikke simuleres troværdigt i Demo Mode." });
      return blocked("Opgaven kræver en AI-motor og er ikke tilgængelig i Demo Mode.");
    }
    candidates.push({ engine: "internal", accepted: true, reason: "Demo Mode bruger intern, regelbaseret behandling af fiktive data." });
    engine = "internal";
  } else {
    const { order, strict, note } = candidateOrder(task, policy);
    trace.push(note);
    const preferred = order[0];
    for (const candidate of order) {
      if (!task.engines.includes(candidate)) {
        candidates.push({ engine: candidate, accepted: false, reason: `Opgaven er ikke implementeret til ${engineLabel(candidate)}.` });
        continue;
      }
      if (candidate === "internal" && !task.canRunWithoutAi) {
        candidates.push({ engine: candidate, accepted: false, reason: "Opgaven kræver AI." });
        continue;
      }
      const availability = input.availability[candidate];
      if (!availability.available) {
        candidates.push({ engine: candidate, accepted: false, reason: availability.reason });
        continue;
      }
      if (candidate === "claude_api" && task.estimatedApiCostUsd > input.apiBudgetRemainingUsd) {
        candidates.push({
          engine: candidate,
          accepted: false,
          reason: `Estimeret API-omkostning (${task.estimatedApiCostUsd.toFixed(2)} USD) overstiger dagens resterende budget (${input.apiBudgetRemainingUsd.toFixed(2)} USD).`,
        });
        continue;
      }
      candidates.push({ engine: candidate, accepted: true, reason: availability.reason });
      engine = candidate;
      fallback = candidate !== preferred;
      break;
    }
    if (!engine) {
      const rejected = candidates.map((c) => `${engineLabel(c.engine)}: ${c.reason}`).join(" · ");
      return blocked(strict ? `Den valgte motor kan ikke bruges — ${rejected}` : `Ingen motor er tilgængelig — ${rejected}`);
    }
    trace.push(fallback ? `Fallback til ${engineLabel(engine)}, fordi den foretrukne motor ikke kunne bruges.` : `Valgt: ${engineLabel(engine)}.`);
  }

  const approvalReasons: string[] = task.sideEffects.map((s) => `${SIDE_EFFECT_LABEL[s] ?? s} kræver altid godkendelse.`);
  if (engine === "claude_api" && task.estimatedApiCostUsd > input.approvalThresholdUsd) {
    approvalReasons.push(
      `Estimeret API-omkostning ${task.estimatedApiCostUsd.toFixed(2)} USD er over godkendelsesgrænsen på ${input.approvalThresholdUsd.toFixed(2)} USD.`,
    );
  }
  if (approvalReasons.length) trace.push("Kræver godkendelse før start.");

  return {
    policy,
    engine,
    trace,
    candidates,
    requiresApproval: approvalReasons.length > 0,
    approvalReasons,
    blockedReason: null,
    fallback,
    decidedAt,
  };
}

/** Politikker, der giver mening for en opgavetype (til brugerfladen). */
export function policiesFor(task: TaskTypeDefinition): ExecutionPolicy[] {
  const policies: ExecutionPolicy[] = ["AUTO"];
  if (task.engines.includes("claude_code")) policies.push("CLAUDE_CODE_PREFERRED", "CLAUDE_CODE_ONLY");
  if (task.engines.includes("claude_api")) policies.push("CLAUDE_API_PREFERRED", "CLAUDE_API_ONLY");
  if (task.canRunWithoutAi) policies.push("NO_AI");
  return policies;
}

export const POLICY_LABELS: Record<ExecutionPolicy, string> = {
  AUTO: "Automatisk",
  CLAUDE_CODE_PREFERRED: "Foretræk Claude Code",
  CLAUDE_API_PREFERRED: "Foretræk Claude API",
  CLAUDE_CODE_ONLY: "Kun Claude Code",
  CLAUDE_API_ONLY: "Kun Claude API",
  NO_AI: "Uden AI (regelbaseret)",
};
