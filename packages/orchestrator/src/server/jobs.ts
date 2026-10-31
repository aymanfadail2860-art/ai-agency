import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { assertWithinBudget, createCollectionStore, getSettings, publishEvent, recordUsage } from "@agency/core/server";
import { fireRoutine } from "@agency/integrations";
import { AppError, newId, nowIso } from "@agency/shared";
import {
  AiJobSchema,
  EMPTY_COST,
  ExecutionPolicySchema,
  JobPrioritySchema,
  JobSubjectSchema,
  OPEN_JOB_STATUSES,
  type AiJob,
  type EngineKind,
  type JobCost,
  type JobError,
  type JobEvent,
  type JobResult,
  type JobSubject,
  type PublicAiJob,
} from "../models";
import { routeTask } from "../router";
import { getTaskType, type TaskTypeDefinition } from "../task-types";
import { createApproval } from "./approvals";
import { agentRegistry, type AgentWithVersion } from "./agents";
import { apiBudgetRemainingUsd, engineAvailability, orchestratorConfig, routineFor } from "./config";

/**
 * JOB CENTER
 * ----------
 * Alle AI- og automatiseringsopgaver på tværs af modulerne registreres her:
 * routing, status, tidslinje, resultater, fejl, genforsøg, tidsforbrug,
 * omkostninger og afhængigheder.
 *
 * Eksekvering:
 *  - `internal` og `claude_api`: en executor registreret af app'en (komposition)
 *    kører i serverprocessen (på Vercel via `after()`).
 *  - `claude_code`: jobbet sendes til en Claude Code-rutine. Sessionen melder
 *    fremskridt og resultat tilbage via `POST /api/aos/jobs/:id/callback` med en
 *    engangsnøgle. Der findes ingen status-API, så manglende svar vises som
 *    "forsinket" — aldrig som opdigtet aktivitet.
 */

const jobStore = createCollectionStore("aos", "ai-jobs", AiJobSchema);
const MAX_TIMELINE = 240;
const MAX_CALLBACK_EVENTS = 150;
/** Et internt/API-job uden livstegn i 10 min. er afbrudt (fx genstartet serverfunktion). */
const STALE_LOCAL_MS = 10 * 60_000;

export type Defer = (task: () => Promise<void>) => void;

export interface ExecutionContext {
  engine: EngineKind;
  jobId: string;
  /**
   * Planlægger langvarigt arbejde efter HTTP-svaret (på Vercel via `after()`).
   * Executoren selv skal returnere hurtigt; fejl i det udskudte arbejde markerer jobbet som fejlet.
   */
  defer(task: () => Promise<void>): void;
  emit(kind: JobEvent["kind"], message: string, data?: JobEvent["data"]): Promise<void>;
  recordCost(delta: Partial<JobCost>): Promise<void>;
  setSubject(patch: Partial<JobSubject>): Promise<void>;
  complete(result: JobResult): Promise<void>;
  fail(error: JobError): Promise<void>;
}

export type Executor = (job: AiJob, ctx: ExecutionContext) => Promise<void>;

const executors = new Map<string, Executor>();
const resultSchemas = new Map<string, z.ZodTypeAny>();

/** Registreres i app'ens kompositionslag — orchestratoren kender ikke modulerne. */
export function registerExecutor(taskType: string, executor: Executor): void {
  executors.set(taskType, executor);
}

/** Skema for `result.data`, som en ekstern motor (Claude Code) skal levere. */
export function registerResultSchema(taskType: string, schema: z.ZodTypeAny): void {
  resultSchemas.set(taskType, schema);
}

export const SubmitJobSchema = z.object({
  taskType: z.string().min(1).max(80),
  title: z.string().min(1).max(200),
  input: z.record(z.unknown()).default({}),
  subject: JobSubjectSchema.default({}),
  policy: ExecutionPolicySchema.default("AUTO"),
  priority: JobPrioritySchema.default("normal"),
  idempotencyKey: z.string().max(200).optional(),
  dependsOn: z.array(z.string().startsWith("aij_")).max(20).default([]),
});
export type SubmitJobInput = z.input<typeof SubmitJobSchema>;

