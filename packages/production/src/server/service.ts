import { z } from "zod";
import { AnyProductionIntakeSchema, type AnyProductionIntake, type Mode } from "@agency/core";
import { brandRegistry, publishEvent } from "@agency/core/server";
import { agentRegistry, createApproval, getJob as getAiJob, listJobs, submitJob, type Defer } from "@agency/orchestrator/server";
import type { Approval, PublicAiJob } from "@agency/orchestrator";
import { AppError, newId, nowIso } from "@agency/shared";
import {
  AgentRoleSchema,
  ArchitectureSchema,
  CostEntrySchema,
  PHASE_GROUP,
  PHASE_KEYS,
  PhaseSchema,
  PrioritySchema,
  ProjectStatusSchema,
  TaskStatusSchema,
  TestCaseSchema,
  phaseIndex,
  phaseLabel,
  type CostEntry,
  type Deliverable,
  type Phase,
  type ProductionProject,
  type ProductionTask,
  type ProjectEvent,
  type ProjectFile,
  type ServiceBase,
  type TestCase,
} from "../contracts";
import {
  SERVICE_BASES,
  architectureTemplateFor,
  getServiceBaseDefinition,
  maintenanceTemplateFor,
  taskTemplateFor,
  testTemplateFor,
  type ServiceBaseDefinition,
} from "../service-factory";
import { costStore, eventStore, fileStore, projectStore, serviceBaseStore, taskStore, testStore } from "./store";

/**
 * PRODUKTION & LEVERING — service-API (server)
 * Agenter, agentjob og godkendelser kommer fra AOS (orchestratoren). Modulet
 * ejer kun projekter, opgaver, tests, filer, hændelser og omkostningsposter.
 */

export type Actor = ProjectEvent["actor"];
export const USER: Actor = { kind: "user", id: null, name: "Bruger" };
const SYSTEM: Actor = { kind: "system", id: null, name: "AI Agency" };

