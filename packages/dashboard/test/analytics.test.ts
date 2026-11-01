import { describe, expect, it } from "vitest";
import { agreements, computeDashboard, DashboardFilterSchema, mrrAt, parseFilter, resolvePeriod, type AnalyticsSnapshot } from "@agency/dashboard";

/** Fast "nu" — beregningerne må aldrig afhænge af systemuret. */
const NOW = "2026-11-01T12:00:00.000Z";
const daysAgo = (n: number) => new Date(Date.parse(NOW) - n * 86_400_000).toISOString();
const dayStr = (n: number) => daysAgo(n).slice(0, 10);

function snapshot(over: Partial<AnalyticsSnapshot> = {}): AnalyticsSnapshot {
  return {
    mode: "demo",
    now: NOW,
    catalog: [
      { id: "svc_ai_receptionist", name: "AI-receptionist", category: "customer_contact", implementationPrice: 24500 },
      { id: "svc_crm_system", name: "CRM-system", category: "sales_marketing", implementationPrice: 34500 },
      { id: "svc_workflow_automation", name: "Workflow", category: "automation", implementationPrice: 22500 },
    ],
    stages: [
      { key: "qualified", label: "Kvalificeret" },
      { key: "quote_sent", label: "Tilbud sendt" },
      { key: "won", label: "Vundet" },
      { key: "lost", label: "Tabt" },
    ],
    phases: [
      { key: "development", label: "Udvikling" },
      { key: "delivered", label: "Leveret" },
      { key: "maintenance", label: "Vedligeholdelse" },
    ],
    accounts: [],
    opportunities: [],
    activities: [],
    quotes: [],
    projects: [],
    tasks: [],
    costs: [],
    jobs: [],
    agents: [
      { id: "agt_atlas", name: "Atlas", role: "Projektleder", color: "#000", enabled: true },
      { id: "agt_scout", name: "Scout", role: "Research", color: "#111", enabled: true },
    ],
    approvals: [],
    recentActivity: [],
    budget: { aiSpentTodayUsd: 0, aiDailyBudgetUsd: 5, claudeCodeRunsToday: 0, claudeCodeDailyLimit: 20, apiConfigured: false, claudeCodeConfigured: false },
    ...over,
  };
}

const account = (id: string, brandId: string, name: string, extra: Partial<AnalyticsSnapshot["accounts"][number]> = {}) => ({ id, brandId, name, status: "qualified" as const, source: "research", owner: "Mig", isDemo: true, createdAt: daysAgo(5), ...extra });
const opp = (id: string, accountId: string, extra: Partial<AnalyticsSnapshot["opportunities"][number]> = {}) => ({
  id,
  accountId,
  title: `Mulighed ${id}`,
  services: ["svc_ai_receptionist"],
  implementationValue: 24500,
  monthlyValue: 2900,
  probability: 50,
  stage: "qualified",
  status: "open" as const,
  expectedCloseDate: null,
  createdAt: daysAgo(10),
  closedAt: null,
  quoteId: null,
  projectId: null,
  owner: "Mig",
  isDemo: true,
  ...extra,
});
const project = (id: string, brandId: string | null, extra: Partial<AnalyticsSnapshot["projects"][number]> = {}) => ({
  id,
  brandId,
  customerName: "Kunde",
  name: `Projekt ${id}`,
  serviceBaseKey: "ai_receptionist",
  catalogItemId: "svc_ai_receptionist",
  status: "active" as const,
  phase: "development",
  phaseLabel: "Udvikling",
  phaseGroup: "development" as const,
  implementationPrice: 24500,
  monthlyPrice: 2900,
  startDate: null,
  targetDate: null,
  createdAt: daysAgo(3),
  deliveredAt: null,
  quoteId: null,
  isDemo: true,
  agents: [{ agentId: "agt_atlas", role: "project_lead" }],
  pendingApprovalId: null,
  overdue: false,
  openTasks: 0,
  ...extra,
});
const quote = (id: string, brandId: string | null, extra: Partial<AnalyticsSnapshot["quotes"][number]> = {}) => ({ id, number: `T-${id}`, brandId, customerName: "Kunde", status: "accepted" as const, implementation: 24500, monthly: 2900, services: ["svc_ai_receptionist"], createdAt: daysAgo(6), updatedAt: daysAgo(4), ...extra });
const job = (id: string, extra: Partial<AnalyticsSnapshot["jobs"][number]> = {}) => ({
  id,
  title: `Job ${id}`,
  module: "research",
  taskType: "research.brand_research",
  status: "succeeded" as const,
  engine: "internal" as const,
  agentId: "agt_scout",
  brandId: null,
  projectId: null,
  customerName: null,
  createdAt: daysAgo(2),
  startedAt: daysAgo(2),
  finishedAt: new Date(Date.parse(daysAgo(2)) + 4000).toISOString(),
  apiCostUsd: 0,
  subscriptionRuns: 0,
  inputTokens: 0,
  outputTokens: 0,
  error: null,
  ...extra,
});
const F = (raw: Record<string, unknown> = {}) => DashboardFilterSchema.parse(raw);

