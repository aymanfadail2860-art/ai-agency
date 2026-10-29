import { z } from "zod";
import {
  DEFAULT_SERVICE_CATALOG,
  ResearchQuoteHandoffSchema,
  type Company,
  type ResearchJob,
  type ResearchQuoteHandoff,
  type ResearchReport,
} from "@agency/core";
import { companyRegistry, formatAddress, publishEvent } from "@agency/core/server";
import { assertSafeUrl, getCvrProvider } from "@agency/integrations";
import { AppError, newId, nowIso, validateCvr } from "@agency/shared";
import { DEMO_DATASETS, getDemoDataset } from "./demo-data";
import { demoDataSources, liveDataSources, newJob, runResearchJob } from "./pipeline";
import { jobStore, reportStore } from "./store";

/**
 * RESEARCHMODULETS OFFENTLIGE SERVICE-API
 * Routes og andre moduler bruger kun disse funktioner — aldrig lagringen direkte.
 */

export const ReportUpdateSchema = z.object({
  notes: z.string().max(5000).optional(),
  status: z.enum(["draft", "saved"]).optional(),
  recommendations: z
    .array(
      z.object({
        id: z.string(),
        selected: z.boolean().optional(),
        editedDescription: z.string().max(3000).nullable().optional(),
        note: z.string().max(2000).nullable().optional(),
      }),
    )
    .optional(),
});
export type ReportUpdate = z.infer<typeof ReportUpdateSchema>;

export const StartResearchSchema = z.object({
  companyId: z.string().startsWith("cmp_"),
  websiteUrl: z.string().url().max(500).nullable().optional(),
});

const STALE_JOB_MS = 10 * 60_000;

export interface CompanyOverview {
  company: Company;
  latestJob: ResearchJob | null;
  latestReport: Pick<ResearchReport, "id" | "createdAt" | "status" | "analysisEngine"> | null;
  reports: Array<Pick<ResearchReport, "id" | "createdAt" | "status" | "analysisEngine">>;
}

export function listDemoCompanies() {
  return DEMO_DATASETS.map((d) => ({ key: d.key, name: d.company.name, tagline: d.tagline, industry: d.company.industry?.text ?? "" }));
}

/** Live Mode: rigtigt CVR-opslag gennem den konfigurerede adapter. */
export async function lookupCompanyByCvr(input: string): Promise<Company> {
  const validation = validateCvr(input);
  if (!validation.valid) throw new AppError("validation_error", validation.reason);
  const provider = getCvrProvider();
  if (!provider.isConfigured()) {
    throw new AppError(
      "integration_not_configured",
      `CVR-opslag er ikke konfigureret (${provider.name}). Se Indstillinger → Integrationer, eller brug Demo Mode.`,
    );
  }
  const record = await provider.lookup(validation.cvr);
  return companyRegistry.register({ ...record, mode: "live" });
}

/** Demo Mode: registrerer en fiktiv virksomhed. */
export async function registerDemoCompany(key: string): Promise<Company> {
  const dataset = getDemoDataset(key);
  if (!dataset) throw new AppError("not_found", "Ukendt demo-virksomhed.");
  return companyRegistry.register({
    ...dataset.company,
    mode: "demo",
    registrySource: { provider: "demo", retrievedAt: nowIso(), reference: null },
  });
}

const reportSummary = (r: ResearchReport) => ({ id: r.id, createdAt: r.createdAt, status: r.status, analysisEngine: r.analysisEngine });

