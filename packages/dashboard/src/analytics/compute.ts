import { buckets, filterToQuery, inPeriod, resolvePeriod, type DashboardFilter, type ResolvedPeriod } from "./filters";
import type { AnalyticsSnapshot, EngineKind, ServiceCategory, SnapshotJob, SnapshotOpportunity, SnapshotProject } from "./types";

/**
 * DASHBOARDETS BEREGNINGER
 * ------------------------
 * Rene, deterministiske funktioner over et normaliseret øjebliksbillede.
 * Ingen AI, ingen tilfældighed, intet `Date.now()` — "nu" kommer fra billedet.
 *
 * Grundregler:
 *  - Flow-målinger (nye leads, vundne aftaler, omkostninger …) tæller hændelser i perioden.
 *  - Beholdninger (åben pipeline, aktive kunder, aftalt MRR, aktive projekter …) er
 *    status pr. nu. De påvirkes ikke af perioden og summeres aldrig over tid.
 *  - Implementering (engangs) og månedlig (tilbagevendende) holdes adskilt.
 *  - Én aftale tælles én gang (se `agreements`).
 */

export const CATEGORY_LABELS: Record<ServiceCategory, string> = {
  customer_contact: "Kundekontakt",
  sales_marketing: "Salg og marketing",
  automation: "Automatisering",
  data_software: "Data og software",
};
export const ENGINE_LABELS: Record<EngineKind | "none", string> = { internal: "Intern software", claude_api: "Claude API", claude_code: "Claude Code (abonnement)", none: "Ingen motor (blokeret)" };
const OPEN_JOB = new Set(["queued", "awaiting_approval", "dispatched", "running"]);
const DAY = 86_400_000;

const round = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d;
const sum = <T>(list: T[], f: (x: T) => number) => list.reduce((s, x) => s + f(x), 0);
const firstYear = (impl: number, monthly: number) => impl + 12 * monthly;
const normName = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
const dateOnly = (iso: string) => iso.slice(0, 10);
const ms = (iso: string) => Date.parse(iso.length === 10 ? `${iso}T12:00:00Z` : iso);

// ─── Typer for resultatet ──────────────────────────────────────────────────

export type KpiUnit = "count" | "dkk" | "dkk_month" | "usd" | "percent" | "days";
export interface Kpi {
  key: string;
  label: string;
  value: number | null;
  unit: KpiUnit;
  /** "stock" = beholdning pr. nu; "flow" = hændelser i perioden. */
  kind: "stock" | "flow";
  sub: string;
  href: string;
  tone?: "default" | "warning" | "danger" | "success";
}

export interface Agreement {
  key: string;
  kind: "project" | "quote" | "opportunity";
  sourceId: string;
  customerKey: string;
  customerName: string;
  title: string;
  implementation: number;
  monthly: number;
  agreedAt: string;
  categories: ServiceCategory[];
  href: string;
}

export interface SeriesPoint {
  key: string;
  label: string;
  values: Record<string, number>;
}

export type ActionSeverity = "critical" | "high" | "medium" | "low";
export interface ActionItem {
  id: string;
  rule: string;
  severity: ActionSeverity;
  title: string;
  detail: string;
  href: string;
  module: "crm" | "quotes" | "production" | "aos";
  customerName: string | null;
  at: string | null;
}

export interface Definition {
  key: string;
  label: string;
  kind: "stock" | "flow" | "estimate";
  source: string;
  rule: string;
}

export interface DashboardData {
  mode: AnalyticsSnapshot["mode"];
  generatedAt: string;
  period: ResolvedPeriod;
  filter: DashboardFilter;
  options: {
    customers: Array<{ value: string; label: string }>;
    agents: Array<{ value: string; label: string }>;
  };
  basis: {
    empty: boolean;
    demoRecords: number;
    totalRecords: number;
    realAiRuns: number;
    simulatedCosts: number;
  };
  overview: { kpis: Kpi[] };
  sales: ReturnType<typeof salesSection>;
  finance: ReturnType<typeof financeSection>;
  delivery: ReturnType<typeof deliverySection>;
  ai: ReturnType<typeof aiSection>;
  actions: ActionItem[];
}

// ─── Afgrænsning (filtre) ──────────────────────────────────────────────────

interface Scoped {
  snap: AnalyticsSnapshot;
  period: ResolvedPeriod;
  filter: DashboardFilter;
  accounts: AnalyticsSnapshot["accounts"];
  opportunities: AnalyticsSnapshot["opportunities"];
  activities: AnalyticsSnapshot["activities"];
  quotes: AnalyticsSnapshot["quotes"];
  /** Alle projekter i kunde/kategori-filteret (bruges til aftaler og økonomi). */
  projects: AnalyticsSnapshot["projects"];
  /** Projekter efter også projektstatus- og agentfilter (Delivery og handlinger). */
  deliveryProjects: AnalyticsSnapshot["projects"];
  tasks: AnalyticsSnapshot["tasks"];
  costs: AnalyticsSnapshot["costs"];
  jobs: AnalyticsSnapshot["jobs"];
  approvals: AnalyticsSnapshot["approvals"];
  categoryOf: (catalogId: string) => ServiceCategory | null;
  accountById: Map<string, AnalyticsSnapshot["accounts"][number]>;
}

export function customerKeyFor(brandId: string | null, name: string): string {
  return brandId ?? `name:${normName(name)}`;
}

