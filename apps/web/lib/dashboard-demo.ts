import { getSettings } from "@agency/core/server";
import { DEMO_STEPS, type Opportunity } from "@agency/crm";
import {
  backdateDemoRecord,
  createAccount,
  createActivity,
  createOpportunity,
  deleteDemoAccount,
  getAccountCore,
  linkProject,
  linkQuote,
  listAccounts,
  markAsCustomer,
  moveStage,
} from "@agency/crm/server";
import { listApprovals, listJobs } from "@agency/orchestrator/server";
import { getServiceBaseDefinition } from "@agency/production";
import { addCost, costsForProjects, getProject, listDemoProjects, simulateStep, tasksForProjects } from "@agency/production/server";
import { getCatalog, getQuote } from "@agency/quotes/server";
import { getBrandOverview, getJob, getReport } from "@agency/research/server";
import { AppError } from "@agency/shared";
import { requestEchoTask } from "./crm";
import { getDemoState, resetCrmDemo, runNextDemoStep } from "./crm-demo";
import { startBrandResearchJob } from "./orchestrator";
import { ensureProductionWiring, resetProductionDemo, seedProductionDemo } from "./production";

/**
 * DASHBOARD-DEMO (kun Demo Mode)
 * ------------------------------
 * Genbruger de eksisterende demodata: Produktions demoportefølje (fire kunder +
 * Restaurant Nord) og Research-demoens brands. Ovenpå lægges et CRM-lag med
 * tagget `dashboard-demo` (demo-markeret): kunder knyttet til projekterne,
 * prospects i forskellige faser, opfølgninger, simulerede projektomkostninger
 * og en faseport, der afventer godkendelse i AOS.
 *
 * Ingen nye kopier af kunder eller projekter: virksomheder oprettes på de
 * eksisterende brands (deterministiske id'er), og projekterne er de samme.
 * Ingen e-mails, opkald, deployment eller betalte AI-opgaver.
 */

export const DASHBOARD_DEMO_TAG = "dashboard-demo";
const DAY = 86_400_000;
const iso = (days: number) => new Date(Date.now() + days * DAY).toISOString();
const date = (days: number) => iso(days).slice(0, 10);

async function requireDemoMode() {
  const { mode } = await getSettings();
  if (mode !== "demo") throw new AppError("mode_mismatch", "Dashboard-demoen er kun tilgængelig i Demo Mode.");
}

interface Prospect {
  name: string;
  website: string;
  industry: string;
  source: "research" | "website" | "referral" | "network" | "outbound";
  createdDaysAgo: number;
  opportunity: null | { title: string; services: string[]; stage: "qualified" | "meeting_booked" | "negotiation" | "quote_sent"; closeInDays: number; createdDaysAgo: number; lost?: { reason: string; daysAgo: number } };
  activity: null | { kind: "meeting" | "follow_up" | "call"; subject: string; dueInDays: number };
}

/** Fiktive prospects. Fjordhuset Café genbruger Research-demoens brand. */
const PROSPECTS: Prospect[] = [
  { name: "Fjordhuset Café", website: "https://fjordhuset-cafe.example", industry: "Café og selskaber", source: "research", createdDaysAgo: 34, opportunity: { title: "AI-chatbot og online booking", services: ["svc_ai_chatbot", "svc_booking_automation"], stage: "meeting_booked", closeInDays: 21, createdDaysAgo: 20 }, activity: { kind: "meeting", subject: "Behovsmøde med indehaveren", dueInDays: 2 } },
  { name: "Hotel Kystlys", website: "https://hotel-kystlys.example", industry: "Hotel", source: "referral", createdDaysAgo: 52, opportunity: { title: "AI-receptionist til reception og booking", services: ["svc_ai_receptionist"], stage: "negotiation", closeInDays: 9, createdDaysAgo: 38 }, activity: { kind: "follow_up", subject: "Opfølgning på prisforhandling", dueInDays: -2 } },
  { name: "Tandklinikken Strandvejen", website: "https://tandklinik-strandvejen.example", industry: "Sundhed", source: "website", createdDaysAgo: 12, opportunity: { title: "AI-kundeservice til patienthenvendelser", services: ["svc_ai_customer_service"], stage: "qualified", closeInDays: 35, createdDaysAgo: 8 }, activity: null },
  { name: "Elektro Nord", website: "https://elektro-nord.example", industry: "Elinstallation", source: "outbound", createdDaysAgo: 70, opportunity: { title: "Leadsystem til servicebesøg", services: ["svc_lead_management"], stage: "quote_sent", closeInDays: -20, createdDaysAgo: 60, lost: { reason: "Valgte at udskyde investeringen til næste budgetår", daysAgo: 18 } }, activity: null },
  { name: "Advokatfirmaet Holm & Co", website: "https://holm-advokat.example", industry: "Advokat", source: "network", createdDaysAgo: 4, opportunity: null, activity: { kind: "call", subject: "Første opkald — afklar behov", dueInDays: 1 } },
];