const today = () => new Date().toISOString().slice(0, 10);
export const addDays = (date: string, days: number) => {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
const DateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Dato skal være ÅÅÅÅ-MM-DD.");

// ─── Service Factory ────────────────────────────────────────────────────────

const CUSTOM_KEY = "custom";

/** Skræddersyet løsning uden grundbase (fx fra et tilbud uden matchende servicebase). */
function customBase(name: string, features: string[]): ServiceBaseDefinition {
  return {
    key: CUSTOM_KEY,
    name,
    category: "Skræddersyet",
    description: "Skræddersyet løsning uden standardiseret grundbase.",
    features: features.slice(0, 8),
    integrations: [],
    customization: [],
    stack: ["Afklares under arkitektur"],
    version: "0.0.0",
    status: "concept",
    repositories: [],
    catalogItemId: null,
    defaultAgents: [
      { key: "atlas", role: "project_lead" },
      { key: "forge", role: "developer" },
      { key: "vega", role: "qa" },
    ],
  };
}

function toServiceBase(def: ServiceBaseDefinition): ServiceBase {
  return { ...def, id: `svb_${def.key}`, source: "repository", updatedAt: nowIso() };
}

let basesSeeded: Promise<void> | null = null;
/** Idempotent indlæsning af katalogets grundversioner fra repositoriet (deterministiske id'er). */
export function ensureServiceFactorySeeded(): Promise<void> {
  basesSeeded ??= (async () => {
    for (const def of SERVICE_BASES) {
      const existing = await serviceBaseStore.get(`svb_${def.key}`);
      if (!existing || existing.version !== def.version) await serviceBaseStore.upsert(toServiceBase(def));
    }
  })().catch((err) => {
    basesSeeded = null;
    throw err;
  });
  return basesSeeded;
}

export async function listServiceBases(): Promise<ServiceBase[]> {
  await ensureServiceFactorySeeded();
  const order = SERVICE_BASES.map((b) => b.key);
  return (await serviceBaseStore.list()).sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
}

export async function getServiceBase(key: string): Promise<ServiceBase> {
  await ensureServiceFactorySeeded();
  const base = await serviceBaseStore.get(`svb_${key}`);
  if (!base) throw new AppError("not_found", "Servicebasen blev ikke fundet.");
  return base;
}

// ─── Hændelser ──────────────────────────────────────────────────────────────

export async function logEvent(projectId: string, kind: ProjectEvent["kind"], message: string, actor: Actor = USER, simulated = false): Promise<ProjectEvent> {
  return eventStore.upsert({ id: newId("projectEvent"), projectId, at: nowIso(), kind, message: message.slice(0, 600), actor, simulated });
}

// ─── Projekter ──────────────────────────────────────────────────────────────

export const CreateProjectSchema = z.object({
  customer: z.object({
    brandId: z.string().startsWith("brd_").nullable().default(null),
    legalEntityId: z.string().startsWith("cmp_").nullable().default(null),
    name: z.string().trim().min(1, "Angiv kundenavn.").max(200),
  }),
  name: z.string().trim().min(1, "Angiv projektnavn.").max(200),
  serviceBaseKey: z.string().min(1).max(60),
  description: z.string().trim().max(4000).default(""),
  deliverables: z.array(z.object({ name: z.string().trim().min(1).max(200), description: z.string().trim().max(1000).default("") })).max(40).default([]),
  implementationPrice: z.number().min(0).max(10_000_000),
  monthlyPrice: z.number().min(0).max(1_000_000),
  startDate: DateString.nullable().default(null),
  targetDate: DateString.nullable().default(null),
  priority: PrioritySchema.default("normal"),
  agents: z.array(z.object({ agentId: z.string().startsWith("agt_"), role: AgentRoleSchema })).max(12).optional(),
  notes: z.string().max(8000).default(""),
});
export type CreateProjectInput = z.input<typeof CreateProjectSchema>;

interface CreateOptions {
  mode: Mode;
  isDemo?: boolean;
  source?: ProductionProject["source"];
  actor?: Actor;
  /** Base for skræddersyede projekter (fx fra tilbud). */
  customDef?: ServiceBaseDefinition;
}

async function resolveAgents(requested: Array<{ agentId: string; role: ProductionProject["agents"][number]["role"] }> | undefined, def: ServiceBaseDefinition) {
  const wanted = requested ?? def.defaultAgents.map((a) => ({ agentId: `agt_${a.key}`, role: a.role }));
  const seen = new Set<string>();
  const out: ProductionProject["agents"] = [];
  for (const a of wanted) {
    if (seen.has(a.agentId)) continue;
    const agent = await agentRegistry.get(a.agentId);
    if (!agent) throw new AppError("validation_error", `Agenten ${a.agentId} findes ikke i AOS' Agent Manager.`);
    seen.add(a.agentId);
    out.push({ agentId: a.agentId, role: a.role, assignedAt: nowIso() });
  }
  return out;
}

export async function createProject(raw: CreateProjectInput, options: CreateOptions): Promise<ProductionProject> {
  const input = CreateProjectSchema.parse(raw);
  const def = input.serviceBaseKey === CUSTOM_KEY ? (options.customDef ?? customBase(input.name, input.deliverables.map((d) => d.name))) : getServiceBaseDefinition(input.serviceBaseKey);
  if (!def) throw new AppError("validation_error", "Ukendt servicebase.");

  let customerName = input.customer.name;
  if (input.customer.brandId) {
    const brand = await brandRegistry.get(input.customer.brandId);
    if (!brand) throw new AppError("validation_error", "Kunden (brand) findes ikke.");
    if (brand.mode !== options.mode) throw new AppError("mode_mismatch", "Kunden tilhører en anden tilstand (Demo/Live).");
    customerName = brand.name;
  }

  const agents = await resolveAgents(input.agents, def);
  const startDate = input.startDate ?? today();
  const targetDate = input.targetDate ?? addDays(startDate, 35);
  if (targetDate < startDate) throw new AppError("validation_error", "Leveringsdatoen ligger før startdatoen.");
  const now = nowIso();
  const deliverables: Deliverable[] = (input.deliverables.length ? input.deliverables : def.features.map((f) => ({ name: f, description: "" }))).map((d) => ({
    id: newId("deliverable"),
    name: d.name,
    description: d.description,
    status: "planned",
    phase: "development",
  }));

  const project = await projectStore.upsert({
    id: newId("productionProject"),
    mode: options.mode,
    isDemo: options.isDemo ?? false,
    customer: { brandId: input.customer.brandId, legalEntityId: input.customer.legalEntityId, name: customerName },
    name: input.name,
    serviceBaseKey: def.key,
    description: input.description || def.description,
    deliverables,
    pricing: { implementationPrice: input.implementationPrice, monthlyPrice: input.monthlyPrice, currency: "DKK" },
    startDate,
    targetDate,
    priority: input.priority,
    status: "active",
    phase: "created",
    phaseHistory: [{ phase: "created", enteredAt: now, completedAt: null }],
    agents,
    architecture: architectureTemplateFor(def),
    maintenance: maintenanceTemplateFor(def),
    pendingGate: null,
    customerApproval: null,
    notes: input.notes,
    source: options.source ?? { kind: "manual", quoteId: null, quoteNumber: null, quoteVersionId: null, intakeId: null },
    createdAt: now,
    updatedAt: now,
  });

  // Opgaver og testcases fra servicebasens skabelon. Agenter tildeles kun, hvis de er tilknyttet projektet.
  const assigned = new Map(agents.map((a) => [a.agentId, a]));
  const agentNames = new Map((await agentRegistry.list()).map((a) => [a.id, a.name]));
  for (const t of taskTemplateFor(def)) {
    const agentId = t.agent ? `agt_${t.agent}` : null;
    await taskStore.upsert({
      id: newId("productionTask"),
      projectId: project.id,
      phase: t.phase,
      title: t.title,
      description: t.description,
      assignee: agentId && assigned.has(agentId) ? { kind: "agent", id: agentId, name: agentNames.get(agentId) ?? agentId } : null,
      priority: t.priority,
      status: "todo",
      dueDate: addDays(startDate, t.dueOffsetDays),
      required: t.required,
      aiJobId: null,
      simulated: false,
      completedAt: null,
      createdAt: now,
      updatedAt: now,
    });
  }
  for (const t of testTemplateFor(def)) {
    await testStore.upsert({ id: newId("testCase"), projectId: project.id, ...t, status: "not_run", resultNote: "", defect: null, lastRunAt: null, simulated: false, createdAt: now, updatedAt: now });
  }
  const sourceText = project.source.kind === "quote" ? ` fra accepteret tilbud ${project.source.quoteNumber}` : project.source.kind === "demo" ? " (demoprojekt med eksempeldata)" : "";
  await logEvent(project.id, "created", `Projekt oprettet${sourceText} på grundbasen ${def.name}${def.key === CUSTOM_KEY ? "" : ` v${def.version}`}.`, options.actor ?? USER);
  if (agents.length) await logEvent(project.id, "agent_assigned", `Tilknyttede agenter (planlagte ressourcer): ${agents.map((a) => agentNames.get(a.agentId) ?? a.agentId).join(", ")}.`, SYSTEM);
  await publishEvent({ type: "production.project.created", source: "production", mode: project.mode, subject: { projectId: project.id, quoteId: project.source.quoteId ?? undefined }, payload: { serviceBaseKey: def.key, isDemo: project.isDemo } });
  return project;
}

/** Intake fra accepteret tilbud (`quotes.production-intake@1/@2`). Idempotent pr. intakeId. */
export async function createFromIntake(raw: unknown): Promise<{ project: ProductionProject; created: boolean }> {
  const intake: AnyProductionIntake = AnyProductionIntakeSchema.parse(raw);
  const existing = await projectStore.find((p) => p.source.intakeId === intake.intakeId);
  if (existing) return { project: existing, created: false };
  const customer =
    intake.version === 2
      ? { brandId: intake.customer.brandId, legalEntityId: intake.customer.legalEntity?.companyId ?? null, name: intake.customer.name }
      : { brandId: null, legalEntityId: intake.company.companyId, name: intake.company.name };
  const matched = intake.lineItems.map((li) => SERVICE_BASES.find((b) => b.catalogItemId && b.catalogItemId === li.catalogItemId)).find(Boolean);
  const names = intake.lineItems.map((li) => li.name);
  const name = names.length > 1 ? `${names[0]} + ${names.length - 1} mere` : names[0]!;
  const deliverables = intake.lineItems.flatMap((li) => (li.deliverables.length ? li.deliverables : [li.name]).map((d) => ({ name: d, description: li.name })));
  const project = await createProject(
    {
      customer,
      name,
      serviceBaseKey: matched?.key ?? CUSTOM_KEY,
      description: intake.lineItems.map((li) => `${li.name}: ${li.description}`).join("\n").slice(0, 4000),
      deliverables: deliverables.slice(0, 40),
      implementationPrice: intake.totals.implementationExclVat,
      monthlyPrice: intake.totals.monthlyExclVat,
      startDate: intake.requestedStartDate,
      notes: intake.specialTerms ? `Særlige vilkår fra tilbuddet: ${intake.specialTerms}` : "",
    },
    {
      mode: intake.mode,
      source: { kind: "quote", quoteId: intake.quote.quoteId, quoteNumber: intake.quote.quoteNumber, quoteVersionId: intake.quote.versionId, intakeId: intake.intakeId },
      actor: SYSTEM,
      customDef: matched ? undefined : customBase(name, names),
    },
  );
  return { project, created: true };
}

async function requireProject(id: string): Promise<ProductionProject> {
  const p = await projectStore.get(id);
  if (!p) throw new AppError("not_found", "Projektet blev ikke fundet.");
  return p;
}

async function save(id: string, fn: (p: ProductionProject) => ProductionProject): Promise<ProductionProject> {
  const updated = await projectStore.update(id, (p) => ({ ...fn(p), updatedAt: nowIso() }));
  if (!updated) throw new AppError("not_found", "Projektet blev ikke fundet.");
  return updated;
}

export interface ProjectBundle {
  project: ProductionProject;
  tasks: ProductionTask[];
  tests: TestCase[];
  files: ProjectFile[];
  events: ProjectEvent[];
  costs: CostEntry[];
}

export async function getProject(id: string): Promise<ProjectBundle> {
  const project = await requireProject(id);
  const [tasks, tests, files, events, costs] = await Promise.all([taskStore.list(), testStore.list(), fileStore.list(), eventStore.list(), costStore.list()]);
  return {
    project,
    tasks: tasks.filter((t) => t.projectId === id).sort((a, b) => phaseIndex(a.phase) - phaseIndex(b.phase) || (a.dueDate ?? "").localeCompare(b.dueDate ?? "")),
    tests: tests.filter((t) => t.projectId === id).sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    files: files.filter((f) => f.projectId === id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    events: events.filter((e) => e.projectId === id).sort((a, b) => b.at.localeCompare(a.at)),
    costs: costs.filter((c) => c.projectId === id).sort((a, b) => b.at.localeCompare(a.at)),
  };
}

export interface ProjectSummary {
  project: ProductionProject;
  progress: { done: number; total: number; percent: number };
  overdue: boolean;
  nextDeadline: { title: string; date: string } | null;
  openTasks: number;
}

function isOpen(p: ProductionProject) {
  return p.status === "active" || p.status === "on_hold";
}

export function summarize(project: ProductionProject, tasks: ProductionTask[], date = today()): ProjectSummary {
  const own = tasks.filter((t) => t.projectId === project.id);
  const required = own.filter((t) => t.required);
  const done = required.filter((t) => t.status === "done").length;
  const open = own.filter((t) => t.status !== "done");
  const next = open.filter((t) => t.dueDate).sort((a, b) => a.dueDate!.localeCompare(b.dueDate!))[0];
  const late = isOpen(project) && PHASE_GROUP[project.phase] !== "delivered" && ((project.targetDate !== null && project.targetDate < date) || open.some((t) => t.required && t.dueDate !== null && t.dueDate < addDays(date, -7)));
  return {
    project,
    progress: { done, total: required.length, percent: required.length ? Math.round((done / required.length) * 100) : 0 },
    overdue: late,
    nextDeadline: next ? { title: next.title, date: next.dueDate! } : null,
    openTasks: open.length,
  };
}

export async function listProjects(mode: Mode): Promise<ProjectSummary[]> {
  const [projects, tasks] = await Promise.all([projectStore.list(), taskStore.list()]);
  const date = today();
  return projects
    .filter((p) => p.mode === mode)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .map((p) => summarize(p, tasks, date));
}

export interface ProductionDashboard {
  mode: Mode;
  counts: { active: number; planning: number; development: number; testing: number; approval: number; delivered: number; overdue: number; total: number };
  deadlines: Array<{ projectId: string; projectName: string; title: string; date: string; kind: "task" | "project"; overdue: boolean }>;
  agents: Array<{ agentId: string; name: string; color: string; projects: number; openTasks: number }>;
  activity: Array<ProjectEvent & { projectName: string }>;
  projects: ProjectSummary[];
}

export async function getDashboard(mode: Mode): Promise<ProductionDashboard> {
  const [summaries, tasks, events, agentList] = await Promise.all([listProjects(mode), taskStore.list(), eventStore.list(), agentRegistry.list()]);
  const date = today();
  const ids = new Set(summaries.map((s) => s.project.id));
  const open = summaries.filter((s) => isOpen(s.project));
  const group = (g: string) => open.filter((s) => PHASE_GROUP[s.project.phase] === g).length;
  const names = new Map(summaries.map((s) => [s.project.id, s.project.name]));
  const horizon = addDays(date, 21);
  const deadlines: ProductionDashboard["deadlines"] = [
    ...tasks
      .filter((t) => ids.has(t.projectId) && t.status !== "done" && t.required && t.dueDate && t.dueDate <= horizon && isOpen(summaries.find((s) => s.project.id === t.projectId)!.project))
      .map((t) => ({ projectId: t.projectId, projectName: names.get(t.projectId)!, title: t.title, date: t.dueDate!, kind: "task" as const, overdue: t.dueDate! < date })),
    ...open.filter((s) => s.project.targetDate && s.project.targetDate <= addDays(date, 30)).map((s) => ({ projectId: s.project.id, projectName: s.project.name, title: "Forventet levering", date: s.project.targetDate!, kind: "project" as const, overdue: s.project.targetDate! < date })),
  ]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 12);
  const agents = agentList
    .map((a) => {
      const projects = open.filter((s) => s.project.agents.some((x) => x.agentId === a.id));
      const openTasks = tasks.filter((t) => t.assignee?.id === a.id && t.status !== "done" && projects.some((p) => p.project.id === t.projectId)).length;
      return { agentId: a.id, name: a.name, color: a.color, projects: projects.length, openTasks };
    })
    .filter((a) => a.projects > 0)
    .sort((a, b) => b.openTasks - a.openTasks);
  return {
    mode,
    counts: {
      active: open.length,
      planning: group("planning"),
      development: group("development"),
      testing: group("testing"),
      approval: group("approval") + open.filter((s) => s.project.pendingGate && PHASE_GROUP[s.project.phase] !== "approval").length,
      delivered: summaries.filter((s) => PHASE_GROUP[s.project.phase] === "delivered").length,
      overdue: summaries.filter((s) => s.overdue).length,
      total: summaries.length,
    },
    deadlines,
    agents,
    activity: events
      .filter((e) => ids.has(e.projectId))
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, 15)
      .map((e) => ({ ...e, projectName: names.get(e.projectId)! })),
    projects: summaries,
  };
}

