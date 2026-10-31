import { z } from "zod";
import { IsoDate, ModeSchema } from "@agency/core";

/**
 * FÆLLES AI-INFRASTRUKTUR (V3)
 * ----------------------------
 * Én jobmodel, ét agentregister og én godkendelsesmodel, som alle seks
 * moduler bruger. Modulerne kender ikke de enkelte AI-motorer — de opretter
 * job af en bestemt opgavetype, og routeren vælger motoren.
 */

/** Eksekveringsmotorer. `internal` er almindelig software uden AI (regelbaseret). */
export const EngineKindSchema = z.enum(["internal", "claude_api", "claude_code"]);
export type EngineKind = z.infer<typeof EngineKindSchema>;

export const ExecutionPolicySchema = z.enum([
  "AUTO",
  "CLAUDE_CODE_PREFERRED",
  "CLAUDE_API_PREFERRED",
  "CLAUDE_CODE_ONLY",
  "CLAUDE_API_ONLY",
  "NO_AI",
]);
export type ExecutionPolicy = z.infer<typeof ExecutionPolicySchema>;

export const JobModuleSchema = z.enum(["research", "quotes", "production", "crm", "dashboard", "aos"]);
export type JobModule = z.infer<typeof JobModuleSchema>;

export const JobPrioritySchema = z.enum(["low", "normal", "high"]);
export type JobPriority = z.infer<typeof JobPrioritySchema>;

export const JobStatusSchema = z.enum([
  "queued",
  "awaiting_approval",
  "dispatched", // sendt til en ekstern motor (Claude Code), afventer første livstegn
  "running",
  "succeeded",
  "failed",
  "cancelled",
  "blocked", // routeren fandt ingen tilladt motor
]);
export type JobStatus = z.infer<typeof JobStatusSchema>;

export const OPEN_JOB_STATUSES: readonly JobStatus[] = ["queued", "awaiting_approval", "dispatched", "running"];
export const ACTIVE_JOB_STATUSES: readonly JobStatus[] = ["dispatched", "running"];

/** Kritiske bivirkninger, der altid kræver eksplicit godkendelse. */
export const SideEffectSchema = z.enum([
  "production_change",
  "deployment",
  "customer_system_change",
  "paid_external_action",
  "mass_action",
  "destructive_database_change",
  "customer_communication",
]);
export type SideEffect = z.infer<typeof SideEffectSchema>;

/**
 * Hvordan en hændelse er observeret. `engine` = rapporteret af motoren selv
 * (fx en Claude Code-session via callback), `platform` = registreret af AI Agency,
 * `user` = en handling i brugerfladen. Intet i tidslinjen er opdigtet.
 */
export const JobEventSourceSchema = z.enum(["platform", "engine", "user"]);

export const JobEventKindSchema = z.enum([
  "created",
  "routed",
  "approval_requested",
  "approved",
  "rejected",
  "dispatched",
  "started",
  "step",
  "tool_call",
  "file",
  "test",
  "cost",
  "completed",
  "failed",
  "cancelled",
  "retry",
  "callback_rejected",
]);
export type JobEventKind = z.infer<typeof JobEventKindSchema>;

export const JobEventSchema = z.object({
  at: IsoDate,
  kind: JobEventKindSchema,
  source: JobEventSourceSchema,
  message: z.string().max(500),
  data: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
});
export type JobEvent = z.infer<typeof JobEventSchema>;

export const RoutingCandidateSchema = z.object({
  engine: EngineKindSchema,
  accepted: z.boolean(),
  reason: z.string(),
});

export const RoutingDecisionSchema = z.object({
  policy: ExecutionPolicySchema,
  engine: EngineKindSchema.nullable(),
  /** Menneskeligt læsbar forklaring i den rækkefølge, reglerne blev anvendt. */
  trace: z.array(z.string()),
  candidates: z.array(RoutingCandidateSchema),
  requiresApproval: z.boolean(),
  approvalReasons: z.array(z.string()),
  blockedReason: z.string().nullable(),
  /** Sand, når motoren er en fallback fra den foretrukne motor. */
  fallback: z.boolean(),
  decidedAt: IsoDate,
});
export type RoutingDecision = z.infer<typeof RoutingDecisionSchema>;

export const JobCostSchema = z.object({
  inputTokens: z.number().int().min(0),
  outputTokens: z.number().int().min(0),
  apiCostUsd: z.number().min(0),
  searchCalls: z.number().int().min(0),
  externalCostUsd: z.number().min(0),
  /** Antal Claude Code-kørsler på abonnement — ingen sammenlignelig USD-pris. */
  subscriptionRuns: z.number().int().min(0),
  model: z.string().nullable(),
});
export type JobCost = z.infer<typeof JobCostSchema>;

export const EMPTY_COST: JobCost = { inputTokens: 0, outputTokens: 0, apiCostUsd: 0, searchCalls: 0, externalCostUsd: 0, subscriptionRuns: 0, model: null };

export const JobArtifactSchema = z.object({
  kind: z.enum(["report", "file", "link", "pull_request", "session"]),
  label: z.string().max(200),
  url: z.string().max(2000).nullable(),
  ref: z.string().max(200).nullable(),
});
export type JobArtifact = z.infer<typeof JobArtifactSchema>;

export const JobResultSchema = z.object({
  summary: z.string().max(4000),
  data: z.unknown().optional(),
  artifacts: z.array(JobArtifactSchema).max(50),
});
export type JobResult = z.infer<typeof JobResultSchema>;

export const JobErrorSchema = z.object({
  code: z.string().max(80),
  message: z.string().max(1000),
  /** Om et nyt forsøg er sikkert uden risiko for dobbelt eksekvering. */
  retryable: z.boolean(),
});
export type JobError = z.infer<typeof JobErrorSchema>;