function scope(snap: AnalyticsSnapshot, filter: DashboardFilter): Scoped {
  // Tidligste registrering på tværs af modulerne (inkl. projekters startdato, som også er aftaledato) bestemmer grafernes opløsning for "hele perioden".
  const earliest = [...snap.accounts.map((a) => a.createdAt), ...snap.opportunities.map((o) => o.createdAt), ...snap.projects.map((p) => (p.startDate && p.startDate < p.createdAt.slice(0, 10) ? `${p.startDate}T00:00:00.000Z` : p.createdAt)), ...snap.jobs.map((j) => j.createdAt)].sort()[0] ?? null;
  const period = resolvePeriod(filter, snap.now, earliest);
  const catalog = new Map(snap.catalog.map((c) => [c.id, c.category]));
  const categoryOf = (id: string) => catalog.get(id) ?? null;
  const allAccounts = new Map(snap.accounts.map((a) => [a.id, a]));
  const c = filter.customer;
  const cat = filter.category;

  const accounts = snap.accounts.filter((a) => !c || a.brandId === c);
  const accountIds = new Set(accounts.map((a) => a.id));
  const opportunities = snap.opportunities.filter((o) => accountIds.has(o.accountId) && (!cat || o.services.some((s) => categoryOf(s) === cat)));
  const activities = snap.activities.filter((a) => accountIds.has(a.accountId) && (!cat || !a.opportunityId || opportunities.some((o) => o.id === a.opportunityId)));
  const quotes = snap.quotes.filter((q) => (!c || q.brandId === c) && (!cat || q.services.some((s) => categoryOf(s) === cat)));
  const projects = snap.projects.filter((p) => (!c || p.brandId === c) && (!cat || (p.catalogItemId !== null && categoryOf(p.catalogItemId) === cat)));
  const deliveryProjects = projects.filter(
    (p) =>
      (!filter.projectStatus || (filter.projectStatus === "overdue" ? p.overdue : p.status === filter.projectStatus)) &&
      (!filter.agent || p.agents.some((a) => a.agentId === filter.agent)),
  );
  const projectIds = new Set(projects.map((p) => p.id));
  const tasks = snap.tasks.filter((t) => projectIds.has(t.projectId));
  const costs = snap.costs.filter((x) => projectIds.has(x.projectId));
  const jobs = snap.jobs.filter(
    (j) =>
      (!c || j.brandId === c || (j.projectId !== null && projectIds.has(j.projectId))) &&
      (!filter.agent || j.agentId === filter.agent) &&
      (!filter.engine || (filter.engine === "none" ? j.engine === null : j.engine === filter.engine)),
  );
  const jobIds = new Set(jobs.map((j) => j.id));
  const approvals = snap.approvals.filter((a) => !c || (a.ref !== null && projectIds.has(a.ref.entityId)) || (a.aiJobId !== null && jobIds.has(a.aiJobId)) || (a.ref !== null && accountIds.has(a.ref.entityId)));
  return { snap, period, filter, accounts, opportunities, activities, quotes, projects, deliveryProjects, tasks, costs, jobs, approvals, categoryOf, accountById: allAccounts };
}

// ─── Aftaler — kontraktligt aftalt omsætning uden dobbeltoptælling ─────────

/**
 * Én kommerciel aftale tælles præcis én gang. Prioritet:
 *  1. Produktionsprojekt (ikke annulleret) — projektets aftalte priser.
 *  2. Accepteret tilbud, som endnu ikke er blevet til et projekt.
 *  3. Vundet CRM-salgsmulighed uden tilbud eller projekt, der allerede tælles.
 * Aftaledato: projektets oprettelse (eller startdato, hvis den er tidligere),
 * tilbuddets seneste ændring (accept) eller salgsmulighedens lukning.
 */
export function agreements(s: Pick<Scoped, "projects" | "quotes" | "opportunities" | "categoryOf" | "accountById">): Agreement[] {
  const out: Agreement[] = [];
  const projectQuoteIds = new Set<string>();
  const projectIds = new Set<string>();
  for (const p of s.projects) {
    if (p.status === "cancelled") continue;
    projectIds.add(p.id);
    if (p.quoteId) projectQuoteIds.add(p.quoteId);
    const agreedAt = p.startDate && ms(p.startDate) < ms(p.createdAt) ? `${p.startDate}T00:00:00.000Z` : p.createdAt;
    const cat = p.catalogItemId ? s.categoryOf(p.catalogItemId) : null;
    out.push({ key: `project:${p.id}`, kind: "project", sourceId: p.id, customerKey: customerKeyFor(p.brandId, p.customerName), customerName: p.customerName, title: p.name, implementation: p.implementationPrice, monthly: p.monthlyPrice, agreedAt, categories: cat ? [cat] : [], href: `/production/projects/${p.id}` });
  }
  const acceptedQuoteIds = new Set<string>();
  for (const q of s.quotes) {
    if (q.status !== "accepted") continue;
    acceptedQuoteIds.add(q.id);
    if (projectQuoteIds.has(q.id)) continue;
    out.push({ key: `quote:${q.id}`, kind: "quote", sourceId: q.id, customerKey: customerKeyFor(q.brandId, q.customerName), customerName: q.customerName, title: `Tilbud ${q.number}`, implementation: q.implementation, monthly: q.monthly, agreedAt: q.updatedAt, categories: uniqueCategories(q.services, s.categoryOf), href: `/quotes/${q.id}` });
  }
  for (const o of s.opportunities) {
    if (o.status !== "won") continue;
    if (o.projectId && projectIds.has(o.projectId)) continue;
    if (o.quoteId && (acceptedQuoteIds.has(o.quoteId) || projectQuoteIds.has(o.quoteId))) continue;
    const account = s.accountById.get(o.accountId);
    out.push({ key: `opportunity:${o.id}`, kind: "opportunity", sourceId: o.id, customerKey: account?.brandId ?? `account:${o.accountId}`, customerName: account?.name ?? "Ukendt", title: o.title, implementation: o.implementationValue, monthly: o.monthlyValue, agreedAt: o.closedAt ?? o.createdAt, categories: uniqueCategories(o.services, s.categoryOf), href: `/crm/companies/${o.accountId}?tab=opportunities` });
  }
  return out;
}

function uniqueCategories(services: string[], categoryOf: (id: string) => ServiceCategory | null): ServiceCategory[] {
  return Array.from(new Set(services.map(categoryOf).filter((c): c is ServiceCategory => c !== null)));
}

/** Aftalt MRR pr. et tidspunkt: summen af månedlige beløb for aftaler indgået før tidspunktet (en beholdning — ikke en sum af snapshots). */
export function mrrAt(list: Agreement[], atIso: string): number {
  const t = ms(atIso);
  return sum(
    list.filter((a) => ms(a.agreedAt) < t),
    (a) => a.monthly,
  );
}

/** Åben pipeline pr. et tidspunkt (rekonstrueret ud fra oprettelse og lukning; aktuelle beløb). */
export function openPipelineAt(opps: SnapshotOpportunity[], atIso: string) {
  const t = ms(atIso);
  const open = opps.filter((o) => ms(o.createdAt) < t && (o.closedAt === null || ms(o.closedAt) >= t) && (o.status === "open" || o.closedAt !== null));
  return { count: open.length, implementation: sum(open, (o) => o.implementationValue), monthly: sum(open, (o) => o.monthlyValue) };
}

/** Aktive kunder: unikke kunder (brand) med CRM-status "Aktiv kunde" eller en aftale. */
export function activeCustomerKeys(s: Pick<Scoped, "accounts">, list: Agreement[]): Set<string> {
  const keys = new Set<string>();
  for (const a of s.accounts) if (a.status === "customer") keys.add(a.brandId);
  for (const a of list) keys.add(a.customerKey);
  return keys;
}

function weightedPipeline(open: SnapshotOpportunity[]) {
  return {
    implementation: round(sum(open, (o) => (o.implementationValue * o.probability) / 100), 0),
    monthly: round(sum(open, (o) => (o.monthlyValue * o.probability) / 100), 0),
  };
}