export const UpdateProjectSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(4000).optional(),
  priority: PrioritySchema.optional(),
  status: ProjectStatusSchema.optional(),
  startDate: DateString.nullable().optional(),
  targetDate: DateString.nullable().optional(),
  notes: z.string().max(8000).optional(),
  pricing: z.object({ implementationPrice: z.number().min(0).max(10_000_000), monthlyPrice: z.number().min(0).max(1_000_000) }).optional(),
  architecture: ArchitectureSchema.optional(),
  deliverables: z.array(z.object({ id: z.string().startsWith("dlv_"), status: z.enum(["planned", "in_progress", "in_review", "approved", "delivered"]) })).max(40).optional(),
});

export async function updateProject(id: string, raw: unknown): Promise<ProductionProject> {
  const patch = UpdateProjectSchema.parse(raw);
  const updated = await save(id, (p) => ({
    ...p,
    name: patch.name ?? p.name,
    description: patch.description ?? p.description,
    priority: patch.priority ?? p.priority,
    status: patch.status ?? p.status,
    startDate: patch.startDate === undefined ? p.startDate : patch.startDate,
    targetDate: patch.targetDate === undefined ? p.targetDate : patch.targetDate,
    notes: patch.notes ?? p.notes,
    pricing: patch.pricing ? { ...patch.pricing, currency: "DKK" } : p.pricing,
    architecture: patch.architecture ?? p.architecture,
    deliverables: patch.deliverables ? p.deliverables.map((d) => ({ ...d, status: patch.deliverables!.find((x) => x.id === d.id)?.status ?? d.status })) : p.deliverables,
  }));
  const changed = Object.keys(patch).filter((k) => patch[k as keyof typeof patch] !== undefined);
  if (changed.length) await logEvent(id, "note", `Projekt opdateret: ${changed.join(", ")}.`);
  return updated;
}