const event = (kind: JobEvent["kind"], source: JobEvent["source"], message: string, data?: JobEvent["data"]): JobEvent => ({
  at: nowIso(),
  kind,
  source,
  message: message.slice(0, 500),
  ...(data ? { data } : {}),
});

function appendEvents(job: AiJob, ...events: JobEvent[]): AiJob["timeline"] {
  const timeline = [...job.timeline, ...events];
  // Behold første hændelse (oprettelse) og de nyeste.
  return timeline.length > MAX_TIMELINE ? [timeline[0]!, ...timeline.slice(timeline.length - MAX_TIMELINE + 1)] : timeline;
}

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export function toPublicJob(job: AiJob, now = Date.now()): PublicAiJob {
  const { callback, ...rest } = job;
  const since = new Date(job.startedAt ?? job.createdAt).getTime();
  const overdue =
    job.engine === "claude_code" && (job.status === "dispatched" || job.status === "running") && now - since > orchestratorConfig.claudeCodeTimeoutMinutes() * 60_000;
  return { ...rest, callbackActive: Boolean(callback && new Date(callback.expiresAt).getTime() > now), overdue };
}

async function mutate(jobId: string, fn: (job: AiJob) => AiJob): Promise<AiJob> {
  const updated = await jobStore.update(jobId, (job) => ({ ...fn(job), updatedAt: nowIso() }));
  if (!updated) throw new AppError("not_found", "Opgaven blev ikke fundet.");
  return updated;
}

function staleReason(job: AiJob, now = Date.now()): string | null {
  if (job.status === "awaiting_approval") return null;
  if (job.engine === "claude_code") {
    return toPublicJob(job, now).overdue ? "Claude Code-sessionen svarede ikke inden for tidsgrænsen. Se sessionen for detaljer." : null;
  }
  return now - new Date(job.updatedAt).getTime() > STALE_LOCAL_MS ? "Opgaven stoppede uden at melde tilbage (fx genstart af serverfunktionen)." : null;
}

/** Motorernes tilgængelighed, begrænset til de motorer agentens aktive version må bruge. */
function availabilityFor(task: TaskTypeDefinition, agent: AgentWithVersion | null) {
  const availability = engineAvailability(task.key);
  if (!agent) return availability;
  for (const key of Object.keys(availability) as EngineKind[]) {
    if (!agent.version.engines.includes(key)) availability[key] = { available: false, reason: `Agenten ${agent.name} (v${agent.version.version}) må ikke bruge denne motor.` };
  }
  return availability;
}

function agentBlocked(agent: { enabled: boolean; name: string } | null): string | null {
  return agent && !agent.enabled ? `Agenten ${agent.name} er deaktiveret og modtager ikke opgaver.` : null;
}

function requireTask(taskType: string): TaskTypeDefinition {
  const task = getTaskType(taskType);
  if (!task) throw new AppError("validation_error", `Ukendt opgavetype: ${taskType}`);
  return task;
}