/** Fordeling af en værdi på servicekategorier, vægtet efter katalogets implementeringspris (deterministisk). */
function splitByCategory(services: string[], value: { implementation: number; monthly: number }, snap: AnalyticsSnapshot): Array<{ category: ServiceCategory; implementation: number; monthly: number }> {
  const items = services.map((id) => snap.catalog.find((c) => c.id === id)).filter((c): c is NonNullable<typeof c> => Boolean(c));
  if (!items.length) return [];
  const total = sum(items, (i) => Math.max(i.implementationPrice, 1));
  return items.map((i) => {
    const w = Math.max(i.implementationPrice, 1) / total;
    return { category: i.category, implementation: value.implementation * w, monthly: value.monthly * w };
  });
}

// ─── Sektioner ──────────────────────────────────────────────────────────────

function salesSection(s: Scoped, list: Agreement[]) {
  const { period, snap } = s;
  const open = s.opportunities.filter((o) => o.status === "open");
  const closed = s.opportunities.filter((o) => o.status !== "open" && inPeriod(o.closedAt, period));
  const won = closed.filter((o) => o.status === "won");
  const lost = closed.filter((o) => o.status === "lost");
  const newAccounts = s.accounts.filter((a) => inPeriod(a.createdAt, period));
  const inPeriodAgreements = list.filter((a) => inPeriod(a.agreedAt, period));
  const earliest = s.accounts.map((a) => a.createdAt).concat(s.opportunities.map((o) => o.createdAt)).sort()[0] ?? null;
  const axis = buckets(period, earliest);

  const byStage = snap.stages.map((st) => {
    const list = s.opportunities.filter((o) => o.stage === st.key && (o.status === "open" || (st.key === "won" || st.key === "lost" ? inPeriod(o.closedAt, period) : false)));
    return { key: st.key, label: st.label, count: list.length, implementation: sum(list, (o) => o.implementationValue), monthly: sum(list, (o) => o.monthlyValue) };
  });

  // Forventet lukning: åbne salgsmuligheder grupperet på måned (vægtet).
  const nowMonth = snap.now.slice(0, 7);
  const months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(Date.UTC(Number(nowMonth.slice(0, 4)), Number(nowMonth.slice(5, 7)) - 1 + i, 1));
    return { key: d.toISOString().slice(0, 7), label: d.toLocaleDateString("da-DK", { month: "short", year: "2-digit", timeZone: "UTC" }) };
  });
  const expectedClose = [
    { key: "overdue", label: "Overskredet" },
    ...months,
    { key: "later", label: "Senere" },
    { key: "none", label: "Ingen dato" },
  ].map((m) => {
    const list = open.filter((o) => {
      if (!o.expectedCloseDate) return m.key === "none";
      const k = o.expectedCloseDate.slice(0, 7);
      if (o.expectedCloseDate < dateOnly(snap.now)) return m.key === "overdue";
      if (k > months[months.length - 1]!.key) return m.key === "later";
      return k === m.key;
    });
    const w = weightedPipeline(list);
    return { key: m.key, label: m.label, count: list.length, weightedImplementation: w.implementation, weightedMonthly: w.monthly };
  });

  const categoryTotals = new Map<ServiceCategory, { pipelineImplementation: number; pipelineMonthly: number; agreedImplementation: number; agreedMonthly: number; deals: number }>();
  const bump = (cat: ServiceCategory, f: (x: { pipelineImplementation: number; pipelineMonthly: number; agreedImplementation: number; agreedMonthly: number; deals: number }) => void) => {
    const cur = categoryTotals.get(cat) ?? { pipelineImplementation: 0, pipelineMonthly: 0, agreedImplementation: 0, agreedMonthly: 0, deals: 0 };
    f(cur);
    categoryTotals.set(cat, cur);
  };
  for (const o of open) for (const part of splitByCategory(o.services, { implementation: o.implementationValue, monthly: o.monthlyValue }, snap)) bump(part.category, (x) => ((x.pipelineImplementation += part.implementation), (x.pipelineMonthly += part.monthly)));
  for (const a of inPeriodAgreements) {
    const services = a.kind === "project" ? s.projects.find((p) => p.id === a.sourceId)?.catalogItemId : null;
    const ids = services ? [services] : a.kind === "quote" ? (s.quotes.find((q) => q.id === a.sourceId)?.services ?? []) : (s.opportunities.find((o) => o.id === a.sourceId)?.services ?? []);
    const parts = splitByCategory(ids, { implementation: a.implementation, monthly: a.monthly }, snap);
    for (const part of parts) bump(part.category, (x) => ((x.agreedImplementation += part.implementation), (x.agreedMonthly += part.monthly)));
    for (const cat of new Set(parts.map((p) => p.category))) bump(cat, (x) => (x.deals += 1));
  }
  const byCategory = (Object.keys(CATEGORY_LABELS) as ServiceCategory[]).map((cat) => {
    const v = categoryTotals.get(cat) ?? { pipelineImplementation: 0, pipelineMonthly: 0, agreedImplementation: 0, agreedMonthly: 0, deals: 0 };
    return { key: cat, label: CATEGORY_LABELS[cat], deals: v.deals, pipelineImplementation: round(v.pipelineImplementation, 0), pipelineMonthly: round(v.pipelineMonthly, 0), agreedImplementation: round(v.agreedImplementation, 0), agreedMonthly: round(v.agreedMonthly, 0) };
  });

  const series: SeriesPoint[] = axis.map((b) => {
    const pipe = openPipelineAt(s.opportunities, b.end);
    return {
      key: b.key,
      label: b.label,
      values: {
        leads: s.accounts.filter((a) => ms(a.createdAt) >= ms(b.start) && ms(a.createdAt) < ms(b.end)).length,
        won: s.opportunities.filter((o) => o.status === "won" && o.closedAt && ms(o.closedAt) >= ms(b.start) && ms(o.closedAt) < ms(b.end)).length,
        lost: s.opportunities.filter((o) => o.status === "lost" && o.closedAt && ms(o.closedAt) >= ms(b.start) && ms(o.closedAt) < ms(b.end)).length,
        pipelineImplementation: pipe.implementation,
        pipelineMonthly: pipe.monthly,
      },
    };
  });

  const weighted = weightedPipeline(open);
  const mrr = mrrAt(list, new Date(ms(snap.now) + 1).toISOString());
  const leadConverted = newAccounts.filter((a) => a.status === "customer").length;
  return {
    openPipeline: { count: open.length, implementation: sum(open, (o) => o.implementationValue), monthly: sum(open, (o) => o.monthlyValue), firstYear: sum(open, (o) => firstYear(o.implementationValue, o.monthlyValue)) },
    weightedPipeline: { ...weighted, firstYear: round(weighted.implementation + 12 * weighted.monthly, 0) },
    newLeads: newAccounts.length,
    won: { count: won.length, implementation: sum(won, (o) => o.implementationValue), monthly: sum(won, (o) => o.monthlyValue) },
    lost: { count: lost.length, implementation: sum(lost, (o) => o.implementationValue), monthly: sum(lost, (o) => o.monthlyValue) },
    /** Vundet / (vundet + tabt) blandt salgsmuligheder lukket i perioden. */
    winRate: closed.length ? round(won.length / closed.length, 3) : null,
    /** Andel af perioden nye leads, der i dag er aktive kunder. */
    leadToCustomerRate: newAccounts.length ? round(leadConverted / newAccounts.length, 3) : null,
    averageDeal: inPeriodAgreements.length
      ? { count: inPeriodAgreements.length, implementation: round(sum(inPeriodAgreements, (a) => a.implementation) / inPeriodAgreements.length, 0), monthly: round(sum(inPeriodAgreements, (a) => a.monthly) / inPeriodAgreements.length, 0) }
      : null,
    byStage,
    expectedClose,
    byCategory,
    series,
    forecast: {
      /** Aftalt MRR × 12 — kontraheret, ikke faktureret. */
      contractedRecurring12m: mrr * 12,
      /** Σ sandsynlighed × (implementering + 12 × månedlig) for åbne salgsmuligheder. */
      weightedPipelineFirstYear: round(weighted.implementation + 12 * weighted.monthly, 0),
    },
    quotesWithoutOpportunity: s.quotes.filter((q) => (q.status === "draft" || q.status === "sent") && !s.snap.opportunities.some((o) => o.quoteId === q.id)).length,
  };
}

