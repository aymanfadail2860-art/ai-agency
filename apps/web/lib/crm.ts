import type { ResearchReport } from "@agency/core";
import { getSettings } from "@agency/core/server";
import type { Account360, CrmAccount, Opportunity } from "@agency/crm";
import {
  createAccount,
  createOpportunity,
  findAccountByBrand,
  getAccountCore,
  linkQuote,
  linkReport,
  markAsCustomer,
  moveStage,
  requireAccount,
  requireOpportunity,
  syncFromQuote,
} from "@agency/crm/server";
import { getTaskType } from "@agency/orchestrator";
import { getAgentStates, listJobs, submitJob, type Defer } from "@agency/orchestrator/server";
import { phaseLabel } from "@agency/production";
import { blockersFor, filesForProjects, getFinance, getProject, listProjects } from "@agency/production/server";
import { calculateQuoteTotals, quoteRecipient } from "@agency/quotes";
import { getCatalog, getQuote, intakeFromCrmRequest, listQuotes, markQuoteSent, rejectQuote } from "@agency/quotes/server";
import { getBrandOverview, getReport, listBrandOverviews } from "@agency/research/server";
import { AppError } from "@agency/shared";
import { z } from "zod";
import { acceptQuoteAndCreateProject } from "./production";

/**
 * KOMPOSITION: CRM ↔ Research, Tilbud, Produktion og AOS
 * -----------------------------------------------------
 * CRM gemmer kun sine egne poster. Rapporter, tilbud og projekter læses fra
 * deres moduler via brandet (fælles kundeidentitet) — der laves ingen kopier.
 */

// ─── 360-graders profil ─────────────────────────────────────────────────────


export async function getAccount360(accountId: string): Promise<Account360> {
  const core = await getAccountCore(accountId);
  const { account } = core;
  const [overview, quotes, projectSummaries, agentStates, jobs] = await Promise.all([
    getBrandOverview(account.brandId).catch(() => null),
    listQuotes(account.mode),
    listProjects(account.mode),
    getAgentStates(account.mode),
    listJobs({ mode: account.mode, brandId: account.brandId }),
  ]);
  const quoteIds = new Set(core.opportunities.map((o) => o.quoteId).filter(Boolean));
  const ownQuotes = quotes.filter((q) => q.quote.brand?.brandId === account.brandId || quoteIds.has(q.quote.id));
  const ownProjects = projectSummaries.filter((p) => p.project.customer.brandId === account.brandId);
  const projects = await Promise.all(
    ownProjects.map(async ({ project }) => {
      const bundle = await getProject(project.id);
      const finance = await getFinance(bundle);
      return {
        id: project.id,
        name: project.name,
        phase: phaseLabel(project.phase),
        status: project.status,
        isDemo: project.isDemo,
        pendingApproval: Boolean(project.pendingGate),
        deliverables: { done: project.deliverables.filter((d) => d.status === "delivered" || d.status === "approved").length, total: project.deliverables.length },
        implementationPrice: project.pricing.implementationPrice,
        monthlyPrice: project.pricing.monthlyPrice,
        registeredCosts: finance.registeredCosts,
        aiApiCostUsd: finance.aiJobs.apiCostUsd,
        maintenance: project.maintenance.sla,
        blockers: blockersFor(project, bundle.tasks),
      };
    }),
  );
  const brandReports = overview?.reports ?? [];
  const linked = await Promise.all(account.linkedReportIds.map((id) => getReport(id).then((r) => ({ id, createdAt: r.report.createdAt, name: r.report.brandSnapshot?.name ?? r.brand?.name ?? "Rapport" })).catch(() => null)));
  const latest: ResearchReport | null = brandReports[0] ? (await getReport(brandReports[0].id).catch(() => null))?.report ?? null : null;
  const files = await filesForProjects(ownProjects.map((p) => p.project.id));
  const echo = agentStates.find((s) => s.agent.key === "echo");
  return {
    ...core,
    research: {
      brandReports,
      linkedReports: linked.filter((x): x is NonNullable<typeof x> => x !== null),
      recommendations: (latest?.recommendations ?? []).slice(0, 10).map((r) => ({ catalogItemId: r.catalogItemId, serviceName: r.serviceName, score: r.score.total, priority: r.priority, selected: r.selected, reportId: latest!.id })),
    },
    quotes: ownQuotes.map((q) => ({
      id: q.quote.id,
      number: q.quote.number,
      status: q.quote.status,
      versions: q.quote.versions.length,
      currentVersion: q.currentVersion.versionNumber,
      implementation: q.totals.implementation.exclVat,
      monthly: q.totals.monthly.exclVat,
      updatedAt: q.quote.updatedAt,
    })),
    projects,
    documents: [
      ...account.documents.map((d) => ({ title: d.title, url: d.url, source: "CRM", addedAt: d.addedAt })),
      ...ownQuotes.map((q) => ({ title: `Tilbud ${q.quote.number} (PDF, v${q.currentVersion.versionNumber})`, url: `/api/quotes/${q.quote.id}/pdf`, source: "Tilbud", addedAt: q.quote.updatedAt })),
      ...brandReports.map((r) => ({ title: `Researchrapport ${new Date(r.createdAt).toLocaleDateString("da-DK")}`, url: `/research/reports/${r.id}`, source: "Research", addedAt: r.createdAt })),
      ...files.map((f) => ({ title: `${f.title}${f.simulated ? " (demo)" : ""}`, url: f.url ?? `/production/projects/${f.projectId}`, source: "Produktion", addedAt: f.createdAt })),
    ].sort((a, b) => b.addedAt.localeCompare(a.addedAt)),
    echo: {
      status: echo ? echo.status : "idle",
      jobs: jobs.filter((j) => j.module === "crm").map((j) => ({ id: j.id, title: j.title, status: j.status, taskType: j.taskType })),
    },
  };
}

