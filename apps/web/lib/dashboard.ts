import { getDailyUsage, usageLimits } from "@agency/core/server";
import type { Mode } from "@agency/core";
import { STAGES } from "@agency/crm";
import { listAccounts, listActivities, listOpportunities } from "@agency/crm/server";
import { computeDashboard, type AnalyticsSnapshot, type DashboardData, type DashboardFilter } from "@agency/dashboard";
import { isAiConfigured } from "@agency/integrations";
import { agentRegistry, engineAvailability, getActivity, listApprovals, listJobs } from "@agency/orchestrator/server";
import { PHASE_GROUP, PHASES, getServiceBaseDefinition, phaseLabel } from "@agency/production";
import { costsForProjects, listProjects, tasksForProjects } from "@agency/production/server";
import { quoteRecipient } from "@agency/quotes";
import { getCatalog, listQuotes } from "@agency/quotes/server";

/**
 * KOMPOSITION: Dashboard ← alle moduler
 * ------------------------------------
 * Læser modulernes egne data via deres offentlige server-API'er og mapper dem
 * til analytics-lagets normaliserede øjebliksbillede. Intet kopieres eller
 * gemmes; Dashboard har ingen egen lagring. Beregningerne sker i
 * `@agency/dashboard` (rene, deterministiske funktioner).
 */