function financeSection(s: Scoped, list: Agreement[]) {
  const { period, snap } = s;
  const nowPlus = new Date(ms(snap.now) + 1).toISOString();
  const mrr = mrrAt(list, nowPlus);
  const inPeriodAgreements = list.filter((a) => inPeriod(a.agreedAt, period));
  const open = s.opportunities.filter((o) => o.status === "open");
  const wonOpps = s.opportunities.filter((o) => o.status === "won" && inPeriod(o.closedAt, period));
  const periodCosts = s.costs.filter((c) => inPeriod(c.at, period));
  const periodJobs = s.jobs.filter((j) => inPeriod(j.createdAt, period));
  const projectName = new Map(s.projects.map((p) => [p.id, p]));
  const earliest = list.map((a) => a.agreedAt).sort()[0] ?? null;
  const axis = buckets(period, earliest);

  const perCustomer = new Map<string, { name: string; projectCosts: number; aiCostUsd: number; subscriptionRuns: number; implementation: number; monthly: number }>();
  const touch = (key: string, name: string) => {
    const cur = perCustomer.get(key) ?? { name, projectCosts: 0, aiCostUsd: 0, subscriptionRuns: 0, implementation: 0, monthly: 0 };
    perCustomer.set(key, cur);
    return cur;
  };
  for (const c of periodCosts) {
    const p = projectName.get(c.projectId);
    if (p) touch(customerKeyFor(p.brandId, p.customerName), p.customerName).projectCosts += c.amount;
  }
  for (const j of periodJobs) {
    const p = j.projectId ? projectName.get(j.projectId) : undefined;
    const key = p ? customerKeyFor(p.brandId, p.customerName) : j.brandId ?? (j.customerName ? customerKeyFor(null, j.customerName) : null);
    if (!key) continue;
    const row = touch(key, p?.customerName ?? j.customerName ?? "Ukendt");
    row.aiCostUsd += j.apiCostUsd;
    row.subscriptionRuns += j.subscriptionRuns;
  }
  for (const a of list) {
    const row = perCustomer.get(a.customerKey);
    if (row) {
      row.implementation += a.implementation;
      row.monthly += a.monthly;
    }
  }

  const perProject = s.projects
    .filter((p) => p.status !== "cancelled")
    .map((p) => {
      const costs = s.costs.filter((c) => c.projectId === p.id);
      const jobs = s.jobs.filter((j) => j.projectId === p.id);
      const value = firstYear(p.implementationPrice, p.monthlyPrice);
      const registered = sum(costs, (c) => c.amount);
      return {
        id: p.id,
        name: p.name,
        customerName: p.customerName,
        isDemo: p.isDemo,
        firstYearValue: value,
        registeredCosts: registered,
        costEntries: costs.length,
        simulatedCosts: costs.filter((c) => c.simulated).length,
        aiCostUsd: round(sum(jobs, (j) => j.apiCostUsd), 4),
        /** Kun når der er registreret mindst én omkostning — ellers ville "bidraget" bare være prisen. */
        contributionEstimate: costs.length ? value - registered : null,
      };
    })
    .sort((a, b) => b.registeredCosts - a.registeredCosts || b.firstYearValue - a.firstYearValue);

  const withCosts = perProject.filter((p) => p.contributionEstimate !== null);
  const perEngine = (["internal", "claude_api", "claude_code", "none"] as const).map((e) => {
    const jobs = periodJobs.filter((j) => (e === "none" ? j.engine === null : j.engine === e));
    return { key: e, label: ENGINE_LABELS[e], jobs: jobs.length, apiCostUsd: round(sum(jobs, (j) => j.apiCostUsd), 4), subscriptionRuns: sum(jobs, (j) => j.subscriptionRuns) };
  });

  return {
    /** De fem økonomiske niveauer — holdes adskilt. */
    levels: [
      { key: "pipeline", label: "Pipelineværdi (åben)", available: true, kind: "stock" as const, implementation: sum(open, (o) => o.implementationValue), monthly: sum(open, (o) => o.monthlyValue), note: "Åbne salgsmuligheder i CRM. Ikke vundet." },
      { key: "won", label: "Vundne aftaler (CRM)", available: true, kind: "flow" as const, implementation: sum(wonOpps, (o) => o.implementationValue), monthly: sum(wonOpps, (o) => o.monthlyValue), note: "Salgsmuligheder markeret vundet i perioden." },
      { key: "contracted", label: "Kontraktligt aftalt", available: true, kind: "flow" as const, implementation: sum(inPeriodAgreements, (a) => a.implementation), monthly: sum(inPeriodAgreements, (a) => a.monthly), note: "Projekter, accepterede tilbud og vundne aftaler indgået i perioden — hver aftale én gang." },
      { key: "invoiced", label: "Faktisk faktureret", available: false, kind: "flow" as const, implementation: null, monthly: null, note: "Ikke tilgængelig: platformen har endnu ingen faktureringsdata." },
      { key: "paid", label: "Faktisk modtaget betaling", available: false, kind: "flow" as const, implementation: null, monthly: null, note: "Ikke tilgængelig: platformen har endnu ingen betalingsdata." },
    ],
    agreedImplementation: sum(inPeriodAgreements, (a) => a.implementation),
    agreedCount: inPeriodAgreements.length,
    mrr,
    arr: mrr * 12,
    projectCosts: sum(periodCosts, (c) => c.amount),
    projectCostEntries: periodCosts.length,
    simulatedCostEntries: periodCosts.filter((c) => c.simulated).length,
    aiCostUsd: round(sum(periodJobs, (j) => j.apiCostUsd), 4),
    subscriptionRuns: sum(periodJobs, (j) => j.subscriptionRuns),
    perCustomer: Array.from(perCustomer.entries())
      .map(([key, v]) => ({ key, ...v, aiCostUsd: round(v.aiCostUsd, 4) }))
      .filter((r) => r.projectCosts > 0 || r.aiCostUsd > 0 || r.subscriptionRuns > 0)
      .sort((a, b) => b.projectCosts - a.projectCosts || b.aiCostUsd - a.aiCostUsd),
    perProject,
    perEngine,
    contribution: withCosts.length
      ? { projects: withCosts.length, firstYearValue: sum(withCosts, (p) => p.firstYearValue), registeredCosts: sum(withCosts, (p) => p.registeredCosts), estimate: sum(withCosts, (p) => p.contributionEstimate!) }
      : null,
    agreements: list.sort((a, b) => b.agreedAt.localeCompare(a.agreedAt)),
    series: axis.map((b) => ({
      key: b.key,
      label: b.label,
      values: {
        agreedImplementation: sum(
          list.filter((a) => ms(a.agreedAt) >= ms(b.start) && ms(a.agreedAt) < ms(b.end)),
          (a) => a.implementation,
        ),
        mrr: mrrAt(list, b.end),
        projectCosts: sum(
          s.costs.filter((c) => ms(c.at) >= ms(b.start) && ms(c.at) < ms(b.end)),
          (c) => c.amount,
        ),
      },
    })) as SeriesPoint[],
  };
}