// ─── Faser og faseporte ─────────────────────────────────────────────────────

/** Overgange, der kræver en beslutning i AOS' Approval Manager. */
export const PHASE_GATES: Partial<Record<Phase, { category: Approval["category"]; title: string; reason: string }>> = {
  customer_approval: { category: "production", title: "Intern godkendelse af leverancen", reason: "Leverancen skal godkendes internt, før den vises for kunden." },
  deployment: { category: "deployment", title: "Godkend deployment", reason: "Deployment til kundens miljø kræver altid godkendelse." },
};

export interface AdvanceResult {
  project: ProductionProject;
  approvalId: string | null;
}

export function blockersFor(project: ProductionProject, tasks: ProductionTask[]): string[] {
  const blockers: string[] = [];
  if (project.pendingGate) blockers.push("Afventer godkendelse i AOS.");
  if (project.phase === "maintenance") blockers.push("Projektet er i vedligeholdelse (sidste fase).");
  if (project.status === "cancelled") blockers.push("Projektet er annulleret.");
  const open = tasks.filter((t) => t.projectId === project.id && t.phase === project.phase && t.required && t.status !== "done");
  if (open.length) blockers.push(`${open.length} påkrævet${open.length === 1 ? "" : "e"} opgave${open.length === 1 ? "" : "r"} i fasen er ikke udført: ${open.slice(0, 3).map((t) => t.title).join(", ")}${open.length > 3 ? " …" : ""}.`);
  if (project.phase === "customer_approval" && !project.customerApproval) blockers.push("Kundens godkendelse er ikke registreret.");
  return blockers;
}