export async function submitJob(raw: SubmitJobInput, options: { defer?: Defer } = {}): Promise<PublicAiJob> {
  const input = SubmitJobSchema.parse(raw);
  const task = requireTask(input.taskType);
  const { mode } = await getSettings();

  if (input.idempotencyKey) {
    const existing = await jobStore.find((j) => j.idempotencyKey === input.idempotencyKey && OPEN_JOB_STATUSES.includes(j.status));
    if (existing) {
      const stale = staleReason(existing);
      if (!stale) return toPublicJob(existing);
      // Et hængende job må ikke blokere nye forsøg for altid.
      await failJob(existing.id, { code: "stale", message: stale, retryable: true });
    }
  }
  for (const dep of input.dependsOn) {
    if (!(await jobStore.get(dep))) throw new AppError("validation_error", `Afhængigheden ${dep} findes ikke.`);
  }

  const agent = await agentRegistry.resolveForTask(task.defaultAgent);
  const decision = routeTask({
    task,
    policy: input.policy,
    mode,
    availability: availabilityFor(task, agent),
    apiBudgetRemainingUsd: await apiBudgetRemainingUsd(),
    approvalThresholdUsd: orchestratorConfig.approvalThresholdUsd(),
    agentBlockedReason: agentBlocked(agent),
  });

  const now = nowIso();
  const status: AiJob["status"] = decision.engine === null ? "blocked" : decision.requiresApproval ? "awaiting_approval" : "queued";
  let job: AiJob = {
    id: newId("aiJob"),
    module: task.module,
    taskType: task.key,
    title: input.title,
    mode,
    priority: input.priority,
    status,
    policy: input.policy,
    routing: decision,
    engine: decision.engine,
    agentId: agent?.id ?? null,
    agentVersion: agent?.version.version ?? null,
    subject: input.subject,
    input: input.input,
    idempotencyKey: input.idempotencyKey ?? null,
    attempt: 1,
    maxAttempts: 3,
    dependsOn: input.dependsOn,
    approvalId: null,
    external: null,
    callback: null,
    result: null,
    error: decision.blockedReason ? { code: "blocked", message: decision.blockedReason, retryable: true } : null,
    cost: EMPTY_COST,
    timeline: [
      event("created", "platform", `Opgave oprettet: ${task.label}`),
      event("routed", "platform", decision.engine ? `Router: ${decision.trace[decision.trace.length - 1]}` : `Router: ${decision.blockedReason}`),
    ],
    createdAt: now,
    startedAt: null,
    finishedAt: null,
    updatedAt: now,
  };
  job = await jobStore.upsert(job);
  await publishEvent({ type: "ai.job.created", source: "aos", mode, subject: { aiJobId: job.id }, payload: { taskType: task.key, engine: decision.engine, status } });

  if (status === "awaiting_approval") {
    const approval = await createApproval({
      category: task.sideEffects.length ? (task.sideEffects.includes("deployment") ? "deployment" : "production") : "paid_action",
      title: `Godkend: ${input.title}`,
      description: `${task.label} via ${decision.engine}. ${task.description}`,
      reasons: decision.approvalReasons,
      mode,
      subject: { aiJobId: job.id },
      estimatedCostUsd: decision.engine === "claude_api" ? task.estimatedApiCostUsd : null,
    });
    job = await mutate(job.id, (j) => ({ ...j, approvalId: approval.id, timeline: appendEvents(j, event("approval_requested", "platform", approval.reasons.join(" "))) }));
    return toPublicJob(job);
  }
  if (status === "queued") job = await dispatch(job.id, options);
  return toPublicJob(job);
}

async function dependenciesDone(job: AiJob): Promise<boolean> {
  for (const dep of job.dependsOn) {
    const d = await jobStore.get(dep);
    if (!d || d.status !== "succeeded") return false;
  }
  return true;
}

/** Starter et job i kø på den motor, routeren har valgt. */
export async function dispatch(jobId: string, options: { defer?: Defer } = {}): Promise<AiJob> {
  let job = await getJobOrThrow(jobId);
  if (job.status !== "queued") return job;
  if (!(await dependenciesDone(job))) {
    return mutate(job.id, (j) => ({ ...j, timeline: appendEvents(j, event("step", "platform", "Venter på afhængige opgaver.")) }));
  }
  if (job.engine === "claude_code") return dispatchClaudeCode(job);
  const executor = executors.get(job.taskType);
  if (!executor || !job.engine) {
    return failJob(job.id, { code: "not_implemented", message: "Der er ingen udfører for denne opgavetype.", retryable: false });
  }
  job = await mutate(job.id, (j) => ({ ...j, status: "running", startedAt: nowIso(), timeline: appendEvents(j, event("started", "platform", `Startet på ${j.engine === "claude_api" ? "Claude API" : "intern software"}.`)) }));
  const inline: Array<() => Promise<void>> = [];
  const ctx = contextFor(job.id, job.engine!, (task) => (options.defer ? options.defer(task) : inline.push(task)));
  const guard = async (fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (err) {
      console.error("[aos] executor fejlede", err);
      await ctx.fail({ code: err instanceof AppError ? err.code : "internal_error", message: err instanceof AppError ? err.message : "Uventet fejl under udførelsen.", retryable: true });
    }
  };
  await guard(() => executor(job, ctx));
  // Uden `defer` (tests, lokale scripts) køres det udskudte arbejde med det samme.
  for (const task of inline) await guard(task);
  return (await jobStore.get(job.id)) ?? job;
}

