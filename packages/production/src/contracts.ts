import { z } from "zod";
import { IsoDate, ModeSchema } from "@agency/core";

/**
 * PRODUKTION & LEVERING — DATAMODEL (V3, etape 2)
 * ----------------------------------------------
 * Fra accepteret tilbud til leveret og vedligeholdt løsning. Modulet har INTET
 * eget agentsystem: agenter er AOS-agenter (`agt_*`), reelle agentopgaver er
 * Job Center-job (`aij_*`), og faseporte bruger AOS' Approval Manager.
 *
 * Simuleret arbejde i Demo Mode markeres med `simulated: true` og vises altid
 * som demo — det er aldrig en påstand om, at en AI-agent har udført arbejdet.
 */

export const PHASES = [
  { key: "created", label: "Oprettet", short: "Oprettet" },
  { key: "requirements", label: "Kravafdækning", short: "Krav" },
  { key: "architecture", label: "Arkitektur og planlægning", short: "Arkitektur" },
  { key: "development", label: "Udvikling", short: "Udvikling" },
  { key: "integrations", label: "Integrationer", short: "Integrationer" },
  { key: "qa", label: "Kvalitetssikring", short: "QA" },
  { key: "internal_approval", label: "Intern godkendelse", short: "Intern godk." },
  { key: "customer_approval", label: "Kundegodkendelse", short: "Kundegodk." },
  { key: "deployment", label: "Deployment", short: "Deployment" },
  { key: "delivered", label: "Leveret", short: "Leveret" },
  { key: "maintenance", label: "Vedligeholdelse", short: "Drift" },
] as const;

export const PhaseSchema = z.enum(["created", "requirements", "architecture", "development", "integrations", "qa", "internal_approval", "customer_approval", "deployment", "delivered", "maintenance"]);
export type Phase = z.infer<typeof PhaseSchema>;
export const PHASE_KEYS = PHASES.map((p) => p.key) as Phase[];
export const phaseLabel = (p: Phase) => PHASES.find((x) => x.key === p)!.label;
export const phaseIndex = (p: Phase) => PHASE_KEYS.indexOf(p);

/** Dashboard-grupper (afledt af fasen). */
export const PHASE_GROUP: Record<Phase, "planning" | "development" | "testing" | "approval" | "delivery" | "delivered"> = {
  created: "planning",
  requirements: "planning",
  architecture: "planning",
  development: "development",
  integrations: "development",
  qa: "testing",
  internal_approval: "approval",
  customer_approval: "approval",
  deployment: "delivery",
  delivered: "delivered",
  maintenance: "delivered",
};

export const PrioritySchema = z.enum(["low", "normal", "high", "critical"]);
export type Priority = z.infer<typeof PrioritySchema>;
export const PRIORITY_LABELS: Record<Priority, string> = { low: "Lav", normal: "Normal", high: "Høj", critical: "Kritisk" };

export const ProjectStatusSchema = z.enum(["active", "on_hold", "delivered", "maintenance", "cancelled"]);
export type ProjectStatus = z.infer<typeof ProjectStatusSchema>;
export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = { active: "Aktiv", on_hold: "På pause", delivered: "Leveret", maintenance: "I drift", cancelled: "Annulleret" };

export const AgentRoleSchema = z.enum(["project_lead", "developer", "integration", "qa", "research", "proposal", "crm", "analytics"]);
export type AgentRole = z.infer<typeof AgentRoleSchema>;
export const AGENT_ROLE_LABELS: Record<AgentRole, string> = {
  project_lead: "Projektleder",
  developer: "Udvikler",
  integration: "Integrationer",
  qa: "QA og test",
  research: "Research",
  proposal: "Tilbud",
  crm: "Kunde og CRM",
  analytics: "Analyse",
};

export const DeliverableSchema = z.object({
  id: z.string().startsWith("dlv_"),
  name: z.string().min(1).max(200),
  description: z.string().max(1000),
  status: z.enum(["planned", "in_progress", "in_review", "approved", "delivered"]),
  phase: PhaseSchema,
});
export type Deliverable = z.infer<typeof DeliverableSchema>;
export const DELIVERABLE_STATUS_LABELS: Record<Deliverable["status"], string> = { planned: "Planlagt", in_progress: "I gang", in_review: "Til review", approved: "Godkendt", delivered: "Leveret" };