/** Simulerede (demo-markerede) projektomkostninger pr. demokunde. */
const COSTS: Record<string, Array<{ category: "hours" | "external_tool" | "infrastructure"; description: string; amount: number }>> = {
  "Klinik Havblik ApS": [
    { category: "hours", description: "Udviklingstimer (demo)", amount: 6400 },
    { category: "infrastructure", description: "Hosting og vidensbase (demo)", amount: 450 },
  ],
  "Studio Fjord": [
    { category: "hours", description: "Udviklingstimer (demo)", amount: 9800 },
    { category: "external_tool", description: "Integrationsværktøj (demo)", amount: 600 },
  ],
  "Fjordhuset Events": [{ category: "hours", description: "Udviklingstimer (demo)", amount: 14200 }],
  "Nordlys VVS & Energi ApS": [
    { category: "hours", description: "Udviklingstimer (demo)", amount: 11500 },
    { category: "infrastructure", description: "Drift og overvågning (demo)", amount: 900 },
  ],
  "Restaurant Nord": [{ category: "hours", description: "Opstart og kravafdækning (demo)", amount: 3200 }],
};

export interface DashboardDemoStatus {
  loaded: boolean;
  accounts: number;
  projects: number;
  flow: FlowStep[];
  crmDemoStep: number;
}