async function movePhase(project: ProductionProject, to: Phase, actor: Actor, simulated = false): Promise<ProductionProject> {
  const now = nowIso();
  const updated = await save(project.id, (p) => ({
    ...p,
    phase: to,
    pendingGate: null,
    status: to === "delivered" ? "delivered" : to === "maintenance" ? "maintenance" : p.status === "delivered" || p.status === "maintenance" ? "active" : p.status,
    phaseHistory: [...p.phaseHistory.map((h) => (h.completedAt === null ? { ...h, completedAt: now } : h)), { phase: to, enteredAt: now, completedAt: null }],
    deliverables: to === "delivered" ? p.deliverables.map((d) => ({ ...d, status: "delivered" as const })) : p.deliverables,
  }));
  await logEvent(project.id, "phase_changed", `Fase: ${phaseLabel(project.phase)} → ${phaseLabel(to)}.`, actor, simulated);
  await publishEvent({ type: "production.phase.changed", source: "production", mode: project.mode, subject: { projectId: project.id }, payload: { from: project.phase, to } });
  return updated;
}

/** Næste fase. Kritiske overgange oprettes som godkendelse i AOS og udføres først ved godkendelse. */
export async function advancePhase(id: string, actor: Actor = USER, options: { simulated?: boolean } = {}): Promise<AdvanceResult> {
  const project = await requireProject(id);
  const tasks = await taskStore.list();
  const blockers = blockersFor(project, tasks);
  if (blockers.length) throw new AppError("conflict", blockers.join(" "));
  const next = PHASE_KEYS[phaseIndex(project.phase) + 1]!;
  const gate = PHASE_GATES[next];
  if (gate) {
    const approval = await createApproval({
      category: gate.category,
      title: `${gate.title}: ${project.name}`,
      description: `${project.customer.name} · ${phaseLabel(project.phase)} → ${phaseLabel(next)}.${project.isDemo ? " Demoprojekt — ingen rigtig deployment eller ekstern handling udføres." : ""}`,
      reasons: [gate.reason],
      mode: project.mode,
      subject: { ref: { module: "production", entityId: project.id, action: "phase_gate", detail: next } },
      estimatedCostUsd: null,
    });
    const updated = await save(id, (p) => ({ ...p, pendingGate: { approvalId: approval.id, toPhase: next, requestedAt: nowIso() } }));
    await logEvent(id, "approval_requested", `Godkendelse anmodet i AOS: ${gate.title} (${phaseLabel(next)}).`, actor, options.simulated ?? false);
    return { project: updated, approvalId: approval.id };
  }
  return { project: await movePhase(project, next, actor, options.simulated ?? false), approvalId: null };
}