function deliverySection(s: Scoped) {
  const { period, snap } = s;
  const today = dateOnly(snap.now);
  const projects = s.deliveryProjects;
  const open = projects.filter((p) => p.status === "active" || p.status === "on_hold");
  const delivered = projects.filter((p) => p.deliveredAt && inPeriod(p.deliveredAt, period));
  const durations = delivered.map((p) => (ms(p.deliveredAt!) - ms(p.startDate ?? p.createdAt)) / DAY).filter((d) => d >= 0);
  const withTarget = delivered.filter((p) => p.targetDate);
  const onTime = withTarget.filter((p) => dateOnly(p.deliveredAt!) <= p.targetDate!);
  const openIds = new Set(open.map((p) => p.id));
  const horizon = new Date(ms(today) + 21 * DAY).toISOString().slice(0, 10);
  const byId = new Map(projects.map((p) => [p.id, p]));
  const deadlines = [
    ...s.tasks
      .filter((t) => openIds.has(t.projectId) && t.required && t.status !== "done" && t.dueDate && t.dueDate <= horizon)
      .map((t) => ({ projectId: t.projectId, projectName: byId.get(t.projectId)!.name, title: t.title, date: t.dueDate!, kind: "task" as const, overdue: t.dueDate! < today })),
    ...open.filter((p) => p.targetDate && p.targetDate <= new Date(ms(today) + 30 * DAY).toISOString().slice(0, 10)).map((p) => ({ projectId: p.id, projectName: p.name, title: "Forventet levering", date: p.targetDate!, kind: "project" as const, overdue: p.targetDate! < today })),
  ].sort((a, b) => a.date.localeCompare(b.date) || a.projectName.localeCompare(b.projectName));

  const earliest = projects.map((p) => p.deliveredAt ?? p.createdAt).sort()[0] ?? null;
  const axis = buckets(period, earliest);
  return {
    total: projects.length,
    active: open.length,
    overdue: projects.filter((p) => p.overdue).length,
    pendingApprovals: projects.filter((p) => p.pendingApprovalId).length,
    deliveredInPeriod: delivered.length,
    inMaintenance: projects.filter((p) => p.status === "maintenance").length,
    avgCompletionDays: durations.length ? round(sum(durations, (d) => d) / durations.length, 1) : null,
    onTimeRate: withTarget.length ? round(onTime.length / withTarget.length, 3) : null,
    byPhase: snap.phases.map((ph) => ({ key: ph.key, label: ph.label, count: projects.filter((p) => p.phase === ph.key && p.status !== "cancelled").length })),
    projects: projects
      .map((p) => ({ id: p.id, name: p.name, customerName: p.customerName, phase: p.phaseLabel, status: p.status, overdue: p.overdue, targetDate: p.targetDate, openTasks: p.openTasks, blockedTasks: s.tasks.filter((t) => t.projectId === p.id && t.status === "blocked").length, agents: p.agents.length, pendingApproval: Boolean(p.pendingApprovalId), isDemo: p.isDemo }))
      .sort((a, b) => Number(b.overdue) - Number(a.overdue) || b.openTasks - a.openTasks),
    deadlines: deadlines.slice(0, 15),
    agents: snap.agents
      .map((a) => {
        const assigned = open.filter((p) => p.agents.some((x) => x.agentId === a.id));
        return { id: a.id, name: a.name, color: a.color, projects: assigned.length, openTasks: s.tasks.filter((t) => t.assigneeId === a.id && t.status !== "done" && openIds.has(t.projectId)).length, roles: Array.from(new Set(assigned.flatMap((p) => p.agents.filter((x) => x.agentId === a.id).map((x) => x.role)))) };
      })
      .filter((a) => a.projects > 0)
      .sort((a, b) => b.openTasks - a.openTasks || b.projects - a.projects),
    series: axis.map((b) => {
      const list = projects.filter((p) => p.deliveredAt && ms(p.deliveredAt) >= ms(b.start) && ms(p.deliveredAt) < ms(b.end));
      return { key: b.key, label: b.label, values: { onTime: list.filter((p) => p.targetDate && dateOnly(p.deliveredAt!) <= p.targetDate).length, late: list.filter((p) => !p.targetDate || dateOnly(p.deliveredAt!) > p.targetDate).length } };
    }) as SeriesPoint[],
  };
}