export async function loadDashboardDemo(): Promise<{ message: string; status: DashboardDemoStatus }> {
  await requireDemoMode();
  ensureProductionWiring();
  const { projects } = await seedProductionDemo();
  const catalog = await getCatalog();
  const price = (ids: string[]) => {
    const items = ids.map((id) => catalog.find((c) => c.id === id)).filter((c): c is NonNullable<typeof c> => Boolean(c));
    return { implementationValue: items.reduce((s, i) => s + i.implementationPrice, 0), monthlyValue: items.reduce((s, i) => s + i.monthlyPrice, 0) };
  };
  const tags = ["demo", DASHBOARD_DEMO_TAG];

  // 1) Kunder: én CRM-virksomhed pr. demoprojekt (på projektets eksisterende brand) med en vundet aftale knyttet til projektet.
  const portfolio = projects.filter((p) => p.source.kind === "demo" || (p.source.kind === "quote" && p.customer.name === "Restaurant Nord"));
  for (const p of portfolio) {
    if (!p.customer.brandId) continue;
    const { account } = await createAccount({ brandId: p.customer.brandId, name: p.customer.name, source: "network", tags, notes: "DEMO — fiktiv kunde (Dashboard-demo)." }, { mode: "demo", isDemo: true });
    if (!account.isDemo) continue; // rigtige CRM-poster røres aldrig
    const core = await getAccountCore(account.id);
    if (core.opportunities.some((o) => o.projectId === p.id)) continue;
    const start = p.startDate ? Date.parse(`${p.startDate}T09:00:00Z`) : Date.now() - DAY;
    const at = (offsetDays: number) => new Date(start + offsetDays * DAY).toISOString();
    const opp = await createOpportunity({ accountId: account.id, title: p.name, services: [getServiceBaseDefinition(p.serviceBaseKey)?.catalogItemId].filter((x): x is string => Boolean(x)), implementationValue: p.pricing.implementationPrice, monthlyValue: p.pricing.monthlyPrice, stage: "negotiation", expectedCloseDate: (p.startDate ?? date(0)) }, { isDemo: true });
    if (p.source.quoteId) await linkQuote(opp.id, p.source.quoteId, p.source.quoteNumber ?? "");
    await moveStage(opp.id, { stage: "won", note: "Demo" }, "Dashboard-demo");
    await linkProject(opp.id, p.id, p.name);
    await markAsCustomer(account.id, `Aftale vundet: ${p.name} (demo)`);
    await backdateDemoRecord("account", account.id, { createdAt: at(-45) });
    await backdateDemoRecord("opportunity", opp.id, { createdAt: at(-30), closedAt: at(-2) });
  }

  // 2) Mersalg hos en eksisterende kunde og en kommende driftsopfølgning.
  const accounts = (await listAccounts("demo")).filter((a) => a.account.tags.includes(DASHBOARD_DEMO_TAG));
  const havblik = accounts.find((a) => a.account.name === "Klinik Havblik ApS");
  if (havblik) {
    const core = await getAccountCore(havblik.account.id);
    if (!core.opportunities.some((o) => o.title.startsWith("Mersalg"))) {
      const upsell = await createOpportunity({ accountId: havblik.account.id, title: "Mersalg: Business Intelligence-rapportering", services: ["svc_business_intelligence"], ...price(["svc_business_intelligence"]), stage: "needs_identified", expectedCloseDate: date(45) }, { isDemo: true });
      await backdateDemoRecord("opportunity", upsell.id, { createdAt: iso(-6) });
    }
  }
  const nordlys = accounts.find((a) => a.account.name === "Nordlys VVS & Energi ApS");
  if (nordlys && !(await getAccountCore(nordlys.account.id)).activities.some((a) => a.subject === "Kvartalsvis driftsmøde")) {
    await createActivity({ accountId: nordlys.account.id, kind: "meeting", subject: "Kvartalsvis driftsmøde", description: "Demo: gennemgang af leads og servicebesøg.", dueAt: iso(5), priority: "normal" });
  }

  // 3) Prospects i forskellige faser (inkl. én tabt aftale og én forsinket opfølgning).
  let hotelId: string | null = null;
  for (const pr of PROSPECTS) {
    const { account } = await createAccount({ name: pr.name, website: pr.website, industry: pr.industry, source: pr.source, tags, notes: "DEMO — fiktivt prospect (Dashboard-demo)." }, { mode: "demo", isDemo: true });
    if (!account.isDemo) continue;
    if (pr.name === "Hotel Kystlys") hotelId = account.id;
    const core = await getAccountCore(account.id);
    if (core.opportunities.length || core.activities.length) continue;
    await backdateDemoRecord("account", account.id, { createdAt: iso(-pr.createdDaysAgo) });
    let opp: Opportunity | null = null;
    if (pr.opportunity) {
      const o = pr.opportunity;
      opp = await createOpportunity({ accountId: account.id, title: o.title, services: o.services, ...price(o.services), stage: o.stage, expectedCloseDate: date(o.closeInDays) }, { isDemo: true });
      if (o.lost) {
        await moveStage(opp.id, { stage: "lost", lostReason: o.lost.reason }, "Dashboard-demo");
        await backdateDemoRecord("opportunity", opp.id, { createdAt: iso(-o.createdDaysAgo), closedAt: iso(-o.lost.daysAgo) });
      } else {
        await backdateDemoRecord("opportunity", opp.id, { createdAt: iso(-o.createdDaysAgo) });
      }
    }
    if (pr.activity) await createActivity({ accountId: account.id, opportunityId: opp && !pr.opportunity?.lost ? opp.id : null, kind: pr.activity.kind, subject: pr.activity.subject, description: "Demo: registreres kun — der ringes og sendes intet.", dueAt: iso(pr.activity.dueInDays), priority: pr.activity.dueInDays < 0 ? "high" : "normal" });
  }

  // 4) Simulerede projektomkostninger (markeret simuleret).
  const demoProjects = await listDemoProjects();
  const existingCosts = await costsForProjects(demoProjects.map((p) => p.id));
  for (const p of demoProjects) {
    for (const c of COSTS[p.customer.name] ?? []) {
      if (existingCosts.some((x) => x.projectId === p.id && x.description === c.description)) continue;
      await addCost(p.id, c, true);
    }
  }

  // 5) En faseport, der afventer godkendelse i AOS (Studio Fjord: QA → intern godkendelse → port).
  const studio = demoProjects.find((p) => p.customer.name === "Studio Fjord" && p.source.kind === "demo");
  if (studio) {
    for (let guard = 0; guard < 4; guard++) {
      const { project } = await getProject(studio.id);
      if (project.pendingGate || !["qa", "internal_approval"].includes(project.phase)) break;
      const r = await simulateStep(studio.id);
      if (r.approvalId) break;
    }
  }

  // 6) AOS: brandresearch (intern motor, demodata) for et prospect og en Echo-opgave, som routeren blokerer ærligt.
  const cafe = (await listAccounts("demo")).find((a) => a.account.name === "Fjordhuset Café" && a.account.isDemo);
  if (cafe) {
    const overview = await getBrandOverview(cafe.account.brandId);
    if (!overview.latestReport) {
      const pending: Array<Promise<void>> = [];
      const { researchJob } = await startBrandResearchJob({ brandId: cafe.account.brandId }, (task) => void pending.push(task()));
      await Promise.all(pending);
      if (researchJob) await getJob(researchJob.id);
    }
  }
  if (hotelId) await requestEchoTask(hotelId, { taskType: "crm.meeting_prep" });

  return { message: "Demo-porteføljen er indlæst: kunder, prospects, projekter, omkostninger, en faseport og AI-job (alt markeret DEMO).", status: await getDashboardDemoStatus() };
}