/** Kaldes af AOS' Approval Manager, når en faseport afgøres. */
export async function onGateDecision(projectId: string, approvalId: string, approved: boolean, note: string | null): Promise<void> {
  const project = await projectStore.get(projectId);
  if (!project?.pendingGate || project.pendingGate.approvalId !== approvalId) return;
  const actor: Actor = { kind: "user", id: null, name: "Godkendt i AOS" };
  if (approved) {
    await logEvent(projectId, "approval_decided", `Godkendt i AOS${note ? `: ${note}` : ""}.`, actor);
    await movePhase(project, project.pendingGate.toPhase, actor);
  } else {
    await save(projectId, (p) => ({ ...p, pendingGate: null }));
    await logEvent(projectId, "approval_decided", `Afvist i AOS${note ? `: ${note}` : ""}. Projektet bliver i ${phaseLabel(project.phase)}.`, { kind: "user", id: null, name: "Afvist i AOS" });
  }
}

export const CustomerApprovalSchema = z.object({ approvedBy: z.string().trim().min(2, "Angiv hvem hos kunden der har godkendt.").max(200), note: z.string().trim().max(1000).default("") });

export async function recordCustomerApproval(id: string, raw: unknown, actor: Actor = USER, simulated = false): Promise<ProductionProject> {
  const input = CustomerApprovalSchema.parse(raw);
  const project = await requireProject(id);
  if (project.phase !== "customer_approval") throw new AppError("conflict", "Kundens godkendelse registreres i fasen Kundegodkendelse.");
  const updated = await save(id, (p) => ({ ...p, customerApproval: { approvedBy: input.approvedBy, note: input.note, at: nowIso() } }));
  await logEvent(id, "customer_approved", `Kundens godkendelse registreret: ${input.approvedBy}${input.note ? ` — ${input.note}` : ""}.`, actor, simulated);
  return updated;
}

// ─── Agenter (AOS) ──────────────────────────────────────────────────────────

export const SetAgentsSchema = z.object({ agents: z.array(z.object({ agentId: z.string().startsWith("agt_"), role: AgentRoleSchema })).max(12) });

export async function setAgents(id: string, raw: unknown): Promise<ProductionProject> {
  const { agents } = SetAgentsSchema.parse(raw);
  const project = await requireProject(id);
  const resolved = await resolveAgents(agents, customBase(project.name, []));
  const keep = new Map(project.agents.map((a) => [a.agentId, a.assignedAt]));
  const names = new Map((await agentRegistry.list()).map((a) => [a.id, a.name]));
  const updated = await save(id, (p) => ({ ...p, agents: resolved.map((a) => ({ ...a, assignedAt: keep.get(a.agentId) ?? a.assignedAt })) }));
  const added = resolved.filter((a) => !keep.has(a.agentId));
  const removed = project.agents.filter((a) => !resolved.some((r) => r.agentId === a.agentId));
  if (added.length) await logEvent(id, "agent_assigned", `Agent tilknyttet: ${added.map((a) => names.get(a.agentId)).join(", ")}.`);
  if (removed.length) await logEvent(id, "agent_removed", `Agent fjernet: ${removed.map((a) => names.get(a.agentId)).join(", ")}.`);
  return updated;
}

export async function assignmentsForAgent(agentId: string, mode: Mode): Promise<Array<{ projectId: string; name: string; customer: string; role: string; phase: Phase; isDemo: boolean; openTasks: number }>> {
  const [projects, tasks] = await Promise.all([projectStore.list(), taskStore.list()]);
  return projects
    .filter((p) => p.mode === mode && p.agents.some((a) => a.agentId === agentId))
    .map((p) => ({
      projectId: p.id,
      name: p.name,
      customer: p.customer.name,
      role: p.agents.find((a) => a.agentId === agentId)!.role,
      phase: p.phase,
      isDemo: p.isDemo,
      openTasks: tasks.filter((t) => t.projectId === p.id && t.assignee?.id === agentId && t.status !== "done").length,
    }));
}

// ─── Opgaver ────────────────────────────────────────────────────────────────

export const CreateTaskSchema = z.object({
  phase: PhaseSchema,
  title: z.string().trim().min(1, "Angiv en titel.").max(200),
  description: z.string().trim().max(2000).default(""),
  assigneeAgentId: z.string().startsWith("agt_").nullable().default(null),
  priority: PrioritySchema.default("normal"),
  dueDate: DateString.nullable().default(null),
  required: z.boolean().default(true),
});

async function assigneeFor(project: ProductionProject, agentId: string | null) {
  if (!agentId) return null;
  if (!project.agents.some((a) => a.agentId === agentId)) throw new AppError("validation_error", "Agenten er ikke tilknyttet projektet.");
  const agent = await agentRegistry.get(agentId);
  return agent ? { kind: "agent" as const, id: agent.id, name: agent.name } : null;
}

export async function createTask(projectId: string, raw: unknown): Promise<ProductionTask> {
  const input = CreateTaskSchema.parse(raw);
  const project = await requireProject(projectId);
  const now = nowIso();
  const task = await taskStore.upsert({
    id: newId("productionTask"),
    projectId,
    phase: input.phase,
    title: input.title,
    description: input.description,
    assignee: await assigneeFor(project, input.assigneeAgentId),
    priority: input.priority,
    status: "todo",
    dueDate: input.dueDate,
    required: input.required,
    aiJobId: null,
    simulated: false,
    completedAt: null,
    createdAt: now,
    updatedAt: now,
  });
  await logEvent(projectId, "task_created", `Opgave oprettet (${phaseLabel(input.phase)}): ${input.title}.`);
  return task;
}