function aiSection(s: Scoped) {
  const { period, snap } = s;
  const inP = s.jobs.filter((j) => inPeriod(j.createdAt, period));
  const finished = inP.filter((j) => (j.status === "succeeded" || j.status === "failed") && j.startedAt && j.finishedAt);
  const durations = finished.map((j) => (ms(j.finishedAt!) - ms(j.startedAt!)) / 1000).filter((d) => d >= 0);
  const count = (st: SnapshotJob["status"]) => inP.filter((j) => j.status === st).length;
  const earliest = s.jobs.map((j) => j.createdAt).sort()[0] ?? null;
  const axis = buckets(period, earliest);
  const realRuns = snap.jobs.filter((j) => (j.engine === "claude_api" || j.engine === "claude_code") && j.status === "succeeded").length;
  return {
    registered: inP.length,
    active: s.jobs.filter((j) => OPEN_JOB.has(j.status)).length,
    succeeded: count("succeeded"),
    failed: count("failed"),
    blocked: count("blocked"),
    cancelled: count("cancelled"),
    avgDurationSec: durations.length ? round(sum(durations, (d) => d) / durations.length, 1) : null,
    apiCostUsd: round(sum(inP, (j) => j.apiCostUsd), 4),
    tokens: { input: sum(inP, (j) => j.inputTokens), output: sum(inP, (j) => j.outputTokens) },
    subscriptionRuns: sum(inP, (j) => j.subscriptionRuns),
    /** Gennemførte job på Claude API eller Claude Code (hele historikken). 0 = ingen rigtige AI-kørsler endnu. */
    realAiRuns: realRuns,
    byStatus: (["succeeded", "failed", "blocked", "cancelled", "queued", "awaiting_approval", "dispatched", "running"] as const).map((st) => ({ key: st, count: count(st) })),
    perAgent: snap.agents
      .map((a) => {
        const mine = inP.filter((j) => j.agentId === a.id);
        return { id: a.id, name: a.name, color: a.color, enabled: a.enabled, jobs: mine.length, succeeded: mine.filter((j) => j.status === "succeeded").length, failed: mine.filter((j) => j.status === "failed").length, blocked: mine.filter((j) => j.status === "blocked").length, apiCostUsd: round(sum(mine, (j) => j.apiCostUsd), 4), subscriptionRuns: sum(mine, (j) => j.subscriptionRuns) };
      })
      .sort((a, b) => b.jobs - a.jobs || a.name.localeCompare(b.name)),
    perEngine: (["internal", "claude_api", "claude_code", "none"] as const).map((e) => {
      const mine = inP.filter((j) => (e === "none" ? j.engine === null : j.engine === e));
      return { key: e, label: ENGINE_LABELS[e], jobs: mine.length, succeeded: mine.filter((j) => j.status === "succeeded").length, apiCostUsd: round(sum(mine, (j) => j.apiCostUsd), 4), subscriptionRuns: sum(mine, (j) => j.subscriptionRuns) };
    }),
    budget: snap.budget,
    recentActivity: snap.recentActivity
      .filter((e) => s.jobs.some((j) => j.id === e.jobId))
      .slice(0, 10)
      .map((e) => ({ ...e, agentName: snap.agents.find((a) => a.id === e.agentId)?.name ?? null })),
    series: axis.map((b) => {
      const list = s.jobs.filter((j) => ms(j.createdAt) >= ms(b.start) && ms(j.createdAt) < ms(b.end));
      return { key: b.key, label: b.label, values: { succeeded: list.filter((j) => j.status === "succeeded").length, failed: list.filter((j) => j.status === "failed").length, other: list.filter((j) => j.status !== "succeeded" && j.status !== "failed").length } };
    }) as SeriesPoint[],
  };
}

// ─── Action Center ─────────────────────────────────────────────────────────

const SEVERITY_ORDER: Record<ActionSeverity, number> = { critical: 0, high: 1, medium: 2, low: 3 };

/** Deterministiske regler over registrerede data. Ingen AI-vurdering. */
export function actionItems(s: Scoped): ActionItem[] {
  const { snap } = s;
  const now = ms(snap.now);
  const today = dateOnly(snap.now);
  const out: ActionItem[] = [];
  const accountName = (id: string) => s.accountById.get(id)?.name ?? "Ukendt";

  for (const a of s.activities) {
    if (a.status !== "planned" || ms(a.dueAt) >= now) continue;
    const days = Math.floor((now - ms(a.dueAt)) / DAY);
    out.push({ id: `followup:${a.id}`, rule: "overdue_followup", severity: days >= 3 ? "high" : "medium", title: `Forsinket opfølgning: ${a.subject}`, detail: days >= 1 ? `${days} dag(e) over tid` : "Over tid i dag", href: `/crm/companies/${a.accountId}?tab=activities`, module: "crm", customerName: accountName(a.accountId), at: a.dueAt });
  }
  for (const o of s.opportunities) {
    if (o.status !== "open") continue;
    const hasNext = s.activities.some((a) => a.status === "planned" && ms(a.dueAt) >= now && (a.opportunityId === o.id || (a.opportunityId === null && a.accountId === o.accountId)));
    if (!hasNext) out.push({ id: `nonext:${o.id}`, rule: "opportunity_without_next_activity", severity: "medium", title: `Ingen næste aktivitet: ${o.title}`, detail: "Planlæg næste skridt, så salgsmuligheden ikke går i stå.", href: `/crm/companies/${o.accountId}?tab=activities`, module: "crm", customerName: accountName(o.accountId), at: null });
    if (o.expectedCloseDate && o.expectedCloseDate < today) out.push({ id: `closedate:${o.id}`, rule: "close_date_passed", severity: "medium", title: `Forventet lukning passeret: ${o.title}`, detail: `Forventet lukning ${o.expectedCloseDate}. Opdatér dato eller luk salgsmuligheden.`, href: `/crm/companies/${o.accountId}?tab=opportunities`, module: "crm", customerName: accountName(o.accountId), at: o.expectedCloseDate });
  }
  for (const p of s.deliveryProjects) {
    const open = p.status === "active" || p.status === "on_hold";
    if (p.overdue) out.push({ id: `overdue:${p.id}`, rule: "project_overdue", severity: "high", title: `Forsinket projekt: ${p.name}`, detail: p.targetDate && p.targetDate < today ? `Leveringsdato ${p.targetDate} er overskredet.` : "Påkrævede opgaver er mere end 7 dage over tid.", href: `/production/projects/${p.id}`, module: "production", customerName: p.customerName, at: p.targetDate });
    if (open && !p.agents.some((a) => a.role === "project_lead")) out.push({ id: `nolead:${p.id}`, rule: "project_without_lead", severity: "medium", title: `Ingen projektleder: ${p.name}`, detail: p.agents.length ? "Der er tilknyttet agenter, men ingen med rollen projektleder." : "Ingen ansvarlige er tilknyttet projektet.", href: `/production/projects/${p.id}?tab=agents`, module: "production", customerName: p.customerName, at: null });
    if (open && !p.overdue && p.targetDate && p.targetDate >= today && p.targetDate <= new Date(now + 14 * DAY).toISOString().slice(0, 10)) out.push({ id: `upcoming:${p.id}`, rule: "delivery_upcoming", severity: "low", title: `Levering inden for 14 dage: ${p.name}`, detail: `Forventet levering ${p.targetDate}.`, href: `/production/projects/${p.id}`, module: "production", customerName: p.customerName, at: p.targetDate });
    const blocked = s.tasks.filter((t) => t.projectId === p.id && t.status === "blocked");
    if (open && blocked.length) out.push({ id: `blocked:${p.id}`, rule: "blocked_tasks", severity: "medium", title: `${blocked.length} blokeret(e) opgave(r): ${p.name}`, detail: blocked.map((t) => t.title).slice(0, 2).join(", "), href: `/production/projects/${p.id}?tab=tasks`, module: "production", customerName: p.customerName, at: null });
  }
  for (const a of s.approvals) {
    if (a.status !== "pending") continue;
    const days = Math.floor((now - ms(a.requestedAt)) / DAY);
    out.push({ id: `approval:${a.id}`, rule: "approval_pending", severity: days >= 2 ? "high" : "medium", title: `Afventer godkendelse: ${a.title}`, detail: days >= 1 ? `Anmodet for ${days} dag(e) siden.` : "Anmodet i dag.", href: `/aos/approvals`, module: "aos", customerName: null, at: a.requestedAt });
  }
  for (const j of s.jobs) {
    if (j.status !== "failed" || now - ms(j.finishedAt ?? j.createdAt) > 30 * DAY) continue;
    out.push({ id: `job:${j.id}`, rule: "job_failed", severity: "medium", title: `Fejlet AI-job: ${j.title}`, detail: j.error ?? "Se fejlen i Job Center.", href: `/aos/jobs/${j.id}`, module: "aos", customerName: j.customerName, at: j.finishedAt ?? j.createdAt });
  }
  for (const q of s.quotes) {
    if (q.status === "sent" && now - ms(q.updatedAt) > 14 * DAY) out.push({ id: `quote:${q.id}`, rule: "quote_awaiting_answer", severity: "medium", title: `Tilbud uden svar: ${q.number}`, detail: `Sendt for ${Math.floor((now - ms(q.updatedAt)) / DAY)} dage siden. Følg op hos kunden.`, href: `/quotes/${q.id}`, module: "quotes", customerName: q.customerName, at: q.updatedAt });
    if ((q.status === "draft" || q.status === "sent") && !snap.opportunities.some((o) => o.quoteId === q.id)) out.push({ id: `quotecrm:${q.id}`, rule: "quote_without_opportunity", severity: "low", title: `Tilbud uden salgsmulighed i CRM: ${q.number}`, detail: "Tilbuddet indgår ikke i pipelinen. Opret kunden og salgsmuligheden i CRM.", href: `/quotes/${q.id}`, module: "quotes", customerName: q.customerName, at: q.updatedAt });
  }
  return out.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || (a.at ?? "9999").localeCompare(b.at ?? "9999") || a.id.localeCompare(b.id));
}