/** Nulstiller hele demoen: CRM-demoen, Dashboard-demoens CRM-lag og Produktions demoportefølje (genindlæses). */
export async function resetDashboardDemo(): Promise<{ message: string; status: DashboardDemoStatus }> {
  await requireDemoMode();
  await resetCrmDemo();
  for (const a of await listAccounts("demo")) if (a.account.isDemo && a.account.tags.includes(DASHBOARD_DEMO_TAG)) await deleteDemoAccount(a.account.id);
  await resetProductionDemo();
  return { message: "Demoen er nulstillet. Registrerede AI-job bevares i Job Centers historik (de kan ikke slettes).", status: await getDashboardDemoStatus() };
}

// ─── Det samlede seks-moduls flow ──────────────────────────────────────────

export interface FlowStep {
  key: string;
  module: "Research" | "CRM" | "Tilbud" | "Produktion" | "AOS" | "Dashboard";
  title: string;
  done: boolean;
  detail: string;
  href: string | null;
}

/** Kører hele forløbet Research → CRM → Tilbud → Produktion → AOS → Dashboard uden betalte AI-kald. */
export async function runSixModuleFlow(): Promise<{ message: string; status: DashboardDemoStatus }> {
  await requireDemoMode();
  ensureProductionWiring();
  let state = await getDemoState();
  for (let guard = 0; state.step < DEMO_STEPS.length && guard < DEMO_STEPS.length + 1; guard++) {
    await runNextDemoStep();
    state = await getDemoState();
  }
  if (state.projectId) {
    for (let guard = 0; guard < 12; guard++) {
      const { project } = await getProject(state.projectId);
      if (project.pendingGate) break;
      const r = await simulateStep(state.projectId);
      if (r.approvalId) break;
    }
  }
  return { message: "Hele forløbet er kørt: research, lead, salgsmulighed, tilbud, accept, projekt, agenter, opgaver og en faseport i AOS.", status: await getDashboardDemoStatus() };
}