function contextFor(jobId: string, engine: EngineKind, schedule: (task: () => Promise<void>) => void): ExecutionContext {
  const live = async () => {
    const j = await jobStore.get(jobId);
    return j && (j.status === "running" || j.status === "dispatched") ? j : null;
  };
  const ctx: ExecutionContext = {
    engine,
    jobId,
    defer(task) {
      schedule(async () => {
        try {
          await task();
        } catch (err) {
          console.error("[aos] udskudt arbejde fejlede", err);
          await ctx.fail({ code: err instanceof AppError ? err.code : "internal_error", message: err instanceof AppError ? err.message : "Uventet fejl under udførelsen.", retryable: true });
        }
      });
    },
    async emit(kind, message, data) {
      if (!(await live())) return;
      await mutate(jobId, (j) => ({ ...j, timeline: appendEvents(j, event(kind, "platform", message, data)) }));
    },
    async recordCost(delta) {
      await mutate(jobId, (j) => ({ ...j, cost: addCost(j.cost, delta) }));
    },
    async setSubject(patch) {
      await mutate(jobId, (j) => ({ ...j, subject: { ...j.subject, ...patch } }));
    },
    async complete(result) {
      if (!(await live())) return;
      await completeJob(jobId, result, "platform");
    },
    async fail(error) {
      if (!(await live())) return;
      await failJob(jobId, error);
    },
  };
  return ctx;
}

function addCost(cost: JobCost, delta: Partial<JobCost>): JobCost {
  return {
    inputTokens: cost.inputTokens + (delta.inputTokens ?? 0),
    outputTokens: cost.outputTokens + (delta.outputTokens ?? 0),
    apiCostUsd: Math.round((cost.apiCostUsd + (delta.apiCostUsd ?? 0)) * 10_000) / 10_000,
    searchCalls: cost.searchCalls + (delta.searchCalls ?? 0),
    externalCostUsd: Math.round((cost.externalCostUsd + (delta.externalCostUsd ?? 0)) * 10_000) / 10_000,
    subscriptionRuns: cost.subscriptionRuns + (delta.subscriptionRuns ?? 0),
    model: delta.model ?? cost.model,
  };
}

async function completeJob(jobId: string, result: JobResult, source: JobEvent["source"]): Promise<AiJob> {
  const job = await mutate(jobId, (j) => ({
    ...j,
    status: "succeeded",
    result,
    error: null,
    callback: null,
    finishedAt: nowIso(),
    timeline: appendEvents(j, event("completed", source, result.summary.slice(0, 300) || "Gennemført.")),
  }));
  await publishEvent({ type: "ai.job.completed", source: "aos", mode: job.mode, subject: { aiJobId: job.id }, payload: { taskType: job.taskType, engine: job.engine } });
  await releaseDependents(job.id);
  return job;
}

async function failJob(jobId: string, error: JobError, source: JobEvent["source"] = "platform"): Promise<AiJob> {
  const job = await mutate(jobId, (j) => ({
    ...j,
    status: "failed",
    error,
    callback: null,
    finishedAt: nowIso(),
    timeline: appendEvents(j, event("failed", source, error.message)),
  }));
  await publishEvent({ type: "ai.job.failed", source: "aos", mode: job.mode, subject: { aiJobId: job.id }, payload: { taskType: job.taskType, code: error.code } });
  return job;
}

async function releaseDependents(jobId: string): Promise<void> {
  const waiting = (await jobStore.list()).filter((j) => j.status === "queued" && j.dependsOn.includes(jobId));
  for (const dependent of waiting) await dispatch(dependent.id);
}

// ─── Claude Code ────────────────────────────────────────────────────────────

/** Protokollen, som rutinen læser fra `<routine-fire-payload>` — se routines/ai-agency-job.md. */
export const ROUTINE_PROTOCOL = "ai-agency.routine-job@1";