// ─── Samlet ────────────────────────────────────────────────────────────────

export function computeDashboard(snap: AnalyticsSnapshot, filter: DashboardFilter): DashboardData {
  const s = scope(snap, filter);
  const list = agreements(s);
  const sales = salesSection(s, list);
  const finance = financeSection(s, list);
  const delivery = deliverySection(s);
  const ai = aiSection(s);
  const actions = actionItems(s);
  const customers = activeCustomerKeys(s, list);
  const q = (extra: Partial<DashboardFilter>) => filterToQuery({ ...filter, ...extra });
  const periodLabel = s.period.label.toLowerCase();
  const pendingApprovals = s.approvals.filter((a) => a.status === "pending").length;

  const kpis: Kpi[] = [
    { key: "pipeline", label: "Samlet pipelineværdi", value: sales.openPipeline.firstYear, unit: "dkk", kind: "stock", sub: `${sales.openPipeline.count} åbne · første års værdi`, href: "/crm/pipeline" },
    { key: "pipeline-implementation", label: "Pipeline — engangsbetalinger", value: sales.openPipeline.implementation, unit: "dkk", kind: "stock", sub: `vægtet ${fmt(sales.weightedPipeline.implementation)} kr.`, href: "/crm/pipeline" },
    { key: "pipeline-monthly", label: "Pipeline — månedlige betalinger", value: sales.openPipeline.monthly, unit: "dkk_month", kind: "stock", sub: `vægtet ${fmt(sales.weightedPipeline.monthly)} kr./md.`, href: "/crm/pipeline" },
    { key: "customers", label: "Aktive kunder", value: customers.size, unit: "count", kind: "stock", sub: "unikke kunder med aftale eller kundestatus", href: "/crm/companies?status=customer" },
    { key: "new-leads", label: "Nye leads", value: sales.newLeads, unit: "count", kind: "flow", sub: periodLabel, href: "/crm/companies?status=leads" },
    { key: "won", label: "Vundne aftaler", value: sales.won.count, unit: "count", kind: "flow", sub: `${periodLabel} · ${fmt(sales.won.implementation)} kr. + ${fmt(sales.won.monthly)} kr./md.`, href: "/crm/pipeline?status=won", tone: "success" },
    { key: "lost", label: "Tabte aftaler", value: sales.lost.count, unit: "count", kind: "flow", sub: periodLabel, href: "/crm/pipeline?status=lost" },
    { key: "active-projects", label: "Aktive projekter", value: delivery.active, unit: "count", kind: "stock", sub: `${delivery.total} i alt`, href: `/dashboard/delivery${q({ projectStatus: "active" })}` },
    { key: "overdue-projects", label: "Forsinkede projekter", value: delivery.overdue, unit: "count", kind: "stock", sub: "efter Produktions regel", href: `/dashboard/delivery${q({ projectStatus: "overdue" })}`, tone: delivery.overdue ? "danger" : "default" },
    { key: "active-jobs", label: "Aktive AI-jobs", value: ai.active, unit: "count", kind: "stock", sub: `${ai.registered} registreret · ${periodLabel}`, href: `/dashboard/ai${q({})}` },
    { key: "ai-costs", label: "Registrerede AI-omkostninger", value: ai.apiCostUsd, unit: "usd", kind: "flow", sub: `API · ${ai.subscriptionRuns} Claude Code-kørsler separat`, href: `/dashboard/finance${q({})}` },
    { key: "approvals", label: "Afventende godkendelser", value: pendingApprovals, unit: "count", kind: "stock", sub: "i AOS' Approval Manager", href: "/aos/approvals", tone: pendingApprovals ? "warning" : "default" },
  ];

  const total = snap.accounts.length + snap.opportunities.length + snap.quotes.length + snap.projects.length + snap.jobs.length;
  const demo = snap.accounts.filter((a) => a.isDemo).length + snap.opportunities.filter((o) => o.isDemo).length + snap.projects.filter((p) => p.isDemo).length;
  const brandNames = new Map<string, string>();
  for (const a of snap.accounts) brandNames.set(a.brandId, a.name);
  for (const p of snap.projects) if (p.brandId && !brandNames.has(p.brandId)) brandNames.set(p.brandId, p.customerName);
  for (const qq of snap.quotes) if (qq.brandId && !brandNames.has(qq.brandId)) brandNames.set(qq.brandId, qq.customerName);

  return {
    mode: snap.mode,
    generatedAt: snap.now,
    period: s.period,
    filter,
    options: {
      customers: Array.from(brandNames.entries())
        .map(([value, label]) => ({ value, label }))
        .sort((a, b) => a.label.localeCompare(b.label, "da")),
      agents: snap.agents.map((a) => ({ value: a.id, label: a.name })),
    },
    basis: { empty: total === 0, demoRecords: demo, totalRecords: total, realAiRuns: ai.realAiRuns, simulatedCosts: snap.costs.filter((c) => c.simulated).length },
    overview: { kpis },
    sales,
    finance,
    delivery,
    ai,
    actions,
  };
}