export const JobSubjectSchema = z.object({
  brandId: z.string().optional(),
  reportId: z.string().optional(),
  researchJobId: z.string().optional(),
  quoteId: z.string().optional(),
  /** Produktionsprojekt (Produktion & Levering). */
  projectId: z.string().optional(),
  /** Kunde-/brandnavn til visning og omkostning pr. kunde. */
  customerName: z.string().max(200).optional(),
});
export type JobSubject = z.infer<typeof JobSubjectSchema>;

export const AiJobSchema = z.object({
  id: z.string().startsWith("aij_"),
  module: JobModuleSchema,
  taskType: z.string().min(1).max(80),
  title: z.string().min(1).max(200),
  mode: ModeSchema,
  priority: JobPrioritySchema,
  status: JobStatusSchema,
  policy: ExecutionPolicySchema,
  routing: RoutingDecisionSchema,
  engine: EngineKindSchema.nullable(),
  agentId: z.string().nullable(),
  agentVersion: z.number().int().positive().nullable(),
  subject: JobSubjectSchema,
  input: z.record(z.unknown()),
  idempotencyKey: z.string().max(200).nullable(),
  attempt: z.number().int().min(1),
  maxAttempts: z.number().int().min(1).max(5),
  dependsOn: z.array(z.string()).max(20),
  approvalId: z.string().nullable(),
  external: z
    .object({
      claudeCodeSessionId: z.string().max(200).nullable(),
      claudeCodeSessionUrl: z.string().max(500).nullable(),
      routineId: z.string().max(100).nullable(),
    })
    .nullable(),
  /** Engangsnøgle til motorens tilbagemeldinger — kun SHA-256-hash gemmes. */
  callback: z.object({ tokenHash: z.string().length(64), expiresAt: IsoDate, events: z.number().int().min(0) }).nullable(),
  result: JobResultSchema.nullable(),
  error: JobErrorSchema.nullable(),
  cost: JobCostSchema,
  timeline: z.array(JobEventSchema).max(250),
  createdAt: IsoDate,
  startedAt: IsoDate.nullable(),
  finishedAt: IsoDate.nullable(),
  updatedAt: IsoDate,
});
export type AiJob = z.infer<typeof AiJobSchema>;

/** Visningsvenlig udgave uden callback-hash. */
export type PublicAiJob = Omit<AiJob, "callback"> & { callbackActive: boolean; overdue: boolean };

// ─── Agenter ────────────────────────────────────────────────────────────────

export const AgentZoneSchema = z.enum(["command", "research", "sales", "engineering", "quality", "integrations", "customers", "intelligence"]);
export type AgentZone = z.infer<typeof AgentZoneSchema>;

export const AgentSchema = z.object({
  id: z.string().regex(/^agt_[a-z][a-z0-9-]{1,30}$/),
  key: z.string().regex(/^[a-z][a-z0-9-]{1,30}$/),
  name: z.string().min(1).max(40),
  role: z.string().min(1).max(80),
  zone: AgentZoneSchema,
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  enabled: z.boolean(),
  activeVersion: z.number().int().positive(),
  createdAt: IsoDate,
  updatedAt: IsoDate,
});
export type Agent = z.infer<typeof AgentSchema>;

export const AgentVersionSchema = z.object({
  id: z.string().regex(/^agv_[a-z][a-z0-9-]{1,30}_v\d+$/),
  agentId: z.string(),
  version: z.number().int().positive(),
  description: z.string().min(1).max(600),
  specialty: z.string().min(1).max(300),
  instructions: z.string().min(20).max(8000),
  allowedTools: z.array(z.string()).max(30),
  engines: z.array(EngineKindSchema).min(1),
  taskTypes: z.array(z.string()).max(30),
  source: z.enum(["repository", "platform"]),
  status: z.enum(["active", "pending_approval", "superseded", "rejected"]),
  changeNote: z.string().max(500),
  createdAt: IsoDate,
});
export type AgentVersion = z.infer<typeof AgentVersionSchema>;

/** Status udledes udelukkende af registrerede job — aldrig af animation eller antagelser. */
export const AgentRuntimeStatusSchema = z.enum(["working", "waiting", "idle", "error", "disabled"]);
export type AgentRuntimeStatus = z.infer<typeof AgentRuntimeStatusSchema>;

// ─── Godkendelser ───────────────────────────────────────────────────────────

export const ApprovalCategorySchema = z.enum([
  "agent_change",
  "paid_action",
  "production",
  "deployment",
  "customer_system",
  "mass_action",
  "destructive_database",
  "customer_communication",
]);
export type ApprovalCategory = z.infer<typeof ApprovalCategorySchema>;

export const ApprovalSchema = z.object({
  id: z.string().startsWith("apr_"),
  category: ApprovalCategorySchema,
  title: z.string().max(200),
  description: z.string().max(2000),
  reasons: z.array(z.string().max(300)).max(10),
  status: z.enum(["pending", "approved", "rejected"]),
  mode: ModeSchema,
  subject: z.object({
    aiJobId: z.string().optional(),
    agentVersionId: z.string().optional(),
    /** Generisk reference til en handling i et modul (fx en faseport i Produktion). */
    ref: z.object({ module: z.string().max(40), entityId: z.string().max(80), action: z.string().max(60), detail: z.string().max(200).optional() }).optional(),
  }),
  estimatedCostUsd: z.number().min(0).nullable(),
  decisionNote: z.string().max(500).nullable(),
  requestedAt: IsoDate,
  decidedAt: IsoDate.nullable(),
});
export type Approval = z.infer<typeof ApprovalSchema>;