async function dispatchClaudeCode(job: AiJob): Promise<AiJob> {
  const routine = routineFor(job.taskType);
  const base = orchestratorConfig.publicBaseUrl();
  if (!routine || !base) {
    return failJob(job.id, { code: "integration_not_configured", message: "Claude Code-rutinen eller AGENCY_PUBLIC_URL er ikke konfigureret.", retryable: true });
  }
  try {
    await assertWithinBudget("claude_code_runs");
  } catch (err) {
    return failJob(job.id, { code: "rate_limited", message: err instanceof AppError ? err.message : "Dagens grænse for Claude Code er nået.", retryable: true });
  }
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + orchestratorConfig.callbackTokenHours() * 3_600_000).toISOString();
  // Gem nøglens hash FØR kaldet, så en hurtig tilbagemelding altid kan valideres.
  job = await mutate(job.id, (j) => ({ ...j, callback: { tokenHash: hashToken(token), expiresAt, events: 0 } }));
  const payload = {
    protocol: ROUTINE_PROTOCOL,
    jobId: job.id,
    taskType: job.taskType,
    title: job.title,
    agent: job.agentId,
    agentVersion: job.agentVersion,
    callback: { url: `${base}/api/aos/jobs/${job.id}/callback`, token, expiresAt },
    input: job.input,
  };
  const outcome = await fireRoutine(routine, JSON.stringify(payload));
  if (outcome.ok) {
    await recordUsage("claude_code_runs", { calls: 1 });
    return mutate(job.id, (j) => ({
      ...j,
      status: "dispatched",
      startedAt: nowIso(),
      external: { claudeCodeSessionId: outcome.sessionId, claudeCodeSessionUrl: outcome.sessionUrl, routineId: routine.routineId },
      cost: addCost(j.cost, { subscriptionRuns: 1 }),
      timeline: appendEvents(j, event("dispatched", "platform", "Sendt til Claude Code-rutine. Afventer tilbagemelding fra sessionen.", { sessionId: outcome.sessionId })),
    }));
  }
  await recordUsage("claude_code_runs", { errors: 1 });
  const message = outcome.ambiguous
    ? `${outcome.message} Sessionen kan være startet alligevel — kontroller i Claude Code før et nyt forsøg.`
    : outcome.retryAfterSeconds
      ? `${outcome.message} Prøv igen om ${Math.ceil(outcome.retryAfterSeconds / 60)} min.`
      : outcome.message;
  return failJob(job.id, { code: `claude_code_${outcome.code}`, message, retryable: !outcome.ambiguous && (outcome.code === "rate_limited" || outcome.code === "server_error") });
}

export const CallbackSchema = z.union([
  z.object({
    type: z.literal("progress"),
    kind: z.enum(["step", "tool_call", "file", "test"]).default("step"),
    message: z.string().min(1).max(500),
  }),
  z.object({
    type: z.literal("result"),
    status: z.literal("succeeded"),
    summary: z.string().min(1).max(4000),
    data: z.unknown().optional(),
    artifacts: z
      .array(z.object({ kind: z.enum(["file", "link", "pull_request"]), label: z.string().max(200), url: z.string().url().max(2000).nullable().default(null) }))
      .max(50)
      .default([]),
  }),
  z.object({
    type: z.literal("result"),
    status: z.literal("failed"),
    error: z.object({ message: z.string().min(1).max(1000) }),
  }),
]);

