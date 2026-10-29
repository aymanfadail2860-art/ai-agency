import { z } from "zod";
import { AppError } from "@agency/shared";
import { createCollectionStore } from "./json-store";

/**
 * API-FORBRUG OG OMKOSTNINGSGRÆNSER (V2)
 * --------------------------------------
 * Ét aggregeret dokument pr. udbyder pr. døgn (UTC), så lagringen ikke vokser
 * med antallet af kald. Grænser konfigureres via miljøvariabler:
 *
 *   AI_DAILY_BUDGET_USD    (standard 5)    — samlet estimeret Claude-forbrug pr. døgn
 *   SEARCH_DAILY_LIMIT     (standard 300)  — antal websøgninger pr. døgn
 *   RESEARCH_DAILY_LIMIT   (standard 40)   — antal researchjob pr. døgn
 *   CVR_DAILY_LIMIT        (standard 500)  — antal CVR-opslag pr. døgn
 */

export const UsageProviderSchema = z.enum(["anthropic", "brave", "cvr", "research_jobs"]);
export type UsageProvider = z.infer<typeof UsageProviderSchema>;

const DailyUsageSchema = z.object({
  id: z.string(),
  provider: UsageProviderSchema,
  day: z.string(),
  calls: z.number().int().min(0),
  inputTokens: z.number().int().min(0),
  outputTokens: z.number().int().min(0),
  estimatedCostUsd: z.number().min(0),
  errors: z.number().int().min(0),
  lastModel: z.string().nullable(),
  updatedAt: z.string(),
});
export type DailyUsage = z.infer<typeof DailyUsageSchema>;

const store = createCollectionStore("platform", "api-usage", DailyUsageSchema);

const today = () => new Date().toISOString().slice(0, 10);
const num = (name: string, fallback: number) => {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v >= 0 ? v : fallback;
};

export const usageLimits = {
  aiDailyBudgetUsd: () => num("AI_DAILY_BUDGET_USD", 5),
  searchDailyLimit: () => num("SEARCH_DAILY_LIMIT", 300),
  researchDailyLimit: () => num("RESEARCH_DAILY_LIMIT", 40),
  cvrDailyLimit: () => num("CVR_DAILY_LIMIT", 500),
};

export async function getDailyUsage(provider: UsageProvider, day = today()): Promise<DailyUsage> {
  return (
    (await store.get(`${provider}-${day}`)) ?? {
      id: `${provider}-${day}`,
      provider,
      day,
      calls: 0,
      inputTokens: 0,
      outputTokens: 0,
      estimatedCostUsd: 0,
      errors: 0,
      lastModel: null,
      updatedAt: new Date().toISOString(),
    }
  );
}

export async function recordUsage(
  provider: UsageProvider,
  delta: { calls?: number; inputTokens?: number; outputTokens?: number; estimatedCostUsd?: number; errors?: number; model?: string | null },
): Promise<DailyUsage> {
  const day = today();
  const id = `${provider}-${day}`;
  const apply = (u: DailyUsage): DailyUsage => ({
    ...u,
    calls: u.calls + (delta.calls ?? 0),
    inputTokens: u.inputTokens + (delta.inputTokens ?? 0),
    outputTokens: u.outputTokens + (delta.outputTokens ?? 0),
    estimatedCostUsd: Math.round((u.estimatedCostUsd + (delta.estimatedCostUsd ?? 0)) * 10_000) / 10_000,
    errors: u.errors + (delta.errors ?? 0),
    lastModel: delta.model ?? u.lastModel,
    updatedAt: new Date().toISOString(),
  });
  const updated = await store.update(id, apply);
  if (updated) return updated;
  return store.upsert(apply(await getDailyUsage(provider, day)));
}

/** Kaster en tydelig fejl, hvis dagens grænse for udbyderen er nået. */
export async function assertWithinBudget(provider: UsageProvider): Promise<void> {
  const usage = await getDailyUsage(provider);
  if (provider === "anthropic" && usage.estimatedCostUsd >= usageLimits.aiDailyBudgetUsd()) {
    throw new AppError("rate_limited", `Dagens AI-budget (${usageLimits.aiDailyBudgetUsd()} USD) er brugt. AI-analyse er sat på pause til i morgen.`);
  }
  if (provider === "brave" && usage.calls >= usageLimits.searchDailyLimit()) {
    throw new AppError("rate_limited", `Dagens grænse for websøgninger (${usageLimits.searchDailyLimit()}) er nået.`);
  }
  if (provider === "research_jobs" && usage.calls >= usageLimits.researchDailyLimit()) {
    throw new AppError("rate_limited", `Dagens grænse for researchjob (${usageLimits.researchDailyLimit()}) er nået. Prøv igen i morgen.`);
  }
  if (provider === "cvr" && usage.calls >= usageLimits.cvrDailyLimit()) {
    throw new AppError("rate_limited", `Dagens grænse for CVR-opslag (${usageLimits.cvrDailyLimit()}) er nået.`);
  }
}

export async function getUsageOverview(): Promise<Array<DailyUsage & { limit: string }>> {
  const providers: UsageProvider[] = ["anthropic", "brave", "cvr", "research_jobs"];
  const rows = await Promise.all(providers.map((p) => getDailyUsage(p)));
  return rows.map((r) => ({
    ...r,
    limit:
      r.provider === "anthropic"
        ? `${usageLimits.aiDailyBudgetUsd()} USD/døgn`
        : r.provider === "brave"
          ? `${usageLimits.searchDailyLimit()} søgninger/døgn`
          : r.provider === "cvr"
            ? `${usageLimits.cvrDailyLimit()} opslag/døgn`
            : `${usageLimits.researchDailyLimit()} job/døgn`,
  }));
}