export async function getSixModuleFlow(): Promise<{ steps: FlowStep[]; brandId: string | null }> {
  const state = await getDemoState();
  const core = state.accountId ? await getAccountCore(state.accountId).catch(() => null) : null;
  const brandId = core?.account.brandId ?? null;
  const overview = brandId ? await getBrandOverview(brandId).catch(() => null) : null;
  const report = overview?.latestReport ? await getReport(overview.latestReport.id).catch(() => null) : null;
  const recs = report?.report.recommendations.length ?? 0;
  const opp = core?.opportunities.find((o) => o.id === state.opportunityId) ?? null;
  const quote = state.quoteId ? await getQuote(state.quoteId).catch(() => null) : null;
  const bundle = state.projectId ? await getProject(state.projectId).catch(() => null) : null;
  const project = bundle?.project ?? null;
  const [approvals, jobs, tasks] = await Promise.all([
    project ? listApprovals({ mode: "demo" }).then((l) => l.filter((a) => a.subject.ref?.entityId === project.id)) : Promise.resolve([]),
    brandId ? listJobs({ mode: "demo", brandId }) : Promise.resolve([]),
    project ? tasksForProjects([project.id]) : Promise.resolve([]),
  ]);
  const doneTasks = tasks.filter((t) => t.status === "done").length;
  const steps: FlowStep[] = [
    { key: "research", module: "Research", title: "Vi undersøger en potentiel virksomhed", done: Boolean(report), detail: report ? "Brandresearch gennemført via Job Center (demodata)" : "Ikke startet", href: report ? `/research/reports/${report.report.id}` : "/research" },
    { key: "services", module: "Research", title: "Research identificerer relevante AI-services", done: recs > 0, detail: recs ? `${recs} anbefalede services` : "–", href: report ? `/research/reports/${report.report.id}` : null },
    { key: "lead", module: "CRM", title: "Virksomheden oprettes som lead", done: Boolean(core), detail: core ? core.account.name : "–", href: core ? `/crm/companies/${core.account.id}` : "/crm" },
    { key: "opportunity", module: "CRM", title: "Vi opretter en salgsmulighed", done: Boolean(opp), detail: opp ? `${opp.title}` : "–", href: core ? `/crm/companies/${core.account.id}?tab=opportunities` : null },
    { key: "quote", module: "Tilbud", title: "Vi udarbejder et tilbud", done: Boolean(quote), detail: quote ? `Tilbud ${quote.number}` : "–", href: quote ? `/quotes/${quote.id}` : null },
    { key: "accepted", module: "Tilbud", title: "Kunden accepterer", done: quote?.status === "accepted", detail: quote ? `Status: ${quote.status}` : "–", href: quote ? `/quotes/${quote.id}` : null },
    { key: "project", module: "Produktion", title: "Et produktionsprojekt oprettes", done: Boolean(project), detail: project ? project.name : "–", href: project ? `/production/projects/${project.id}` : null },
    { key: "agents", module: "Produktion", title: "Vi tilknytter AI-agenter", done: Boolean(project?.agents.length), detail: project ? `${project.agents.length} agent(er) fra servicebasen` : "–", href: project ? `/production/projects/${project.id}?tab=agents` : null },
    { key: "tasks", module: "Produktion", title: "Opgaver og godkendelser registreres", done: doneTasks > 0 && approvals.length > 0, detail: project ? `${doneTasks} opgave(r) udført · ${approvals.length} godkendelse(r)` : "–", href: project ? `/production/projects/${project.id}?tab=tasks` : null },
    { key: "aos", module: "AOS", title: "AOS viser agent- og jobdata", done: jobs.length > 0 && approvals.length > 0, detail: `${jobs.length} job · ${approvals.filter((a) => a.status === "pending").length} afventende godkendelse(r)`, href: approvals.some((a) => a.status === "pending") ? "/aos/approvals" : "/aos/jobs" },
    { key: "dashboard", module: "Dashboard", title: "Dashboard viser konsekvenserne", done: Boolean(project && quote?.status === "accepted"), detail: project ? "Aftalen indgår i MRR, levering og Action Center" : "–", href: brandId ? `/dashboard?customer=${brandId}` : null },
  ];
  return { steps, brandId };
}

export async function getDashboardDemoStatus(): Promise<DashboardDemoStatus> {
  const [accounts, projects, flow, state] = await Promise.all([listAccounts("demo"), listDemoProjects(), getSixModuleFlow(), getDemoState()]);
  const tagged = accounts.filter((a) => a.account.isDemo && a.account.tags.includes(DASHBOARD_DEMO_TAG));
  return { loaded: tagged.length > 0, accounts: tagged.length, projects: projects.length, flow: flow.steps, crmDemoStep: state.step };
}