/** Eksisterende kunder fra Research/Tilbud/Produktion, som endnu ikke er i CRM. */
export async function customersNotInCrm(mode: "demo" | "live"): Promise<Array<{ brandId: string; name: string; sources: string[] }>> {
  const [brands, quotes, projects] = await Promise.all([listBrandOverviews(mode), listQuotes(mode), listProjects(mode)]);
  const out: Array<{ brandId: string; name: string; sources: string[] }> = [];
  for (const b of brands) {
    if (await findAccountByBrand(b.brand.id)) continue;
    const sources = [b.latestReport && "Research", quotes.some((q) => q.quote.brand?.brandId === b.brand.id) && "Tilbud", projects.some((p) => p.project.customer.brandId === b.brand.id) && "Produktion"].filter(Boolean) as string[];
    if (sources.length) out.push({ brandId: b.brand.id, name: b.brand.name, sources });
  }
  return out;
}

// ─── Research → CRM ─────────────────────────────────────────────────────────

export const FromReportSchema = z.object({
  reportId: z.string().startsWith("rrep_"),
  action: z.enum(["lead", "opportunity", "attach"]),
  accountId: z.string().startsWith("acc_").optional(),
  catalogItemIds: z.array(z.string()).max(10).optional(),
});

export async function crmFromReport(raw: unknown): Promise<{ account: CrmAccount; opportunity: Opportunity | null; created: boolean }> {
  const input = FromReportSchema.parse(raw);
  const { report, brand } = await getReport(input.reportId);
  if (input.action === "attach") {
    if (!input.accountId) throw new AppError("validation_error", "Vælg virksomheden, rapporten skal knyttes til.");
    const target = await requireAccount(input.accountId);
    if (target.mode !== report.mode) throw new AppError("mode_mismatch", "Rapport og virksomhed tilhører forskellige tilstande.");
    return { account: await linkReport(target.id, report.id), opportunity: null, created: false };
  }
  if (!brand) throw new AppError("validation_error", "Rapporten er ikke knyttet til et brand.");
  const { account, created } = await createAccount({ brandId: brand.id, name: brand.name, source: "research", notes: report.overallRecommendation ?? "" }, { mode: report.mode, isDemo: false });
  if (input.action === "lead") return { account, opportunity: null, created };
  const catalog = await getCatalog();
  const chosen = input.catalogItemIds?.length
    ? report.recommendations.filter((r) => input.catalogItemIds!.includes(r.catalogItemId))
    : report.recommendations.filter((r) => r.selected).length
      ? report.recommendations.filter((r) => r.selected)
      : report.recommendations.slice(0, 2);
  if (!chosen.length) throw new AppError("validation_error", "Rapporten har ingen anbefalede services.");
  const items = chosen.map((r) => catalog.find((c) => c.id === r.catalogItemId)).filter((c): c is NonNullable<typeof c> => Boolean(c));
  const opportunity = await createOpportunity({
    accountId: account.id,
    title: chosen.map((r) => r.serviceName).join(" + ").slice(0, 200),
    services: chosen.map((r) => r.catalogItemId),
    implementationValue: items.reduce((s, i) => s + i.implementationPrice, 0),
    monthlyValue: items.reduce((s, i) => s + i.monthlyPrice, 0),
    stage: "research",
    reportId: report.id,
  });
  return { account, opportunity, created };
}

// ─── CRM → Tilbud ───────────────────────────────────────────────────────────

export const QuoteFromOpportunitySchema = z.object({ services: z.array(z.string()).min(1, "Vælg mindst én service.").max(10).optional(), notes: z.string().max(4000).default("") });