export async function listCompanyOverviews(mode?: Company["mode"]): Promise<CompanyOverview[]> {
  const [companies, jobs, reports] = await Promise.all([companyRegistry.list(), jobStore.list(), reportStore.list()]);
  return companies
    .filter((c) => !mode || c.mode === mode)
    .map((company) => {
      const cJobs = jobs.filter((j) => j.companyId === company.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      const cReports = reports.filter((r) => r.companyId === company.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      return {
        company,
        latestJob: cJobs[0] ?? null,
        latestReport: cReports[0] ? reportSummary(cReports[0]) : null,
        reports: cReports.map(reportSummary),
      };
    });
}

export async function getCompanyOverview(companyId: string): Promise<CompanyOverview> {
  const company = await companyRegistry.get(companyId);
  if (!company) throw new AppError("not_found", "Virksomheden blev ikke fundet.");
  const [overview] = (await listCompanyOverviews()).filter((o) => o.company.id === companyId);
  return overview ?? { company, latestJob: null, latestReport: null, reports: [] };
}

/** Starter research asynkront og returnerer jobbet med det samme (klienten poller status). */
export interface StartResearchOptions {
  /**
   * Planlægger kørslen efter svaret er sendt. På serverless (Vercel) skal routen
   * give `after` fra next/server, så funktionen holdes i live til jobbet er færdigt.
   */
  defer?: (task: () => Promise<void>) => void;
}

export async function startResearch(companyId: string, websiteUrl?: string | null, options: StartResearchOptions = {}): Promise<ResearchJob> {
  const company = await companyRegistry.get(companyId);
  if (!company) throw new AppError("not_found", "Virksomheden blev ikke fundet.");
  const running = await jobStore.find((j) => j.companyId === companyId && (j.status === "queued" || j.status === "running"));
  if (running) {
    // Et job, der ikke er opdateret i 10 minutter, er afbrudt (fx ved genstart) og markeres som fejlet.
    if (Date.now() - new Date(running.updatedAt).getTime() < STALE_JOB_MS) return running;
    await jobStore.update(running.id, (j) => ({ ...j, status: "failed", error: "Jobbet blev afbrudt (fx ved genstart af serveren).", finishedAt: nowIso(), updatedAt: nowIso() }));
  }

  let url: string | null = null;
  if (websiteUrl) {
    if (company.mode === "demo") throw new AppError("mode_mismatch", "I Demo Mode bruges den fiktive hjemmeside.");
    url = (await assertSafeUrl(websiteUrl)).toString();
  }

  const ds = company.mode === "demo" ? demoDataSources(company) : liveDataSources();
  const job = await jobStore.upsert(newJob(company, url));
  await publishEvent({ type: "research.job.started", source: "research", mode: company.mode, subject: { companyId, jobId: job.id }, payload: {} });

  const task = async () => {
    try {
      await runResearchJob(job, company, ds);
    } catch (err) {
      console.error("[research] job fejlede", err);
      const message = err instanceof AppError ? err.message : "Uventet fejl under research.";
      await jobStore.update(job.id, (j) => ({ ...j, status: "failed", error: message, finishedAt: nowIso(), updatedAt: nowIso() }));
      await publishEvent({ type: "research.failed", source: "research", mode: company.mode, subject: { companyId, jobId: job.id }, payload: { message } });
    }
  };
  if (options.defer) options.defer(task);
  else void task();
  return job;
}

export async function getJob(jobId: string): Promise<ResearchJob> {
  const job = await jobStore.get(jobId);
  if (!job) throw new AppError("not_found", "Researchjobbet blev ikke fundet.");
  return job;
}

export async function getReport(reportId: string): Promise<{ report: ResearchReport; company: Company }> {
  const report = await reportStore.get(reportId);
  if (!report) throw new AppError("not_found", "Researchrapporten blev ikke fundet.");
  const company = await companyRegistry.get(report.companyId);
  if (!company) throw new AppError("not_found", "Virksomheden for rapporten blev ikke fundet.");
  return { report, company };
}

export async function updateReport(reportId: string, update: ReportUpdate): Promise<ResearchReport> {
  const parsed = ReportUpdateSchema.parse(update);
  const updated = await reportStore.update(reportId, (report) => ({
    ...report,
    notes: parsed.notes ?? report.notes,
    status: report.status === "handed_off" ? "handed_off" : (parsed.status ?? report.status),
    recommendations: report.recommendations.map((rec) => {
      const patch = parsed.recommendations?.find((p) => p.id === rec.id);
      if (!patch) return rec;
      return {
        ...rec,
        selected: patch.selected ?? rec.selected,
        editedDescription: patch.editedDescription === undefined ? rec.editedDescription : patch.editedDescription?.trim() || null,
        note: patch.note === undefined ? rec.note : patch.note?.trim() || null,
      };
    }),
    updatedAt: nowIso(),
  }));
  if (!updated) throw new AppError("not_found", "Researchrapporten blev ikke fundet.");
  await publishEvent({ type: "research.report.updated", source: "research", mode: updated.mode, subject: { companyId: updated.companyId, reportId }, payload: { selected: updated.recommendations.filter((r) => r.selected).length } });
  return updated;
}

/** Bygger kontrakten `research.quote-handoff@1` ud fra de valgte services. */
export async function buildQuoteHandoff(reportId: string): Promise<ResearchQuoteHandoff> {
  const { report, company } = await getReport(reportId);
  const selected = report.recommendations.filter((r) => r.selected);
  if (selected.length === 0) throw new AppError("validation_error", "Vælg mindst én service, før der oprettes et tilbud.");
  const handoff: ResearchQuoteHandoff = {
    contract: "research.quote-handoff",
    version: 1,
    handoffId: newId("handoff"),
    createdAt: nowIso(),
    mode: report.mode,
    company: { ...companyRegistry.toRef(company), address: formatAddress(company) },
    researchReportId: report.id,
    researchSummary: report.summary,
    services: selected.map((rec) => ({
      recommendationId: rec.id,
      catalogItemId: rec.catalogItemId,
      serviceName: rec.serviceName,
      description: rec.editedDescription ?? DEFAULT_SERVICE_CATALOG.find((c) => c.id === rec.catalogItemId)?.shortDescription ?? rec.problem,
      rationale: rec.relevance,
      // Registerfundet (branche) er fælles for alle services og gentages ikke.
      keyFindings: rec.findings
        .filter((f) => f.classification !== "hypothesis" && !f.text.startsWith("Registreret branche"))
        .slice(0, 5)
        .map((f) => f.text),
      priority: rec.priority,
      complexity: rec.complexity,
      score: rec.score.total,
      note: rec.note,
    })),
    userNotes: report.notes,
  };
  return ResearchQuoteHandoffSchema.parse(handoff);
}

/** Registrerer at et tilbud er oprettet ud fra rapporten. */
export async function recordHandoff(reportId: string, handoffId: string, quoteId: string): Promise<void> {
  const updated = await reportStore.update(reportId, (r) => ({
    ...r,
    status: "handed_off",
    handoffs: [...r.handoffs, { handoffId, quoteId, at: nowIso() }],
    updatedAt: nowIso(),
  }));
  if (updated) {
    await publishEvent({ type: "research.handoff.created", source: "research", mode: updated.mode, subject: { companyId: updated.companyId, reportId, quoteId }, payload: { handoffId } });
  }
}
