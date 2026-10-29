import { z } from "zod";
import {
  DEFAULT_SERVICE_CATALOG,
  ResearchQuoteHandoffV2Schema,
  type Brand,
  type BrandLegalEntityRelation,
  type Company,
  type Establishment,
  type Mode,
  type ResearchJob,
  type ResearchQuoteHandoffV2,
  type ResearchReport,
  type Website,
} from "@agency/core";
import {
  assertWithinBudget,
  backfillLegacyCompanies,
  brandRegistry,
  companyRegistry,
  establishmentRegistry,
  formatAddress,
  getSettings,
  publishEvent,
  recordUsage,
  relationRegistry,
} from "@agency/core/server";
import { assertSafeUrl, getCvrProvider } from "@agency/integrations";
import { AppError, newId, nowIso, validateCvr } from "@agency/shared";
import { DEMO_DATASETS, DEMO_EXAMPLES } from "./demo-data";
import { demoDiscoverySources, discoverByCvr, discoverByUrl, liveDiscoverySources, normalizeResearchUrl, type DiscoveryResult } from "./discovery";
import { buildRelationSnapshot, demoDataSources, liveDataSources, newJob, runBrandResearch } from "./pipeline";
import { jobStore, reportStore } from "./store";

/**
 * RESEARCHMODULETS OFFENTLIGE SERVICE-API (V2)
 * Routes og andre moduler bruger kun disse funktioner — aldrig lagringen direkte.
 */

/* -------------------------------------------------------------------------- */
/* Skemaer for input                                                          */
/* -------------------------------------------------------------------------- */

export const DiscoverSchema = z.object({ type: z.enum(["cvr", "url"]), value: z.string().min(3).max(500) });

export const CreateBrandSchema = z.object({
  type: z.enum(["cvr", "url"]),
  name: z.string().trim().min(1).max(200),
  websiteUrl: z.string().max(500).nullable().optional(),
  /** CVR-indgang: den juridiske enhed brugeren selv slog op (bekræftes). */
  legalEntityId: z.string().startsWith("cmp_").nullable().optional(),
  /** URL-indgang: enheder fundet på hjemmesiden (oprettes som forslag). */
  suggestedLegalEntityIds: z.array(z.string().startsWith("cmp_")).max(5).optional(),
});

export const ProposeRelationSchema = z.object({ cvr: z.string().min(8).max(12) });
export const DecideRelationSchema = z.object({ decision: z.enum(["confirmed", "rejected"]) });

export const StartResearchSchema = z.object({
  brandId: z.string().startsWith("brd_").optional(),
  /** V1-kompatibilitet: research startet fra en virksomhed. */
  companyId: z.string().startsWith("cmp_").optional(),
  websiteUrl: z.string().url().max(500).nullable().optional(),
});

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

/* -------------------------------------------------------------------------- */
/* Discovery og brands                                                         */
/* -------------------------------------------------------------------------- */

export function listDemoExamples() {
  return DEMO_EXAMPLES;
}

export async function discover(input: z.infer<typeof DiscoverSchema>): Promise<DiscoveryResult> {
  const { mode } = await getSettings();
  const ds = mode === "demo" ? demoDiscoverySources() : liveDiscoverySources();
  return input.type === "cvr" ? discoverByCvr(input.value, mode, ds) : discoverByUrl(input.value, mode, ds);
}

async function requireLegalEntity(id: string, mode: Mode): Promise<Company> {
  const entity = await companyRegistry.get(id);
  if (!entity || entity.mode !== mode) throw new AppError("validation_error", "Den juridiske enhed findes ikke i den aktive tilstand.");
  return entity;
}