/** Tilbagemelding fra en Claude Code-session. Nøglen er knyttet til præcis ét job. */
export async function handleCallback(jobId: string, authorization: string | null, body: unknown): Promise<{ accepted: true; status: AiJob["status"] }> {
  const job = await jobStore.get(jobId);
  const token = authorization?.startsWith("Bearer ") ? authorization.slice(7).trim() : null;
  if (!job || !token) throw new AppError("unauthorized", "Ugyldig eller manglende nøgle.");
  const valid =
    job.callback !== null &&
    new Date(job.callback.expiresAt).getTime() > Date.now() &&
    timingSafeEqual(Buffer.from(hashToken(token), "hex"), Buffer.from(job.callback.tokenHash, "hex"));
  if (!valid) throw new AppError("unauthorized", "Ugyldig eller udløbet nøgle.");
  if (job.status !== "dispatched" && job.status !== "running") throw new AppError("conflict", "Opgaven modtager ikke længere tilbagemeldinger.");
  if (job.callback!.events >= MAX_CALLBACK_EVENTS) throw new AppError("rate_limited", "For mange tilbagemeldinger for denne opgave.");

  const parsed = CallbackSchema.safeParse(body);
  if (!parsed.success) {
    await mutate(jobId, (j) => ({ ...j, callback: j.callback && { ...j.callback, events: j.callback.events + 1 }, timeline: appendEvents(j, event("callback_rejected", "platform", "Tilbagemelding afvist: ugyldigt format.")) }));
    throw new AppError("validation_error", "Ugyldigt format for tilbagemelding.");
  }
  const msg = parsed.data;
  if (msg.type === "progress") {
    const updated = await mutate(jobId, (j) => ({
      ...j,
      status: "running",
      startedAt: j.startedAt ?? nowIso(),
      callback: j.callback && { ...j.callback, events: j.callback.events + 1 },
      timeline: appendEvents(j, event(msg.kind, "engine", msg.message)),
    }));
    return { accepted: true, status: updated.status };
  }
  if (msg.status === "failed") {
    const failed = await failJob(jobId, { code: "engine_reported_failure", message: msg.error.message, retryable: true }, "engine");
    return { accepted: true, status: failed.status };
  }
  const schema = resultSchemas.get(job.taskType);
  let data: unknown = msg.data;
  if (schema) {
    const checked = schema.safeParse(msg.data);
    if (!checked.success) {
      const issue = checked.error.issues[0];
      await mutate(jobId, (j) => ({ ...j, callback: j.callback && { ...j.callback, events: j.callback.events + 1 }, timeline: appendEvents(j, event("callback_rejected", "platform", `Resultat afvist: ${issue ? `${issue.path.join(".")}: ${issue.message}` : "ugyldige data"}. Sessionen kan sende et rettet resultat.`)) }));
      throw new AppError("validation_error", "Resultatet matcher ikke opgavetypens skema.");
    }
    data = checked.data;
  }
  const done = await completeJob(
    jobId,
    { summary: msg.summary, data, artifacts: msg.artifacts.map((a) => ({ kind: a.kind, label: a.label, url: a.url, ref: null })) },
    "engine",
  );
  return { accepted: true, status: done.status };
}

// ─── Forespørgsler og handlinger ────────────────────────────────────────────

async function getJobOrThrow(jobId: string): Promise<AiJob> {
  const job = await jobStore.get(jobId);
  if (!job) throw new AppError("not_found", "Opgaven blev ikke fundet.");
  return job;
}

export async function getJob(jobId: string): Promise<PublicAiJob> {
  return toPublicJob(await getJobOrThrow(jobId));
}

export interface JobFilter {
  mode?: "demo" | "live";
  module?: string;
  status?: string;
  agentId?: string;
  brandId?: string;
  taskType?: string;
  limit?: number;
}

export async function listJobs(filter: JobFilter = {}): Promise<PublicAiJob[]> {
  const now = Date.now();
  return (await jobStore.list())
    .filter(
      (j) =>
        (!filter.mode || j.mode === filter.mode) &&
        (!filter.module || j.module === filter.module) &&
        (!filter.status || j.status === filter.status) &&
        (!filter.agentId || j.agentId === filter.agentId) &&
        (!filter.brandId || j.subject.brandId === filter.brandId) &&
        (!filter.taskType || j.taskType === filter.taskType),
    )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, filter.limit ?? 500)
    .map((j) => toPublicJob(j, now));
}

/** Alle job (internt brug til metrikker og agentstatus). */
export async function allJobs(): Promise<AiJob[]> {
  return jobStore.list();
}