export const ArchitectureSchema = z.object({
  summary: z.string().max(4000),
  stack: z.array(z.string().max(120)).max(30),
  integrations: z.array(z.object({ name: z.string().max(120), purpose: z.string().max(400), status: z.enum(["planned", "in_progress", "connected", "simulated"]) })).max(20),
  components: z.array(z.object({ name: z.string().max(120), description: z.string().max(600) })).max(30),
  dataFlows: z.array(z.string().max(400)).max(20),
  risks: z.array(z.string().max(400)).max(20),
});
export type Architecture = z.infer<typeof ArchitectureSchema>;

export const ProjectSourceSchema = z.object({
  kind: z.enum(["manual", "quote", "service_factory", "demo"]),
  quoteId: z.string().startsWith("qte_").nullable(),
  quoteNumber: z.string().nullable(),
  quoteVersionId: z.string().startsWith("qver_").nullable(),
  intakeId: z.string().nullable(),
});

export const ProductionProjectSchema = z.object({
  id: z.string().startsWith("prj_"),
  mode: ModeSchema,
  /** Tydeligt markeret demoprojekt med eksempeldata (fx Restaurant Nord). */
  isDemo: z.boolean(),
  /** Reference til den fælles kundeidentitet (brand / juridisk enhed) — ingen kopi af kundedata. */
  customer: z.object({
    brandId: z.string().startsWith("brd_").nullable(),
    legalEntityId: z.string().startsWith("cmp_").nullable(),
    name: z.string().min(1).max(200),
  }),
  name: z.string().min(1).max(200),
  serviceBaseKey: z.string().min(1).max(60),
  description: z.string().max(4000),
  deliverables: z.array(DeliverableSchema).max(40),
  pricing: z.object({ implementationPrice: z.number().min(0), monthlyPrice: z.number().min(0), currency: z.literal("DKK") }),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  priority: PrioritySchema,
  status: ProjectStatusSchema,
  phase: PhaseSchema,
  phaseHistory: z.array(z.object({ phase: PhaseSchema, enteredAt: IsoDate, completedAt: IsoDate.nullable() })).max(50),
  /** AOS-agenter som planlagte ressourcer. Rollen er projektspecifik. */
  agents: z.array(z.object({ agentId: z.string().startsWith("agt_"), role: AgentRoleSchema, assignedAt: IsoDate })).max(12),
  architecture: ArchitectureSchema,
  maintenance: z.object({ plan: z.string().max(2000), sla: z.string().max(400), recurringTasks: z.array(z.string().max(200)).max(20) }),
  /** Faseport, der afventer en beslutning i AOS' Approval Manager. */
  pendingGate: z.object({ approvalId: z.string().startsWith("apr_"), toPhase: PhaseSchema, requestedAt: IsoDate }).nullable(),
  customerApproval: z.object({ approvedBy: z.string().max(200), note: z.string().max(1000), at: IsoDate }).nullable(),
  notes: z.string().max(8000),
  source: ProjectSourceSchema,
  createdAt: IsoDate,
  updatedAt: IsoDate,
});
export type ProductionProject = z.infer<typeof ProductionProjectSchema>;

export const TaskStatusSchema = z.enum(["todo", "in_progress", "blocked", "review", "done"]);
export type TaskStatus = z.infer<typeof TaskStatusSchema>;
export const TASK_STATUS_LABELS: Record<TaskStatus, string> = { todo: "Ikke startet", in_progress: "I gang", blocked: "Blokeret", review: "Til review", done: "Udført" };

export const ProductionTaskSchema = z.object({
  id: z.string().startsWith("ptk_"),
  projectId: z.string().startsWith("prj_"),
  phase: PhaseSchema,
  title: z.string().min(1).max(200),
  description: z.string().max(2000),
  /** Agent (AOS) eller menneske. */
  assignee: z.object({ kind: z.enum(["agent", "human"]), id: z.string().max(80), name: z.string().max(80) }).nullable(),
  priority: PrioritySchema,
  status: TaskStatusSchema,
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  /** Påkrævet for at fasen kan afsluttes. */
  required: z.boolean(),
  /** Job Center-job, hvis opgaven er sendt til en AI-motor. */
  aiJobId: z.string().startsWith("aij_").nullable(),
  /** Udført af demo-simulering (ikke af en rigtig agent). */
  simulated: z.boolean(),
  completedAt: IsoDate.nullable(),
  createdAt: IsoDate,
  updatedAt: IsoDate,
});
export type ProductionTask = z.infer<typeof ProductionTaskSchema>;