export const UpdateTaskSchema = z.object({
  status: TaskStatusSchema.optional(),
  assigneeAgentId: z.string().startsWith("agt_").nullable().optional(),
  priority: PrioritySchema.optional(),
  dueDate: DateString.nullable().optional(),
});

export async function updateTask(projectId: string, taskId: string, raw: unknown): Promise<ProductionTask> {
  const patch = UpdateTaskSchema.parse(raw);
  const project = await requireProject(projectId);
  const assignee = patch.assigneeAgentId === undefined ? undefined : await assigneeFor(project, patch.assigneeAgentId);
  const updated = await taskStore.update(taskId, (t) => {
    if (t.projectId !== projectId) throw new AppError("not_found", "Opgaven blev ikke fundet.");
    const status = patch.status ?? t.status;
    return {
      ...t,
      status,
      assignee: assignee === undefined ? t.assignee : assignee,
      priority: patch.priority ?? t.priority,
      dueDate: patch.dueDate === undefined ? t.dueDate : patch.dueDate,
      completedAt: status === "done" ? (t.status === "done" ? t.completedAt : nowIso()) : null,
      simulated: status === "done" && t.status !== "done" ? false : t.simulated,
      updatedAt: nowIso(),
    };
  });
  if (!updated) throw new AppError("not_found", "Opgaven blev ikke fundet.");
  const parts = [patch.status && `status: ${patch.status}`, patch.assigneeAgentId !== undefined && `ansvarlig: ${updated.assignee?.name ?? "ingen"}`, patch.priority && `prioritet: ${patch.priority}`, patch.dueDate !== undefined && `deadline: ${patch.dueDate ?? "ingen"}`].filter(Boolean);
  await logEvent(projectId, "task_updated", `${updated.title} — ${parts.join(", ")}.`);
  return updated;
}

/**
 * Sender en opgave til AOS' fælles Job Center. Opgaven routes som enhver anden
 * agentopgave; i denne etape blokerer routeren den med en begrundelse
 * (opgavetypen er planlagt, og Demo Mode bruger aldrig AI-motorer).
 */
export async function sendTaskToJobCenter(projectId: string, taskId: string, defer?: Defer): Promise<{ task: ProductionTask; job: PublicAiJob }> {
  const project = await requireProject(projectId);
  const task = await taskStore.get(taskId);
  if (!task || task.projectId !== projectId) throw new AppError("not_found", "Opgaven blev ikke fundet.");
  if (task.status === "done") throw new AppError("conflict", "Opgaven er allerede udført.");
  // Én opgave → ét job. Et blokeret job prøves igen fra AOS (Job Center → Prøv igen), ikke ved at oprette et nyt.
  if (task.aiJobId) {
    const existing = await getAiJob(task.aiJobId).catch(() => null);
    if (existing && existing.status !== "failed" && existing.status !== "cancelled") return { task, job: existing };
  }
  const job = await submitJob(
    {
      taskType: "production.agent_task",
      title: `${project.name}: ${task.title}`,
      input: { projectId, taskId, phase: task.phase, description: task.description, serviceBaseKey: project.serviceBaseKey },
      subject: { projectId, brandId: project.customer.brandId ?? undefined, customerName: project.customer.name },
      agentKey: task.assignee?.kind === "agent" ? task.assignee.id.replace(/^agt_/, "") : undefined,
      idempotencyKey: `production.task:${taskId}`,
    },
    { defer },
  );
  const updated = await taskStore.update(taskId, (t) => ({ ...t, aiJobId: job.id, updatedAt: nowIso() }));
  const outcome = job.status === "blocked" ? `blokeret af routeren — ${job.error?.message ?? ""}` : `status: ${job.status}`;
  await logEvent(projectId, "job_created", `Sendt til Job Center (${job.id}): ${task.title} — ${outcome}`);
  return { task: updated!, job };
}

// ─── Tests, filer og omkostninger ───────────────────────────────────────────

export const CreateTestSchema = TestCaseSchema.pick({ title: true, area: true, kind: true, expected: true }).extend({ area: z.string().max(80).default("Generelt"), expected: z.string().max(1000).default("") });

export async function createTest(projectId: string, raw: unknown): Promise<TestCase> {
  const input = CreateTestSchema.parse(raw);
  await requireProject(projectId);
  const now = nowIso();
  const test = await testStore.upsert({ id: newId("testCase"), projectId, ...input, status: "not_run", resultNote: "", defect: null, lastRunAt: null, simulated: false, createdAt: now, updatedAt: now });
  await logEvent(projectId, "test_recorded", `Testcase oprettet: ${input.title}.`);
  return test;
}

export const RecordTestSchema = z.object({
  status: z.enum(["passed", "failed", "blocked", "not_run"]),
  resultNote: z.string().trim().max(1000).default(""),
  defect: z.object({ title: z.string().trim().min(1).max(200), severity: z.enum(["low", "medium", "high", "critical"]), resolved: z.boolean().default(false) }).nullable().optional(),
});