export async function cancelJob(jobId: string): Promise<PublicAiJob> {
  const job = await getJobOrThrow(jobId);
  if (!["queued", "awaiting_approval", "blocked", "dispatched", "running"].includes(job.status)) {
    throw new AppError("conflict", "Opgaven er allerede afsluttet.");
  }
  const note =
    job.engine === "claude_code" && (job.status === "dispatched" || job.status === "running")
      ? "Annulleret i AI Agency. Sessionen i Claude Code stoppes ikke automatisk — åbn sessionen for at stoppe den."
      : "Annulleret af brugeren.";
  const updated = await mutate(jobId, (j) => ({ ...j, status: "cancelled", callback: null, finishedAt: nowIso(), timeline: appendEvents(j, event("cancelled", "user", note)) }));
  return toPublicJob(updated);
}

/**
 * Nyt forsøg med ny routing (tilgængeligheden kan have ændret sig). Et Claude
 * Code-kald uden entydigt svar kan allerede have startet en session; så kræves
 * en udtrykkelig bekræftelse for at undgå dobbelt eksekvering.
 */
export async function retryJob(jobId: string, options: { confirmPossibleDuplicate?: boolean; defer?: Defer } = {}): Promise<PublicAiJob> {
  const job = await getJobOrThrow(jobId);
  if (!["failed", "blocked", "cancelled"].includes(job.status)) throw new AppError("conflict", "Kun fejlede, blokerede eller annullerede opgaver kan prøves igen.");
  if (job.attempt >= job.maxAttempts) throw new AppError("conflict", `Opgaven har brugt alle ${job.maxAttempts} forsøg. Opret en ny opgave.`);
  if (job.error && !job.error.retryable && job.engine === "claude_code" && !options.confirmPossibleDuplicate) {
    throw new AppError("conflict", "Det forrige kald til Claude Code kan have startet en session. Bekræft, at du har kontrolleret det, før du prøver igen.");
  }
  const task = requireTask(job.taskType);
  const { mode } = await getSettings();
  if (mode !== job.mode) throw new AppError("mode_mismatch", "Opgaven tilhører en anden tilstand (Demo/Live).");
  const agent = job.agentId ? await agentRegistry.get(job.agentId) : null;
  const decision = routeTask({
    task,
    policy: job.policy,
    mode,
    availability: availabilityFor(task, agent),
    apiBudgetRemainingUsd: await apiBudgetRemainingUsd(),
    approvalThresholdUsd: orchestratorConfig.approvalThresholdUsd(),
    agentBlockedReason: agentBlocked(agent),
  });
  const updated = await mutate(jobId, (j) => ({
    ...j,
    attempt: j.attempt + 1,
    routing: decision,
    engine: decision.engine,
    status: decision.engine === null ? "blocked" : "queued",
    error: decision.blockedReason ? { code: "blocked", message: decision.blockedReason, retryable: true } : null,
    result: null,
    external: null,
    finishedAt: null,
    timeline: appendEvents(j, event("retry", "user", `Forsøg ${j.attempt + 1} af ${j.maxAttempts}.`), event("routed", "platform", decision.engine ? `Router: ${decision.trace[decision.trace.length - 1]}` : `Router: ${decision.blockedReason}`)),
  }));
  // Et nyt forsøg genbruger den tidligere godkendelse; ny godkendelse kræves kun, hvis motoren ændres til en betalt motor.
  if (updated.status === "queued") return toPublicJob(await dispatch(updated.id, options));
  return toPublicJob(updated);
}

/** Kaldes af Approval Manager. */
export async function onJobApprovalDecided(jobId: string, approved: boolean, note: string | null, options: { defer?: Defer } = {}): Promise<void> {
  const job = await jobStore.get(jobId);
  if (!job || job.status !== "awaiting_approval") return;
  if (!approved) {
    await mutate(jobId, (j) => ({ ...j, status: "cancelled", finishedAt: nowIso(), timeline: appendEvents(j, event("rejected", "user", note ? `Afvist: ${note}` : "Afvist i godkendelsescentret.")) }));
    return;
  }
  await mutate(jobId, (j) => ({ ...j, status: "queued", timeline: appendEvents(j, event("approved", "user", note ? `Godkendt: ${note}` : "Godkendt.")) }));
  await dispatch(jobId, options);
}