describe("Aftaler — ingen dobbeltoptælling", () => {
  it("én kunde med salgsmulighed, accepteret tilbud og projekt tælles som én aftale og én kunde", () => {
    const snap = snapshot({
      accounts: [account("acc_1", "brd_1", "Restaurant Nord", { status: "customer" })],
      opportunities: [opp("sop_1", "acc_1", { status: "won", stage: "won", closedAt: daysAgo(4), quoteId: "qte_1", projectId: "prj_1" })],
      quotes: [quote("qte_1", "brd_1")],
      projects: [project("prj_1", "brd_1", { quoteId: "qte_1", customerName: "Restaurant Nord" })],
    });
    const d = computeDashboard(snap, F({ period: "all" }));
    expect(d.finance.agreements).toHaveLength(1);
    expect(d.finance.agreements[0]!.kind).toBe("project");
    expect(d.finance.mrr).toBe(2900);
    expect(d.finance.arr).toBe(2900 * 12);
    expect(d.overview.kpis.find((k) => k.key === "customers")!.value).toBe(1);
  });

  it("accepteret tilbud uden projekt og vundet salgsmulighed uden tilbud tælles hver én gang; annullerede projekter udelades", () => {
    const snap = snapshot({
      accounts: [account("acc_1", "brd_1", "A"), account("acc_2", "brd_2", "B")],
      opportunities: [
        opp("sop_q", "acc_1", { status: "won", stage: "won", closedAt: daysAgo(4), quoteId: "qte_1" }),
        opp("sop_manual", "acc_2", { status: "won", stage: "won", closedAt: daysAgo(2), monthlyValue: 1000, implementationValue: 5000 }),
      ],
      quotes: [quote("qte_1", "brd_1")],
      projects: [project("prj_x", "brd_3", { status: "cancelled", monthlyPrice: 9999 })],
    });
    const list = computeDashboard(snap, F({ period: "all" })).finance.agreements;
    expect(list.map((a) => a.kind).sort()).toEqual(["opportunity", "quote"]);
    expect(list.reduce((s, a) => s + a.monthly, 0)).toBe(3900);
  });

  it("vundet salgsmulighed, hvis tilbud ikke er accepteret (manuel sejr), tæller via salgsmuligheden", () => {
    const snap = snapshot({
      accounts: [account("acc_1", "brd_1", "A")],
      opportunities: [opp("sop_1", "acc_1", { status: "won", stage: "won", closedAt: daysAgo(1), quoteId: "qte_1" })],
      quotes: [quote("qte_1", "brd_1", { status: "sent" })],
    });
    const list = computeDashboard(snap, F()).finance.agreements;
    expect(list).toHaveLength(1);
    expect(list[0]!.kind).toBe("opportunity");
  });
});

