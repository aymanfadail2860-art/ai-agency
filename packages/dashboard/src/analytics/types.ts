/**
 * NORMALISERET ØJEBLIKSBILLEDE
 * ----------------------------
 * Dashboard ejer ingen forretningsdata. App'ens kompositionslag
 * (`apps/web/lib/dashboard.ts`) læser modulernes egne data og mapper dem til
 * denne form. Alle beregninger i `compute.ts` er rene funktioner over dette
 * billede — deterministiske og testbare uden database.
 */

export type Mode = "demo" | "live";
export type ServiceCategory = "customer_contact" | "sales_marketing" | "automation" | "data_software";
export type EngineKind = "internal" | "claude_api" | "claude_code";

export interface SnapshotCatalogItem {
  id: string;
  name: string;
  category: ServiceCategory;
  implementationPrice: number;
}

export interface SnapshotAccount {
  id: string;
  brandId: string;
  name: string;
  status: "new_lead" | "working" | "qualified" | "customer" | "former_customer" | "disqualified";
  source: string;
  owner: string;
  isDemo: boolean;
  createdAt: string;
}

export interface SnapshotOpportunity {
  id: string;
  accountId: string;
  title: string;
  services: string[];
  implementationValue: number;
  monthlyValue: number;
  probability: number;
  stage: string;
  status: "open" | "won" | "lost";
  expectedCloseDate: string | null;
  createdAt: string;
  closedAt: string | null;
  quoteId: string | null;
  projectId: string | null;
  owner: string;
  isDemo: boolean;
}

export interface SnapshotActivity {
  id: string;
  accountId: string;
  opportunityId: string | null;
  kind: string;
  subject: string;
  status: "planned" | "done" | "cancelled";
  dueAt: string;
  completedAt: string | null;
}

export interface SnapshotQuote {
  id: string;
  number: string;
  brandId: string | null;
  customerName: string;
  status: "draft" | "sent" | "accepted" | "rejected";
  /** Kroner ekskl. moms fra den aktuelle version. */
  implementation: number;
  monthly: number;
  services: string[];
  createdAt: string;
  updatedAt: string;
}

export interface SnapshotProject {
  id: string;
  brandId: string | null;
  customerName: string;
  name: string;
  serviceBaseKey: string;
  catalogItemId: string | null;
  status: "active" | "on_hold" | "delivered" | "maintenance" | "cancelled";
  phase: string;
  phaseLabel: string;
  phaseGroup: "planning" | "development" | "testing" | "approval" | "delivery" | "delivered";
  implementationPrice: number;
  monthlyPrice: number;
  startDate: string | null;
  targetDate: string | null;
  createdAt: string;
  /** Tidspunkt for overgangen til "Leveret" (fra fasehistorikken). */
  deliveredAt: string | null;
  quoteId: string | null;
  isDemo: boolean;
  agents: Array<{ agentId: string; role: string }>;
  pendingApprovalId: string | null;
  /** Produktionsmodulets egen regel (summarize) — genberegnes ikke her. */
  overdue: boolean;
  openTasks: number;
}

export interface SnapshotTask {
  id: string;
  projectId: string;
  title: string;
  status: "todo" | "in_progress" | "blocked" | "review" | "done";
  required: boolean;
  dueDate: string | null;
  assigneeId: string | null;
}

export interface SnapshotCost {
  projectId: string;
  at: string;
  amount: number;
  category: string;
  simulated: boolean;
}

export interface SnapshotJob {
  id: string;
  title: string;
  module: string;
  taskType: string;
  status: "queued" | "awaiting_approval" | "dispatched" | "running" | "succeeded" | "failed" | "cancelled" | "blocked";
  engine: EngineKind | null;
  agentId: string | null;
  brandId: string | null;
  projectId: string | null;
  customerName: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  apiCostUsd: number;
  subscriptionRuns: number;
  inputTokens: number;
  outputTokens: number;
  /** Seneste fejlbesked (kun for fejlede job). */
  error: string | null;
}

export interface SnapshotAgent {
  id: string;
  name: string;
  role: string;
  color: string;
  enabled: boolean;
}

export interface SnapshotApproval {
  id: string;
  title: string;
  category: string;
  status: "pending" | "approved" | "rejected";
  requestedAt: string;
  ref: { module: string; entityId: string } | null;
  aiJobId: string | null;
}

export interface SnapshotActivityEvent {
  at: string;
  jobId: string;
  jobTitle: string;
  agentId: string | null;
  message: string;
}

export interface SnapshotBudget {
  /** Dagens registrerede Claude API-forbrug (estimat fra usage-loggen) og loftet. */
  aiSpentTodayUsd: number;
  aiDailyBudgetUsd: number;
  claudeCodeRunsToday: number;
  claudeCodeDailyLimit: number;
  apiConfigured: boolean;
  claudeCodeConfigured: boolean;
}

export interface AnalyticsSnapshot {
  mode: Mode;
  /** Beregningstidspunkt (ISO). Alle "nu"-regler bruger dette — aldrig Date.now() inde i beregningerne. */
  now: string;
  catalog: SnapshotCatalogItem[];
  /** Rækkefølge og navne fra CRM (salgsstadier) og Produktion (faser) — Dashboard importerer ikke modulerne. */
  stages: Array<{ key: string; label: string }>;
  phases: Array<{ key: string; label: string }>;
  accounts: SnapshotAccount[];
  opportunities: SnapshotOpportunity[];
  activities: SnapshotActivity[];
  quotes: SnapshotQuote[];
  projects: SnapshotProject[];
  tasks: SnapshotTask[];
  costs: SnapshotCost[];
  jobs: SnapshotJob[];
  agents: SnapshotAgent[];
  approvals: SnapshotApproval[];
  recentActivity: SnapshotActivityEvent[];
  budget: SnapshotBudget;
}