/** Opretter (eller genbruger) et tilbudsudkast for salgsmuligheden via kontrakten crm.quote-request@1. */
export async function createQuoteForOpportunity(opportunityId: string, raw: unknown, options: { demoRun?: number } = {}): Promise<{ quoteId: string; quoteNumber: string; created: boolean }> {
  const input = QuoteFromOpportunitySchema.parse(raw ?? {});
  const opp = await requireOpportunity(opportunityId);
  if (opp.status !== "open") throw new AppError("conflict", "Salgsmuligheden er lukket.");
  if (opp.quoteId) {
    const existing = await getQuote(opp.quoteId).catch(() => null);
    if (existing && existing.status !== "rejected") return { quoteId: existing.id, quoteNumber: existing.number, created: false };
  }
  const account = await requireAccount(opp.accountId);
  const overview = await getBrandOverview(account.brandId);
  const confirmed = overview.relations.filter((r) => r.relation.status === "confirmed" && r.legalEntity);
  const legal = confirmed.length === 1 ? confirmed[0]!.legalEntity! : null;
  const report = opp.reportId ? (await getReport(opp.reportId).catch(() => null))?.report ?? null : null;
  const services = input.services ?? opp.services;
  if (!services.length) throw new AppError("validation_error", "Salgsmuligheden har ingen services. Vælg mindst én.");
  const suffix = opp.id.slice(4);
  const requestId = options.demoRun ? `crq_demo_${options.demoRun}_${suffix}` : opp.quoteId ? `crq_${suffix}_${Date.now().toString(36)}` : `crq_${suffix}`;
  const result = await intakeFromCrmRequest({
    contract: "crm.quote-request",
    version: 1,
    requestId,
    createdAt: new Date().toISOString(),
    mode: account.mode,
    brand: { brandId: account.brandId, name: account.name, website: account.website },
    legalEntity: legal ? { companyId: legal.id, cvr: legal.cvr, name: legal.name, address: legal.address ? [legal.address.street, legal.address.postalCode, legal.address.city].filter(Boolean).join(", ") : null } : null,
    opportunity: { opportunityId: opp.id, title: opp.title },
    services: services.map((catalogItemId) => ({ catalogItemId, note: null })),
    researchReportId: report?.id ?? null,
    researchSummary: report?.summary ?? "",
    overallRecommendation: report?.overallRecommendation ?? "",
    notes: input.notes,
  });
  await linkQuote(opp.id, result.quoteId, result.quoteNumber);
  return { ...result, created: true };
}

// ─── Tilbud → CRM ───────────────────────────────────────────────────────────

/** Tilbudsstatus ændres i Tilbud; tilknyttede salgsmuligheder opdateres (se syncFromQuote for reglerne). */
export async function setQuoteStatus(quoteId: string, status: "sent" | "rejected") {
  const quote = status === "sent" ? await markQuoteSent(quoteId) : await rejectQuote(quoteId);
  const opportunities = await syncFromQuote({ id: quote.id, number: quote.number, status: quote.status });
  return { quote, opportunities };
}

/**
 * Vundet: med tilknyttet tilbud accepteres tilbuddet og overføres til
 * Produktion (idempotent — ingen dubletprojekter); ellers markeres
 * salgsmuligheden vundet manuelt.
 */
export async function winOpportunity(opportunityId: string, raw: unknown): Promise<{ opportunity: Opportunity; projectId: string | null }> {
  const { transferToProduction } = z.object({ transferToProduction: z.boolean().default(true) }).parse(raw ?? {});
  const opp = await requireOpportunity(opportunityId);
  if (opp.quoteId && transferToProduction) {
    const { project } = await acceptQuoteAndCreateProject(opp.quoteId);
    return { opportunity: await requireOpportunity(opportunityId), projectId: project.id };
  }
  const opportunity = await moveStage(opportunityId, { stage: "won", note: opp.quoteId ? "Vundet uden overførsel til Produktion" : "Vundet uden tilbud i platformen" });
  await markAsCustomer(opp.accountId, `Aftale vundet: ${opp.title}`);
  return { opportunity, projectId: null };
}

export function quoteTotals(quote: Awaited<ReturnType<typeof getQuote>>) {
  const version = quote.versions.find((v) => v.id === quote.currentVersionId)!;
  return { totals: calculateQuoteTotals(version), recipient: quoteRecipient(quote) };
}

// ─── CRM → AOS (Echo) ───────────────────────────────────────────────────────

export const CRM_AI_TASK_TYPES = ["crm.lead_qualification", "crm.follow_up_draft", "crm.meeting_prep", "crm.sales_analysis", "crm.upsell_identification"] as const;

/** Registrerer en Echo-opgave i AOS' Job Center. Opgavetyperne er planlagte, så routeren blokerer dem med en begrundelse. */
export async function requestEchoTask(accountId: string, raw: unknown, defer?: Defer) {
  const { taskType } = z.object({ taskType: z.enum(CRM_AI_TASK_TYPES) }).parse(raw);
  const account = await requireAccount(accountId);
  const { mode } = await getSettings();
  if (account.mode !== mode) throw new AppError("mode_mismatch", "Virksomheden tilhører en anden tilstand (Demo/Live).");
  return submitJob(
    {
      taskType,
      title: `${account.name}: ${getTaskType(taskType)?.label ?? taskType}`,
      input: { accountId: account.id, brandId: account.brandId },
      subject: { brandId: account.brandId, customerName: account.name },
      agentKey: "echo",
      idempotencyKey: `${taskType}:${account.id}`,
    },
    { defer },
  );
}