describe("Beholdninger og flow", () => {
  const snap = snapshot({
    accounts: [account("acc_old", "brd_1", "Gammel", { createdAt: daysAgo(60), status: "customer" }), account("acc_new", "brd_2", "Ny", { createdAt: daysAgo(3) })],
    opportunities: [opp("sop_open", "acc_new"), opp("sop_won", "acc_old", { status: "won", stage: "won", closedAt: daysAgo(40), createdAt: daysAgo(50) })],
    projects: [project("prj_1", "brd_1", { createdAt: daysAgo(200), startDate: dayStr(210) }), project("prj_2", "brd_9", { createdAt: daysAgo(20), monthlyPrice: 1000 })],
  });

  it("perioden påvirker flow, men ikke beholdninger", () => {
    const week = computeDashboard(snap, F({ period: "7d" }));
    const all = computeDashboard(snap, F({ period: "all" }));
    const k = (d: typeof week, key: string) => d.overview.kpis.find((x) => x.key === key)!.value;
    expect(k(week, "new-leads")).toBe(1);
    expect(k(all, "new-leads")).toBe(2);
    expect(k(week, "won")).toBe(0);
    expect(k(all, "won")).toBe(1);
    for (const key of ["pipeline", "customers", "active-projects", "approvals"]) expect(k(week, key)).toBe(k(all, key));
    expect(week.finance.mrr).toBe(all.finance.mrr);
  });

  it("MRR-udviklingen er en beholdning pr. tidspunkt — ikke en sum af måneder", () => {
    const d = computeDashboard(snap, F({ period: "ytd" }));
    const series = d.finance.series.map((p) => p.values.mrr!);
    expect(series.at(-1)).toBe(d.finance.mrr);
    expect(series.every((v, i) => i === 0 || v >= series[i - 1]!)).toBe(true);
    // prj_1 + prj_2 + den vundne salgsmulighed uden projekt (hver aftale én gang).
    expect(Math.max(...series)).toBe(2900 + 1000 + 2900);
    const list = agreements({ projects: snap.projects, quotes: [], opportunities: [], categoryOf: () => null, accountById: new Map() });
    expect(mrrAt(list, daysAgo(100))).toBe(2900);
  });

  it("pipelinen viser engangs og månedlig separat og vægter med sandsynligheden", () => {
    const d = computeDashboard(snap, F());
    expect(d.sales.openPipeline).toMatchObject({ count: 1, implementation: 24500, monthly: 2900, firstYear: 24500 + 12 * 2900 });
    expect(d.sales.weightedPipeline).toMatchObject({ implementation: 12250, monthly: 1450 });
  });
});

describe("Økonomi", () => {
  it("faktureret og modtaget betaling er ikke tilgængelige og har ingen tal", () => {
    const d = computeDashboard(snapshot(), F());
    const levels = Object.fromEntries(d.finance.levels.map((l) => [l.key, l]));
    expect(levels.invoiced).toMatchObject({ available: false, implementation: null, monthly: null });
    expect(levels.paid).toMatchObject({ available: false, implementation: null, monthly: null });
  });

  it("dækningsbidrag beregnes kun for projekter med registrerede omkostninger", () => {
    const base = snapshot({ projects: [project("prj_1", "brd_1"), project("prj_2", "brd_2")] });
    expect(computeDashboard(base, F()).finance.contribution).toBeNull();
    const withCost = { ...base, costs: [{ projectId: "prj_1", at: daysAgo(1), amount: 8000, category: "hours", simulated: true }] };
    const d = computeDashboard(withCost, F());
    expect(d.finance.contribution).toEqual({ projects: 1, firstYearValue: 24500 + 12 * 2900, registeredCosts: 8000, estimate: 24500 + 12 * 2900 - 8000 });
    expect(d.finance.simulatedCostEntries).toBe(1);
  });

  it("API-omkostninger (USD) og Claude Code-kørsler holdes adskilt", () => {
    const d = computeDashboard(snapshot({ jobs: [job("aij_1", { engine: "claude_api", apiCostUsd: 0.12 }), job("aij_2", { engine: "claude_code", subscriptionRuns: 1 })] }), F());
    expect(d.ai.apiCostUsd).toBe(0.12);
    expect(d.ai.subscriptionRuns).toBe(1);
    expect(d.finance.perEngine.find((e) => e.key === "claude_code")).toMatchObject({ apiCostUsd: 0, subscriptionRuns: 1 });
    expect(d.ai.realAiRuns).toBe(2);
  });
});

describe("AI og agenter", () => {
  it("viser korrekt, at der ikke er rigtige AI-kørsler, når kun intern software har kørt", () => {
    const d = computeDashboard(snapshot({ jobs: [job("aij_1"), job("aij_2", { status: "blocked", engine: null, agentId: "agt_atlas", startedAt: null, finishedAt: null })] }), F());
    expect(d.ai.realAiRuns).toBe(0);
    expect(d.ai).toMatchObject({ registered: 2, succeeded: 1, blocked: 1, avgDurationSec: 4 });
    expect(d.ai.perEngine.find((e) => e.key === "none")!.jobs).toBe(1);
  });
});