const fmt = (n: number) => Math.round(n).toLocaleString("da-DK");

// ─── Beregningsmetoder (vises i UI og docs) ────────────────────────────────

export const DEFINITIONS: Definition[] = [
  { key: "pipeline", label: "Samlet pipelineværdi", kind: "stock", source: "CRM: åbne salgsmuligheder", rule: "Σ (implementering + 12 × månedlig) for åbne salgsmuligheder. Engangs- og månedlige beløb vises også hver for sig." },
  { key: "weighted", label: "Vægtet pipeline", kind: "estimate", source: "CRM", rule: "Σ sandsynlighed × beløb. Sandsynligheden er salgsmulighedens egen (standard pr. stadie)." },
  { key: "customers", label: "Aktive kunder", kind: "stock", source: "CRM, Tilbud, Produktion", rule: "Unikke kunder (brand-id) med CRM-status Aktiv kunde eller mindst én aftale. En kunde med flere tilbud, salgsmuligheder og projekter tælles én gang." },
  { key: "new-leads", label: "Nye leads", kind: "flow", source: "CRM: virksomheder", rule: "Virksomheder oprettet i CRM i perioden." },
  { key: "won-lost", label: "Vundne / tabte aftaler", kind: "flow", source: "CRM: salgsmuligheder", rule: "Salgsmuligheder lukket som vundet eller tabt i perioden (lukkedato)." },
  { key: "win-rate", label: "Konverteringsrate", kind: "flow", source: "CRM", rule: "Vundne ÷ (vundne + tabte) blandt salgsmuligheder lukket i perioden. Vises ikke, hvis ingen er lukket." },
  { key: "agreements", label: "Kontraktligt aftalt (aftaler)", kind: "flow", source: "Produktion, Tilbud, CRM", rule: "Hver aftale tælles én gang: projekt > accepteret tilbud uden projekt > vundet salgsmulighed uden tilbud/projekt. Aftaledato = projektets oprettelse (eller tidligere startdato), accept eller lukning." },
  { key: "average-deal", label: "Gennemsnitlig aftaleværdi", kind: "flow", source: "Aftaler", rule: "Gennemsnit af aftaler indgået i perioden — implementering og månedlig hver for sig." },
  { key: "mrr", label: "Aftalt MRR", kind: "stock", source: "Aftaler", rule: "Σ månedlige beløb for alle ikke-annullerede aftaler pr. nu. En beholdning — aldrig en sum af måneder. ARR = MRR × 12." },
  { key: "mrr-series", label: "MRR-udvikling", kind: "stock", source: "Aftaler", rule: "Aftalt MRR ved udgangen af hvert interval (aftaler indgået før tidspunktet). Annulleringer har ingen dato og er udeladt fra hele historikken." },
  { key: "invoiced", label: "Faktureret / modtaget betaling", kind: "flow", source: "—", rule: "Ikke tilgængelig. Platformen har ingen faktura- eller betalingsdata; tallene vises derfor ikke." },
  { key: "project-costs", label: "Projektomkostninger", kind: "flow", source: "Produktion: registrerede omkostninger", rule: "Σ registrerede omkostninger (DKK) i perioden. Demo-omkostninger er markeret som simulerede." },
  { key: "ai-costs", label: "AI-omkostninger", kind: "flow", source: "AOS: Job Center", rule: "Σ registreret API-omkostning (USD) for job oprettet i perioden. Claude Code-abonnement vises som antal kørsler — uden USD-pris. Ingen valutaomregning." },
  { key: "contribution", label: "Estimeret dækningsbidrag", kind: "estimate", source: "Produktion", rule: "Kun projekter med registrerede omkostninger: første års værdi (implementering + 12 × månedlig) − registrerede omkostninger (DKK). AI-omkostninger i USD indgår ikke." },
  { key: "category", label: "Salg pr. servicekategori", kind: "flow", source: "Servicekatalog", rule: "En aftales eller salgsmuligheds beløb fordeles på dens services vægtet efter katalogets implementeringspris." },
  { key: "pipeline-series", label: "Pipelineudvikling", kind: "stock", source: "CRM", rule: "Åben pipeline ved udgangen af hvert interval, rekonstrueret fra oprettelses- og lukkedatoer med salgsmulighedernes aktuelle beløb." },
  { key: "forecast", label: "Forventet omsætning (12 mdr.)", kind: "estimate", source: "Aftaler + CRM", rule: "Kontraheret: aftalt MRR × 12. Pipeline: Σ sandsynlighed × (implementering + 12 × månedlig). Vises hver for sig — ikke faktureret." },
  { key: "projects", label: "Aktive / forsinkede projekter", kind: "stock", source: "Produktion", rule: "Aktive: status aktiv eller pause. Forsinket: Produktions egen regel (leveringsdato overskredet eller påkrævede opgaver >7 dage over tid)." },
  { key: "delivery", label: "Leveringsperformance", kind: "flow", source: "Produktion: fasehistorik", rule: "Leveret til tiden = overgang til Leveret senest på leveringsdatoen. Gennemførelsestid = startdato (eller oprettelse) → Leveret." },
  { key: "jobs", label: "AI-jobs", kind: "flow", source: "AOS: Job Center", rule: "Job oprettet i perioden pr. status, agent og motor. Aktive job er en beholdning (i kø, afventer, sendt, kører)." },
  { key: "actions", label: "Action Center", kind: "stock", source: "Alle moduler", rule: "Faste regler: forsinkede opfølgninger, salgsmuligheder uden næste aktivitet eller med passeret lukkedato, forsinkede projekter, projekter uden projektleder, blokerede opgaver, levering inden for 14 dage, afventende godkendelser, fejlede job (30 dage), tilbud uden svar (14 dage) og tilbud uden salgsmulighed." },
];