/** Opretter et brand (eller genbruger et eksisterende) og registrerer relationer med korrekt status. */
export async function createBrand(input: z.infer<typeof CreateBrandSchema>): Promise<{ brand: Brand; created: boolean }> {
  const parsed = CreateBrandSchema.parse(input);
  const { mode } = await getSettings();
  let websiteUrl: string | null = null;
  if (parsed.websiteUrl) {
    websiteUrl = normalizeResearchUrl(parsed.websiteUrl).url;
    if (mode === "demo" && !new URL(websiteUrl).hostname.endsWith(".example")) throw new AppError("mode_mismatch", "I Demo Mode kan kun fiktive .example-adresser bruges.");
    if (mode === "live") websiteUrl = (await assertSafeUrl(websiteUrl)).toString();
  }

  const confirmed = parsed.type === "cvr" && parsed.legalEntityId ? await requireLegalEntity(parsed.legalEntityId, mode) : null;
  if (!websiteUrl && confirmed) {
    const existing = await brandRegistry.findByNameAndLegalEntity(mode, parsed.name, confirmed.id);
    if (existing) return { brand: existing, created: false };
  }
  const { brand, created } = await brandRegistry.create({
    name: parsed.name,
    mode,
    websiteUrl,
    createdVia: mode === "demo" ? "demo" : parsed.type,
    discoveredVia: mode === "demo" ? "demo" : "user",
  });

  if (confirmed) {
    await relationRegistry.upsert(brand.id, confirmed, "confirmed", {
      method: "user_cvr_input",
      description: `CVR ${confirmed.cvr} blev angivet af brugeren som udgangspunkt for researchen, og brandet blev valgt blandt virksomhedens navne.`,
      url: confirmed.registrySource.reference,
    });
  }
  for (const id of parsed.suggestedLegalEntityIds ?? []) {
    const entity = await requireLegalEntity(id, mode);
    await relationRegistry.upsert(brand.id, entity, "suggested", {
      method: "website_cvr_mention",
      description: `CVR ${entity.cvr} står på brandets hjemmeside. Relationen er ikke bekræftet.`,
      url: websiteUrl,
    });
  }
  return { brand, created };
}

/** Foreslår en juridisk enhed for et brand (fx fra navnesøgning) — oprettes altid som "suggested". */
export async function proposeLegalEntity(brandId: string, cvrInput: string): Promise<BrandLegalEntityRelation> {
  const brand = await brandRegistry.require(brandId);
  const cvr = cvrInput.replace(/[\s.-]/g, "");
  const ds = brand.mode === "demo" ? demoDiscoverySources() : liveDiscoverySources();
  if (!ds.isDemo) {
    const v = validateCvr(cvr);
    if (!v.valid) throw new AppError("validation_error", v.reason);
  }
  if (!ds.cvr.configured) throw new AppError("integration_not_configured", "CVR-opslag er ikke konfigureret, så enheden kan ikke verificeres.");
  const lookup = await ds.cvr.lookup(cvr);
  const entity = await companyRegistry.register({ ...lookup.record, mode: brand.mode });
  return relationRegistry.upsert(brand.id, entity, "suggested", {
    method: "cvr_name_search",
    description: `Foreslået ud fra navnesøgning i CVR på "${brand.name}". Ikke verificeret.`,
    url: entity.registrySource.reference,
  });
}

export async function decideRelation(brandId: string, relationId: string, decision: "confirmed" | "rejected"): Promise<BrandLegalEntityRelation> {
  const relations = await relationRegistry.forBrand(brandId);
  if (!relations.some((r) => r.id === relationId)) throw new AppError("not_found", "Relationen tilhører ikke brandet.");
  return relationRegistry.decide(relationId, decision);
}

export interface BrandOverview {
  brand: Brand;
  websites: Website[];
  relations: Array<{ relation: BrandLegalEntityRelation; legalEntity: Company | null; establishments: Establishment[] }>;
  latestJob: ResearchJob | null;
  latestReport: Pick<ResearchReport, "id" | "createdAt" | "status" | "analysisEngine"> | null;
  reports: Array<Pick<ResearchReport, "id" | "createdAt" | "status" | "analysisEngine">>;
}