describe("Filtre", () => {
  const snap = snapshot({
    accounts: [account("acc_1", "brd_1", "A"), account("acc_2", "brd_2", "B")],
    opportunities: [opp("sop_1", "acc_1"), opp("sop_2", "acc_2", { services: ["svc_crm_system"] })],
    projects: [project("prj_1", "brd_1", { overdue: true }), project("prj_2", "brd_2", { catalogItemId: "svc_crm_system", agents: [] })],
    jobs: [job("aij_1", { brandId: "brd_1" }), job("aij_2", { brandId: "brd_2", engine: "claude_api", agentId: "agt_atlas" })],
  });

  it("kunde-filteret afgrænser alle områder", () => {
    const d = computeDashboard(snap, F({ customer: "brd_2" }));
    expect(d.sales.openPipeline.count).toBe(1);
    expect(d.delivery.total).toBe(1);
    expect(d.ai.registered).toBe(1);
  });

  it("kategori, projektstatus, agent og motor virker på de relevante områder", () => {
    expect(computeDashboard(snap, F({ category: "sales_marketing" })).sales.openPipeline.count).toBe(1);
    expect(computeDashboard(snap, F({ projectStatus: "overdue" })).delivery.total).toBe(1);
    expect(computeDashboard(snap, F({ agent: "agt_atlas" })).ai.registered).toBe(1);
    expect(computeDashboard(snap, F({ engine: "internal" })).ai.registered).toBe(1);
  });

  it("ugyldige URL-filtre falder tilbage med en fejlbesked; valgfrit interval valideres", () => {
    expect(parseFilter({ period: "custom", from: "2026-10-10" })).toMatchObject({ filter: { period: "30d" }, error: expect.stringMatching(/start- og slutdato/) });
    expect(parseFilter({ period: "custom", from: "2026-10-20", to: "2026-10-01" }).error).toMatch(/før slutdatoen/);
    const ok = parseFilter({ period: "custom", from: "2026-10-01", to: "2026-10-31" });
    expect(ok.error).toBeNull();
    const p = resolvePeriod(ok.filter, NOW);
    expect(p).toMatchObject({ start: "2026-10-01T00:00:00.000Z", end: "2026-11-01T00:00:00.000Z", bucket: "day" });
    expect(parseFilter({ period: "nonsens" }).filter.period).toBe("30d");
  });
});

describe("Action Center", () => {
  it("finder handlinger med faste regler og stabil rækkefølge", () => {
    const snap = snapshot({
      accounts: [account("acc_1", "brd_1", "Kunde A")],
      opportunities: [opp("sop_1", "acc_1", { expectedCloseDate: dayStr(3) })],
      activities: [{ id: "act_1", accountId: "acc_1", opportunityId: null, kind: "call", subject: "Ring tilbage", status: "planned", dueAt: daysAgo(5), completedAt: null }],
      projects: [project("prj_1", "brd_1", { overdue: true, targetDate: dayStr(2), agents: [] })],
      tasks: [{ id: "ptk_1", projectId: "prj_1", title: "Afvent API-nøgle", status: "blocked", required: true, dueDate: null, assigneeId: null }],
      approvals: [{ id: "apr_1", title: "Faseport", category: "production", status: "pending", requestedAt: daysAgo(3), ref: { module: "production", entityId: "prj_1" }, aiJobId: null }],
      jobs: [job("aij_f", { status: "failed", error: "Timeout" })],
      quotes: [quote("qte_1", "brd_1", { status: "sent", updatedAt: daysAgo(20) })],
    });
    const actions = computeDashboard(snap, F()).actions;
    const rules = actions.map((a) => a.rule);
    for (const r of ["overdue_followup", "opportunity_without_next_activity", "close_date_passed", "project_overdue", "project_without_lead", "blocked_tasks", "approval_pending", "job_failed", "quote_awaiting_answer", "quote_without_opportunity"]) expect(rules).toContain(r);
    expect(actions[0]!.severity).toBe("high");
    expect(actions.every((a) => a.href.startsWith("/"))).toBe(true);
    expect(computeDashboard(snap, F()).actions).toEqual(actions);
  });
});

describe("Tidsakser", () => {
  it("hele perioden vælger opløsning ud fra tidligste aftale (inkl. projekters startdato)", () => {
    const d = computeDashboard(snapshot({ projects: [project("prj_1", "brd_1", { createdAt: daysAgo(1), startDate: dayStr(90) })] }), F({ period: "all" }));
    expect(d.period.bucket).toBe("week");
    expect(d.finance.series.length).toBeLessThanOrEqual(15);
    expect(d.finance.series.at(-1)!.values.mrr).toBe(2900);
  });
});

describe("Determinisme", () => {
  it("samme input giver samme output, og input ændres ikke", () => {
    const snap = snapshot({ accounts: [account("acc_1", "brd_1", "A")], opportunities: [opp("sop_1", "acc_1")], projects: [project("prj_1", "brd_1")] });
    const before = JSON.stringify(snap);
    expect(JSON.stringify(computeDashboard(snap, F({ period: "90d" })))).toBe(JSON.stringify(computeDashboard(snap, F({ period: "90d" }))));
    expect(JSON.stringify(snap)).toBe(before);
  });
});
