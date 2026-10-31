import { z } from "zod";
import type { ResearchJob } from "@agency/core";
import { ExecutionPolicySchema, type PublicAiJob } from "@agency/orchestrator";
import { getJob as getAiJob, registerExecutor, registerResultSchema, submitJob, type Defer } from "@agency/orchestrator/server";
import { DeepResearchResultSchema } from "@agency/research";
import { RESEARCH_STEPS, getBrandOverview, getJob as getResearchJob, legacyBrandIdForCompany, startResearch, StartResearchSchema } from "@agency/research/server";
import { AppError, type AppErrorCode } from "@agency/shared";
import { ensureProductionWiring } from "./production";

/**
 * KOMPOSITION: modulerne ↔ den fælles AI-infrastruktur
 * ----------------------------------------------------
 * Research og orchestratoren kender ikke hinanden. Her registreres, hvordan
 * hver opgavetype udføres på hver motor, og hvilket resultatformat eksterne
 * motorer skal levere.
 */
let registered = false;

const STEP_LABEL = new Map(RESEARCH_STEPS.map((s) => [s.key, s.label]));
const STEP_STATUS: Record<string, string> = { done: "færdig", failed: "fejlede", skipped: "sprunget over" };

export function ensureExecutors(): void {
  if (registered) return;
  registered = true;
  ensureProductionWiring();

  registerExecutor("research.brand_analysis", async (job, ctx) => {
    const input = z.object({ brandId: z.string(), websiteUrl: z.string().nullable().optional() }).parse(job.input);
    const apiCandidate = job.routing.candidates.find((c) => c.engine === "claude_api");
    const aiUnavailableReason =
      ctx.engine === "internal" && job.mode === "live"
        ? job.policy === "NO_AI"
          ? "AI er fravalgt for dette job (politik: uden AI) — rapporten bygger på en gennemsigtig, regelbaseret analyse."
          : `AI-analyse blev ikke brugt: ${apiCandidate?.reason ?? "ingen AI-motor tilgængelig"} Rapporten bygger på en gennemsigtig, regelbaseret analyse.`
        : undefined;

    const researchJob = await startResearch(
      { brandId: input.brandId, websiteUrl: input.websiteUrl ?? null },
      {
        defer: ctx.defer,
        useAi: ctx.engine === "claude_api",
        aiUnavailableReason,
        observer: {
          onStep: async (key, status, detail) => {
            if (!STEP_STATUS[status]) return;
            await ctx.emit("step", `${STEP_LABEL.get(key) ?? key}: ${STEP_STATUS[status]}${detail ? ` — ${detail}` : ""}`);
          },
          onAiUsage: (u) => ctx.recordCost({ inputTokens: u.inputTokens, outputTokens: u.outputTokens, apiCostUsd: u.costUsd, model: u.model }),
          onSearch: () => ctx.recordCost({ searchCalls: 1 }),
          onCompleted: (report) =>
            ctx.complete({
              summary: `${report.recommendations.length} anbefalinger · ${report.sources.length} kilder · analyse: ${report.analysisEngine === "claude" ? `Claude (${report.analysisModel})` : report.analysisEngine === "demo" ? "demo" : "regelbaseret"}`,
              data: { reportId: report.id },
              artifacts: [{ kind: "report", label: "Researchrapport", url: `/research/reports/${report.id}`, ref: report.id }],
            }),
          onFailed: (message) => ctx.fail({ code: "research_failed", message, retryable: true }),
        },
      },
    );
    await ctx.setSubject({ researchJobId: researchJob.id });
    // En research, der allerede kørte uden for Job Center, kan ikke følges herfra.
    if (researchJob.createdAt < job.createdAt) {
      await ctx.fail({ code: "conflict", message: "En research for brandet kørte allerede uden for Job Center. Vent, til den er færdig, og prøv igen.", retryable: true });
    }
  });

  registerResultSchema("research.deep_research", DeepResearchResultSchema);
}

export const StartBrandResearchSchema = StartResearchSchema.extend({ policy: ExecutionPolicySchema.optional() });

export function aiJobSummary(job: PublicAiJob) {
  return {
    id: job.id,
    status: job.status,
    engine: job.engine,
    policy: job.policy,
    fallback: job.routing.fallback,
    explanation: job.routing.blockedReason ?? job.routing.trace[job.routing.trace.length - 1] ?? null,
  };
}

const APP_CODES: readonly string[] = ["validation_error", "not_found", "conflict", "rate_limited", "integration_not_configured", "integration_error", "blocked_url", "timeout", "mode_mismatch"];

/** Research via Job Center: routeren vælger motor, og jobbet vises i AOS. */
export async function startBrandResearchJob(raw: unknown, defer: Defer): Promise<{ researchJob: ResearchJob | null; aiJob: PublicAiJob }> {
  ensureExecutors();
  const input = StartBrandResearchSchema.parse(raw);
  let brandId = input.brandId ?? null;
  if (!brandId && input.companyId) brandId = await legacyBrandIdForCompany(input.companyId);
  if (!brandId) throw new AppError("validation_error", "Angiv det brand, der skal undersøges.");
  const { brand } = await getBrandOverview(brandId);
  const submitted = await submitJob(
    {
      taskType: "research.brand_analysis",
      title: `Research: ${brand.name}`,
      input: { brandId: brand.id, websiteUrl: input.websiteUrl ?? null },
      subject: { brandId: brand.id, customerName: brand.name },
      policy: input.policy ?? "AUTO",
      idempotencyKey: `research.brand_analysis:${brand.id}`,
    },
    { defer },
  );
  const aiJob = await getAiJob(submitted.id);
  if (aiJob.status === "blocked") throw new AppError("conflict", aiJob.error?.message ?? "Opgaven kunne ikke startes.");
  if (aiJob.status === "failed" && !aiJob.subject.researchJobId) {
    const code = aiJob.error && APP_CODES.includes(aiJob.error.code) ? (aiJob.error.code as AppErrorCode) : "internal_error";
    throw new AppError(code, aiJob.error?.message ?? "Researchen kunne ikke startes.");
  }
  const researchJob = aiJob.subject.researchJobId ? await getResearchJob(aiJob.subject.researchJobId) : null;
  return { researchJob, aiJob };
}

/** Dyb research via Claude Code-rutine. Kræver Live Mode og en konfigureret rutine. */
export async function startDeepResearchJob(brandId: string, raw: unknown, defer: Defer): Promise<PublicAiJob> {
  ensureExecutors();
  const input = z.object({ focus: z.string().trim().max(1000).default("") }).parse(raw ?? {});
  const overview = await getBrandOverview(brandId);
  const confirmed = overview.relations.filter((r) => r.relation.status === "confirmed" && r.legalEntity).map((r) => ({ cvr: r.legalEntity!.cvr, name: r.legalEntity!.name }));
  const latestReport = overview.reports[0] ?? null;
  return submitJob(
    {
      taskType: "research.deep_research",
      title: `Dyb research: ${overview.brand.name}`,
      input: {
        brandId: overview.brand.id,
        brandName: overview.brand.name,
        websites: overview.websites.map((w) => w.url),
        confirmedLegalEntities: confirmed,
        latestReportId: latestReport?.id ?? null,
        focus: input.focus,
        resultFormat: "research.deep-result@1 (se routines/ai-agency-job.md)",
      },
      subject: { brandId: overview.brand.id, customerName: overview.brand.name },
      policy: "AUTO",
      idempotencyKey: `research.deep_research:${overview.brand.id}`,
    },
    { defer },
  );
}