export async function recordTest(projectId: string, testId: string, raw: unknown, actor: Actor = USER, simulated = false): Promise<TestCase> {
  const input = RecordTestSchema.parse(raw);
  const updated = await testStore.update(testId, (t) => {
    if (t.projectId !== projectId) throw new AppError("not_found", "Testcasen blev ikke fundet.");
    return { ...t, status: input.status, resultNote: input.resultNote, defect: input.defect === undefined ? t.defect : input.defect, lastRunAt: nowIso(), simulated, updatedAt: nowIso() };
  });
  if (!updated) throw new AppError("not_found", "Testcasen blev ikke fundet.");
  const label = { passed: "bestået", failed: "fejlet", blocked: "blokeret", not_run: "ikke kørt" }[input.status];
  await logEvent(projectId, "test_recorded", `Test ${label}: ${updated.title}${updated.defect && !updated.defect.resolved ? ` — fejl: ${updated.defect.title}` : ""}.`, actor, simulated);
  return updated;
}

export const AddFileSchema = z.object({
  kind: z.enum(["document", "code", "report", "deliverable", "link"]),
  title: z.string().trim().min(1, "Angiv en titel.").max(200),
  description: z.string().trim().max(1000).default(""),
  url: z.string().trim().url("Ugyldig URL.").max(2000).nullable().default(null),
  ref: z.string().trim().max(300).nullable().default(null),
  phase: PhaseSchema,
});

export async function addFile(projectId: string, raw: unknown, actor: Actor = USER, simulated = false): Promise<ProjectFile> {
  const input = AddFileSchema.parse(raw);
  if (input.url && !/^https?:\/\//i.test(input.url)) throw new AppError("validation_error", "Kun http(s)-links er tilladt.");
  await requireProject(projectId);
  const file = await fileStore.upsert({ id: newId("projectFile"), projectId, ...input, createdBy: actor.name, simulated, createdAt: nowIso() });
  await logEvent(projectId, "file_added", `${input.kind === "code" ? "Kodereference" : "Fil/leverance"} tilføjet: ${input.title}.`, actor, simulated);
  return file;
}

export const AddCostSchema = CostEntrySchema.pick({ category: true, description: true, amount: true });

export async function addCost(projectId: string, raw: unknown, simulated = false): Promise<CostEntry> {
  const input = AddCostSchema.parse(raw);
  await requireProject(projectId);
  const entry = await costStore.upsert({ id: newId("costEntry"), projectId, at: nowIso(), ...input, simulated });
  await logEvent(projectId, "cost_added", `Omkostning registreret: ${input.description} (${input.amount.toLocaleString("da-DK")} kr.).`, USER, simulated);
  return entry;
}

export interface ProjectFinance {
  implementationPrice: number;
  monthlyPrice: number;
  firstYearRevenue: number;
  registeredCosts: number;
  marginFirstYear: number;
  aiJobs: { count: number; apiCostUsd: number; subscriptionRuns: number; inputTokens: number; outputTokens: number };
}

/** Økonomi: aftalte priser + registrerede omkostninger + AI-omkostninger fra AOS' Job Center. */
export async function getFinance(bundle: ProjectBundle): Promise<ProjectFinance> {
  const { project, costs } = bundle;
  const jobs = await listJobs({ projectId: project.id, mode: project.mode });
  const registered = costs.reduce((s, c) => s + c.amount, 0);
  const firstYear = project.pricing.implementationPrice + 12 * project.pricing.monthlyPrice;
  return {
    implementationPrice: project.pricing.implementationPrice,
    monthlyPrice: project.pricing.monthlyPrice,
    firstYearRevenue: firstYear,
    registeredCosts: registered,
    marginFirstYear: firstYear - registered,
    aiJobs: {
      count: jobs.length,
      apiCostUsd: Math.round(jobs.reduce((s, j) => s + j.cost.apiCostUsd, 0) * 10_000) / 10_000,
      subscriptionRuns: jobs.reduce((s, j) => s + j.cost.subscriptionRuns, 0),
      inputTokens: jobs.reduce((s, j) => s + j.cost.inputTokens, 0),
      outputTokens: jobs.reduce((s, j) => s + j.cost.outputTokens, 0),
    },
  };
}

export async function jobsForProject(project: ProductionProject): Promise<PublicAiJob[]> {
  return listJobs({ projectId: project.id, mode: project.mode });
}

/** Sletter et demoprojekt og alle dets poster (kun demoprojekter i Demo Mode). */
export async function deleteDemoProject(id: string): Promise<void> {
  const project = await requireProject(id);
  if (!project.isDemo || project.mode !== "demo") throw new AppError("conflict", "Kun demoprojekter kan nulstilles.");
  const [tasks, tests, files, events, costs] = await Promise.all([taskStore.list(), testStore.list(), fileStore.list(), eventStore.list(), costStore.list()]);
  for (const t of tasks.filter((x) => x.projectId === id)) await taskStore.remove(t.id);
  for (const t of tests.filter((x) => x.projectId === id)) await testStore.remove(t.id);
  for (const f of files.filter((x) => x.projectId === id)) await fileStore.remove(f.id);
  for (const e of events.filter((x) => x.projectId === id)) await eventStore.remove(e.id);
  for (const c of costs.filter((x) => x.projectId === id)) await costStore.remove(c.id);
  await projectStore.remove(id);
}

export async function findProjectByQuote(quoteId: string): Promise<ProductionProject | null> {
  return projectStore.find((p) => p.source.quoteId === quoteId);
}

export async function listDemoProjects(): Promise<ProductionProject[]> {
  return (await projectStore.list()).filter((p) => p.isDemo && p.mode === "demo");
}