export const TestCaseSchema = z.object({
  id: z.string().startsWith("ptc_"),
  projectId: z.string().startsWith("prj_"),
  title: z.string().min(1).max(200),
  area: z.string().max(80),
  kind: z.enum(["functional", "integration", "end_to_end", "acceptance", "performance", "security"]),
  expected: z.string().max(1000),
  status: z.enum(["not_run", "passed", "failed", "blocked"]),
  resultNote: z.string().max(1000),
  defect: z.object({ title: z.string().max(200), severity: z.enum(["low", "medium", "high", "critical"]), resolved: z.boolean() }).nullable(),
  lastRunAt: IsoDate.nullable(),
  simulated: z.boolean(),
  createdAt: IsoDate,
  updatedAt: IsoDate,
});
export type TestCase = z.infer<typeof TestCaseSchema>;
export const TEST_KIND_LABELS: Record<TestCase["kind"], string> = {
  functional: "Funktionel",
  integration: "Integration",
  end_to_end: "End-to-end",
  acceptance: "Accept",
  performance: "Performance",
  security: "Sikkerhed",
};

export const ProjectFileSchema = z.object({
  id: z.string().startsWith("pfl_"),
  projectId: z.string().startsWith("prj_"),
  kind: z.enum(["document", "code", "report", "deliverable", "link"]),
  title: z.string().min(1).max(200),
  description: z.string().max(1000),
  url: z.string().url().max(2000).nullable(),
  /** Fx repository-sti eller commit (kun reference — platformen har ingen GitHub-adgang endnu). */
  ref: z.string().max(300).nullable(),
  phase: PhaseSchema,
  createdBy: z.string().max(80),
  simulated: z.boolean(),
  createdAt: IsoDate,
});
export type ProjectFile = z.infer<typeof ProjectFileSchema>;

export const ProjectEventSchema = z.object({
  id: z.string().startsWith("pev_"),
  projectId: z.string().startsWith("prj_"),
  at: IsoDate,
  kind: z.enum(["created", "phase_changed", "task_updated", "task_created", "agent_assigned", "agent_removed", "test_recorded", "file_added", "approval_requested", "approval_decided", "customer_approved", "job_created", "cost_added", "note", "simulation"]),
  message: z.string().max(600),
  actor: z.object({ kind: z.enum(["user", "agent", "system"]), id: z.string().max(80).nullable(), name: z.string().max(80) }),
  /** Demo-simulering — vises altid som demo. */
  simulated: z.boolean(),
});
export type ProjectEvent = z.infer<typeof ProjectEventSchema>;

export const CostEntrySchema = z.object({
  id: z.string().startsWith("pco_"),
  projectId: z.string().startsWith("prj_"),
  at: IsoDate,
  category: z.enum(["hours", "external_tool", "infrastructure", "other"]),
  description: z.string().min(1).max(300),
  amount: z.number().min(0).max(10_000_000),
  simulated: z.boolean(),
});
export type CostEntry = z.infer<typeof CostEntrySchema>;
export const COST_CATEGORY_LABELS: Record<CostEntry["category"], string> = { hours: "Timer", external_tool: "Eksternt værktøj", infrastructure: "Infrastruktur", other: "Andet" };

// ─── Service Factory ────────────────────────────────────────────────────────

export const ServiceBaseSchema = z.object({
  id: z.string().regex(/^svb_[a-z0-9_]+$/),
  key: z.string().regex(/^[a-z0-9_]+$/),
  name: z.string().min(1).max(120),
  category: z.string().max(80),
  description: z.string().max(2000),
  features: z.array(z.string().max(200)).max(30),
  integrations: z.array(z.string().max(120)).max(30),
  customization: z.array(z.string().max(200)).max(30),
  stack: z.array(z.string().max(120)).max(30),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  status: z.enum(["concept", "in_development", "ready", "deprecated"]),
  repositories: z.array(z.object({ label: z.string().max(120), ref: z.string().max(300), status: z.enum(["planned", "exists"]) })).max(10),
  /** Katalogservice med pris (standardpris for nye projekter). */
  catalogItemId: z.string().nullable(),
  defaultAgents: z.array(z.object({ key: z.string(), role: AgentRoleSchema })).max(8),
  source: z.literal("repository"),
  updatedAt: IsoDate,
});
export type ServiceBase = z.infer<typeof ServiceBaseSchema>;
export const SERVICE_BASE_STATUS_LABELS: Record<ServiceBase["status"], string> = { concept: "Koncept", in_development: "Under udvikling", ready: "Klar", deprecated: "Udfaset" };