const reportSummary = (r: ResearchReport) => ({ id: r.id, createdAt: r.createdAt, status: r.status, analysisEngine: r.analysisEngine });

let legacyMap: Promise<Map<string, string>> | null = null;
/** V1-data: én gang pr. proces sikres, at alle V1-virksomheder har et brand. */
async function legacyBrandMap(): Promise<Map<string, string>> {
  legacyMap ??= backfillLegacyCompanies().catch((err) => {
    legacyMap = null;
    throw err;
  });
  return legacyMap;
}

function reportBrandId(report: ResearchReport, map: Map<string, string>): string | null {
  return report.brandId ?? (report.companyId ? (map.get(report.companyId) ?? null) : null);
}

export async function getBrandOverview(brandId: string): Promise<BrandOverview> {
  const map = await legacyBrandMap();
  const brand = await brandRegistry.require(brandId);
  const [websites, relations, jobs, reports] = await Promise.all([brandRegistry.websites(brandId), relationRegistry.forBrand(brandId), jobStore.list(), reportStore.list()]);
  const legacyCompanyIds = Array.from(map.entries()).filter(([, b]) => b === brandId).map(([c]) => c);
  const ownJobs = jobs.filter((j) => j.brandId === brandId || (!j.brandId && j.companyId && legacyCompanyIds.includes(j.companyId))).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const ownReports = reports.filter((r) => reportBrandId(r, map) === brandId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return {
    brand,
    websites,
    relations: await Promise.all(
      relations.map(async (relation) => ({
        relation,
        legalEntity: await companyRegistry.get(relation.legalEntityId),
        establishments: await establishmentRegistry.forLegalEntity(relation.legalEntityId),
      })),
    ),
    latestJob: ownJobs[0] ?? null,
    latestReport: ownReports[0] ? reportSummary(ownReports[0]) : null,
    reports: ownReports.map(reportSummary),
  };
}

export async function listBrandOverviews(mode?: Mode): Promise<Array<Omit<BrandOverview, "relations" | "websites" | "reports"> & { websites: string[]; legalNames: Array<{ name: string; cvr: string; status: string }> }>> {
  const map = await legacyBrandMap();
  const [brands, jobs, reports] = await Promise.all([brandRegistry.list(mode), jobStore.list(), reportStore.list()]);
  return Promise.all(
    brands.map(async (brand) => {
      const [websites, relations] = await Promise.all([brandRegistry.websites(brand.id), relationRegistry.forBrand(brand.id)]);
      const legalNames = (
        await Promise.all(relations.filter((r) => r.status !== "rejected").map(async (r) => ({ entity: await companyRegistry.get(r.legalEntityId), status: r.status })))
      ).flatMap(({ entity, status }) => (entity ? [{ name: entity.name, cvr: entity.cvr, status }] : []));
      const ownReports = reports.filter((r) => reportBrandId(r, map) === brand.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      const ownJobs = jobs.filter((j) => j.brandId === brand.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      return { brand, websites: websites.map((w) => w.url), legalNames, latestJob: ownJobs[0] ?? null, latestReport: ownReports[0] ? reportSummary(ownReports[0]) : null };
    }),
  );
}

export async function legacyBrandIdForCompany(companyId: string): Promise<string | null> {
  return (await legacyBrandMap()).get(companyId) ?? null;
}

/* -------------------------------------------------------------------------- */
/* Research                                                                    */
/* -------------------------------------------------------------------------- */

const STALE_JOB_MS = 10 * 60_000;

export interface StartResearchOptions {
  /**
   * Planlægger kørslen efter svaret er sendt. På serverless (Vercel) skal routen
   * give `after` fra next/server, så funktionen holdes i live til jobbet er færdigt.
   */
  defer?: (task: () => Promise<void>) => void;
}

export async function startResearch(input: z.infer<typeof StartResearchSchema>, options: StartResearchOptions = {}): Promise<ResearchJob> {
  const parsed = StartResearchSchema.parse(input);
  let brandId = parsed.brandId ?? null;
  if (!brandId && parsed.companyId) brandId = await legacyBrandIdForCompany(parsed.companyId);
  if (!brandId) throw new AppError("validation_error", "Angiv det brand, der skal undersøges.");
  const overview = await getBrandOverview(brandId);
  const { brand } = overview;

  const running = await jobStore.find((j) => j.brandId === brand.id && (j.status === "queued" || j.status === "running"));
  if (running) {
    if (Date.now() - new Date(running.updatedAt).getTime() < STALE_JOB_MS) return running;
    await jobStore.update(running.id, (j) => ({ ...j, status: "failed", error: "Jobbet blev afbrudt (fx ved genstart af serveren).", finishedAt: nowIso(), updatedAt: nowIso() }));
  }

  let websiteUrl: string | null = null;
  if (parsed.websiteUrl) {
    if (brand.mode === "demo") throw new AppError("mode_mismatch", "I Demo Mode bruges den fiktive hjemmeside.");
    websiteUrl = (await assertSafeUrl(normalizeResearchUrl(parsed.websiteUrl).url)).toString();
    await brandRegistry.addWebsite(brand.id, websiteUrl, "user", overview.websites.length === 0);
  }
  if (brand.mode === "live") {
    await assertWithinBudget("research_jobs");
    await recordUsage("research_jobs", { calls: 1 });
  }

  const websites = await brandRegistry.websites(brand.id);
  const confirmedLegalEntities = overview.relations.filter((r) => r.relation.status === "confirmed" && r.legalEntity).map((r) => r.legalEntity!) ;
  const relationSnapshot = await buildRelationSnapshot(overview.relations.filter((r) => r.legalEntity).map((r) => ({ status: r.relation.status, legalEntity: r.legalEntity! })));
  const ds = brand.mode === "demo" ? demoDataSources(websites.map((w) => w.url)) : liveDataSources();
  const job = await jobStore.upsert(newJob(brand, websiteUrl, confirmedLegalEntities[0]?.id ?? null));
  await brandRegistry.touch(brand.id);
  await publishEvent({ type: "research.job.started", source: "research", mode: brand.mode, subject: { jobId: job.id }, payload: { brandId: brand.id } });

  const task = async () => {
    try {
      await runBrandResearch(job, { brand, websites, confirmedLegalEntities, relationSnapshot }, ds);
    } catch (err) {
      console.error("[research] job fejlede", err);
      const message = err instanceof AppError ? err.message : "Uventet fejl under research.";
      await jobStore.update(job.id, (j) => ({ ...j, status: "failed", error: message, finishedAt: nowIso(), updatedAt: nowIso() }));
      await publishEvent({ type: "research.failed", source: "research", mode: brand.mode, subject: { jobId: job.id }, payload: { brandId: brand.id, message } });
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

export async function getReport(reportId: string): Promise<{ report: ResearchReport; brand: Brand | null; company: Company | null }> {
  const report = await reportStore.get(reportId);
  if (!report) throw new AppError("not_found", "Researchrapporten blev ikke fundet.");
  const map = await legacyBrandMap();
  const brandId = reportBrandId(report, map);
  const [brand, company] = await Promise.all([brandId ? brandRegistry.get(brandId) : null, report.companyId ? companyRegistry.get(report.companyId) : null]);
  return { report, brand, company };
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
  await publishEvent({ type: "research.report.updated", source: "research", mode: updated.mode, subject: { reportId }, payload: { selected: updated.recommendations.filter((r) => r.selected).length } });
  return updated;
}

/** Bygger kontrakten `research.quote-handoff@2` (brand-first, CVR kun hvis bekræftet). */
export async function buildQuoteHandoff(reportId: string): Promise<ResearchQuoteHandoffV2> {
  const { report, brand, company } = await getReport(reportId);
  if (!brand) throw new AppError("internal_error", "Rapporten er ikke knyttet til et brand.");
  const selected = report.recommendations.filter((r) => r.selected);
  if (selected.length === 0) throw new AppError("validation_error", "Vælg mindst én service, før der oprettes et tilbud.");

  const relations = await relationRegistry.forBrand(brand.id);
  const confirmed = relations.filter((r) => r.status === "confirmed");
  const legal = confirmed.length === 1 ? await companyRegistry.get(confirmed[0].legalEntityId) : confirmed.length === 0 && company && !report.brandId ? company : null;
  const websites = await brandRegistry.websites(brand.id);

  const handoff: ResearchQuoteHandoffV2 = {
    contract: "research.quote-handoff",
    version: 2,
    handoffId: newId("handoff"),
    createdAt: nowIso(),
    mode: report.mode,
    brand: { brandId: brand.id, name: brand.name, website: websites[0]?.url ?? null },
    legalEntity: legal ? { companyId: legal.id, cvr: legal.cvr, name: legal.name, address: formatAddress(legal) } : null,
    researchReportId: report.id,
    researchSummary: report.summary,
    overallRecommendation: report.overallRecommendation ?? "",
    opportunities: report.opportunities.slice(0, 12).map((o) => ({ title: o.title, observed: o.observed ?? o.description, potentialProblem: o.potentialProblem ?? "", solution: o.solution ?? "" })),
    services: selected.map((rec) => ({
      recommendationId: rec.id,
      catalogItemId: rec.catalogItemId,
      serviceName: rec.serviceName,
      description: rec.editedDescription ?? DEFAULT_SERVICE_CATALOG.find((c) => c.id === rec.catalogItemId)?.shortDescription ?? rec.problem,
      rationale: rec.relevance,
      keyFindings: rec.findings.filter((f) => f.classification === "fact" || f.classification === "assessment").filter((f) => !f.text.startsWith("Branche:") && !f.text.startsWith("Registreret branche")).slice(0, 5).map((f) => f.text),
      priority: rec.priority,
      complexity: rec.complexity,
      score: rec.score.total,
      note: rec.note,
      proposedSolution: rec.proposedSolution ?? null,
      customerQuestions: (rec.customerQuestions ?? []).slice(0, 8),
    })),
    userNotes: [report.notes, confirmed.length > 1 ? "Bemærk: flere juridiske enheder er bekræftet for brandet — angiv modtageren i tilbuddet." : ""].filter(Boolean).join("\n"),
  };
  return ResearchQuoteHandoffV2Schema.parse(handoff);
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
    await publishEvent({ type: "research.handoff.created", source: "research", mode: updated.mode, subject: { reportId, quoteId }, payload: { handoffId, brandId: updated.brandId ?? null } });
  }
}

/* -------------------------------------------------------------------------- */
/* V1-kompatible indgange                                                      */
/* -------------------------------------------------------------------------- */

/** V1 API: rigtigt CVR-opslag (returnerer den juridiske enhed). */
export async function lookupCompanyByCvr(input: string): Promise<Company> {
  const validation = validateCvr(input);
  if (!validation.valid) throw new AppError("validation_error", validation.reason);
  const provider = getCvrProvider();
  if (!provider.isConfigured()) {
    throw new AppError("integration_not_configured", `CVR-opslag er ikke konfigureret (${provider.name}). Se Indstillinger → Integrationer, eller brug Demo Mode.`);
  }
  const lookup = await provider.lookup(validation.cvr);
  return companyRegistry.register({ ...lookup.record, mode: "live" });
}

/** V1 API: registrerer en fiktiv virksomhed ud fra demo-nøglen. */
export async function registerDemoCompany(key: string): Promise<Company> {
  const dataset = DEMO_DATASETS.find((d) => d.key === key);
  if (!dataset) throw new AppError("not_found", "Ukendt demo-virksomhed.");
  return companyRegistry.register({ ...dataset.company, mode: "demo", registrySource: { provider: "demo", retrievedAt: nowIso(), reference: null } });
}