export async function buildSnapshot(mode: Mode, now = new Date()): Promise<AnalyticsSnapshot> {
  const [catalog, accountSummaries, opportunities, activities, quotes, projectSummaries, jobs, agents, approvals, activity, aiUsage, ccUsage] = await Promise.all([
    getCatalog(),
    listAccounts(mode),
    listOpportunities(mode),
    listActivities({ mode, view: "all" }),
    listQuotes(mode),
    listProjects(mode),
    listJobs({ mode }),
    agentRegistry.list(),
    listApprovals({ mode }),
    getActivity(mode, 40),
    getDailyUsage("anthropic"),
    getDailyUsage("claude_code_runs"),
  ]);
  const projectIds = projectSummaries.map((p) => p.project.id);
  const [tasks, costs] = await Promise.all([tasksForProjects(projectIds), costsForProjects(projectIds)]);
  const pendingByProject = new Map(approvals.filter((a) => a.status === "pending" && a.subject.ref?.module === "production").map((a) => [a.subject.ref!.entityId, a.id]));

  return {
    mode,
    now: now.toISOString(),
    catalog: catalog.map((c) => ({ id: c.id, name: c.name, category: c.category, implementationPrice: c.implementationPrice })),
    stages: STAGES.map((s) => ({ key: s.key, label: s.label })),
    phases: PHASES.map((p) => ({ key: p.key, label: p.label })),
    accounts: accountSummaries.map(({ account: a }) => ({ id: a.id, brandId: a.brandId, name: a.name, status: a.status, source: a.source, owner: a.owner, isDemo: a.isDemo, createdAt: a.createdAt })),
    opportunities: opportunities.map((o) => ({
      id: o.id,
      accountId: o.accountId,
      title: o.title,
      services: o.services,
      implementationValue: o.implementationValue,
      monthlyValue: o.monthlyValue,
      probability: o.probability,
      stage: o.stage,
      status: o.status,
      expectedCloseDate: o.expectedCloseDate,
      createdAt: o.createdAt,
      closedAt: o.closedAt,
      quoteId: o.quoteId,
      projectId: o.projectId,
      owner: o.owner,
      isDemo: o.isDemo,
    })),
    activities: activities.map((a) => ({ id: a.id, accountId: a.accountId, opportunityId: a.opportunityId, kind: a.kind, subject: a.subject, status: a.status, dueAt: a.dueAt, completedAt: a.completedAt })),
    quotes: quotes.map(({ quote, currentVersion, totals }) => ({
      id: quote.id,
      number: quote.number,
      brandId: quote.brand?.brandId ?? null,
      customerName: quoteRecipient(quote).displayName,
      status: quote.status,
      implementation: totals.implementation.exclVat,
      monthly: totals.monthly.exclVat,
      services: currentVersion.lineItems.map((l) => l.catalogItemId).filter((id): id is string => Boolean(id)),
      createdAt: quote.createdAt,
      updatedAt: quote.updatedAt,
    })),
    projects: projectSummaries.map(({ project: p, overdue, openTasks }) => ({
      id: p.id,
      brandId: p.customer.brandId,
      customerName: p.customer.name,
      name: p.name,
      serviceBaseKey: p.serviceBaseKey,
      catalogItemId: getServiceBaseDefinition(p.serviceBaseKey)?.catalogItemId ?? null,
      status: p.status,
      phase: p.phase,
      phaseLabel: phaseLabel(p.phase),
      phaseGroup: PHASE_GROUP[p.phase],
      implementationPrice: p.pricing.implementationPrice,
      monthlyPrice: p.pricing.monthlyPrice,
      startDate: p.startDate,
      targetDate: p.targetDate,
      createdAt: p.createdAt,
      deliveredAt: p.phaseHistory.find((h) => h.phase === "delivered")?.enteredAt ?? null,
      quoteId: p.source.quoteId,
      isDemo: p.isDemo,
      agents: p.agents.map((a) => ({ agentId: a.agentId, role: a.role })),
      pendingApprovalId: p.pendingGate?.approvalId ?? pendingByProject.get(p.id) ?? null,
      overdue,
      openTasks,
    })),
    tasks: tasks.map((t) => ({ id: t.id, projectId: t.projectId, title: t.title, status: t.status, required: t.required, dueDate: t.dueDate, assigneeId: t.assignee?.kind === "agent" ? t.assignee.id : null })),
    costs: costs.map((c) => ({ projectId: c.projectId, at: c.at, amount: c.amount, category: c.category, simulated: c.simulated })),
    jobs: jobs.map((j) => ({
      id: j.id,
      title: j.title,
      module: j.module,
      taskType: j.taskType,
      status: j.status,
      engine: j.engine,
      agentId: j.agentId,
      brandId: j.subject.brandId ?? null,
      projectId: j.subject.projectId ?? null,
      customerName: j.subject.customerName ?? null,
      createdAt: j.createdAt,
      startedAt: j.startedAt,
      finishedAt: j.finishedAt,
      apiCostUsd: j.cost.apiCostUsd,
      subscriptionRuns: j.cost.subscriptionRuns,
      inputTokens: j.cost.inputTokens,
      outputTokens: j.cost.outputTokens,
      error: j.error?.message ?? null,
    })),
    agents: agents.map((a) => ({ id: a.id, name: a.name, role: a.role, color: a.color, enabled: a.enabled })),
    approvals: approvals.map((a) => ({ id: a.id, title: a.title, category: a.category, status: a.status, requestedAt: a.requestedAt, ref: a.subject.ref ? { module: a.subject.ref.module, entityId: a.subject.ref.entityId } : null, aiJobId: a.subject.aiJobId ?? null })),
    recentActivity: activity.map((e) => ({ at: e.at, jobId: e.jobId, jobTitle: e.jobTitle, agentId: e.agentId, message: e.message })),
    budget: {
      aiSpentTodayUsd: Math.round(aiUsage.estimatedCostUsd * 10_000) / 10_000,
      aiDailyBudgetUsd: usageLimits.aiDailyBudgetUsd(),
      claudeCodeRunsToday: ccUsage.calls,
      claudeCodeDailyLimit: usageLimits.claudeCodeDailyLimit(),
      apiConfigured: isAiConfigured(),
      claudeCodeConfigured: engineAvailability("research.deep_research").claude_code.available,
    },
  };
}

export async function getDashboardData(mode: Mode, filter: DashboardFilter): Promise<DashboardData> {
  return computeDashboard(await buildSnapshot(mode), filter);
}
