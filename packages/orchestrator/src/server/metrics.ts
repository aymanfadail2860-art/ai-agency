import type { AgentRuntimeStatus, AiJob, EngineKind, JobEvent, PublicAiJob } from "../models";
import { agentRegistry, type AgentWithVersion } from "./agents";
import { listApprovals } from "./approvals";
import { allJobs, toPublicJob } from "./jobs";

/**
 * AOS-METRIKKER
 * -------------
 * Alle tal beregnes udelukkende af registrerede job og godkendelser for den
 * valgte tilstand (Demo/Live). Der findes ingen simulerede eller opdigtede tal.
 */

const ERROR_WINDOW_MS = 24 * 3_600_000;

export interface AgentState {
  agent: AgentWithVersion;
  status: AgentRuntimeStatus;
  currentJob: PublicAiJob | null;
  lastJob: PublicAiJob | null;
  openJobs: number;
}

export function deriveAgentStatus(agent: { enabled: boolean }, jobs: AiJob[], now = Date.now()): { status: AgentRuntimeStatus; current: AiJob | null; last: AiJob | null } {
  const sorted = [...jobs].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const current = sorted.find((j) => j.status === "running" || j.status === "dispatched") ?? null;
  const waiting = sorted.find((j) => j.status === "awaiting_approval") ?? null;
  const last = sorted.find((j) => j.finishedAt) ?? null;
  if (!agent.enabled) return { status: "disabled", current: null, last };
  if (current) return { status: "working", current, last };
  if (waiting) return { status: "waiting", current: waiting, last };
  if (last && last.status === "failed" && now - new Date(last.finishedAt!).getTime() < ERROR_WINDOW_MS) return { status: "error", current: null, last };
  return { status: "idle", current: null, last };
}

export async function getAgentStates(mode: "demo" | "live"): Promise<AgentState[]> {
  const [agents, jobs] = await Promise.all([agentRegistry.list(), allJobs()]);
  const now = Date.now();
  return agents.map((agent) => {
    const own = jobs.filter((j) => j.agentId === agent.id && j.mode === mode);
    const { status, current, last } = deriveAgentStatus(agent, own, now);
    return {
      agent,
      status,
      currentJob: current ? toPublicJob(current, now) : null,
      lastJob: last ? toPublicJob(last, now) : null,
      openJobs: own.filter((j) => ["queued", "awaiting_approval", "dispatched", "running"].includes(j.status)).length,
    };
  });
}

const durationMs = (j: AiJob) => (j.startedAt && j.finishedAt ? new Date(j.finishedAt).getTime() - new Date(j.startedAt).getTime() : null);
const round = (n: number, d = 4) => Math.round(n * 10 ** d) / 10 ** d;

export interface CommandCenterStats {
  mode: "demo" | "live";
  agents: { total: number; working: number; idle: number; waiting: number; error: number; disabled: number };
  jobs: { open: number; running: number; succeeded: number; failed: number; blocked: number; total: number };
  approvalsPending: number;
  apiCostUsd: number;
  subscriptionRuns: number;
  activeCustomers: number;
}

export async function getCommandCenter(mode: "demo" | "live"): Promise<CommandCenterStats> {
  const [states, jobs, approvals] = await Promise.all([getAgentStates(mode), allJobs(), listApprovals({ status: "pending", mode })]);
  const own = jobs.filter((j) => j.mode === mode);
  const count = (s: AgentRuntimeStatus) => states.filter((x) => x.status === s).length;
  return {
    mode,
    agents: { total: states.length, working: count("working"), idle: count("idle"), waiting: count("waiting"), error: count("error"), disabled: count("disabled") },
    jobs: {
      open: own.filter((j) => ["queued", "awaiting_approval", "dispatched", "running"].includes(j.status)).length,
      running: own.filter((j) => j.status === "running" || j.status === "dispatched").length,
      succeeded: own.filter((j) => j.status === "succeeded").length,
      failed: own.filter((j) => j.status === "failed").length,
      blocked: own.filter((j) => j.status === "blocked").length,
      total: own.length,
    },
    approvalsPending: approvals.length,
    apiCostUsd: round(own.reduce((s, j) => s + j.cost.apiCostUsd, 0)),
    subscriptionRuns: own.reduce((s, j) => s + j.cost.subscriptionRuns, 0),
    activeCustomers: new Set(own.filter((j) => ["queued", "awaiting_approval", "dispatched", "running"].includes(j.status) && j.subject.brandId).map((j) => j.subject.brandId)).size,
  };
}

export interface ActivityItem extends JobEvent {
  jobId: string;
  jobTitle: string;
  module: AiJob["module"];
  engine: EngineKind | null;
  agentId: string | null;
}

/** Aktivitetsstrøm: tidslinjerne fra registrerede job, nyeste først. */
export async function getActivity(mode: "demo" | "live", limit = 100, since?: string): Promise<ActivityItem[]> {
  const jobs = (await allJobs()).filter((j) => j.mode === mode);
  const items: ActivityItem[] = [];
  for (const job of jobs) {
    for (const e of job.timeline) {
      if (since && e.at <= since) continue;
      items.push({ ...e, jobId: job.id, jobTitle: job.title, module: job.module, engine: job.engine, agentId: job.agentId });
    }
  }
  return items.sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
}

export interface AgentPerformance {
  agentId: string;
  name: string;
  total: number;
  succeeded: number;
  failed: number;
  completionRate: number | null;
  errorRate: number | null;
  avgDurationSec: number | null;
  apiCostUsd: number;
  subscriptionRuns: number;
}

export interface PerformanceReport {
  mode: "demo" | "live";
  agents: AgentPerformance[];
  engines: Array<{ engine: EngineKind; jobs: number; succeeded: number; apiCostUsd: number; subscriptionRuns: number }>;
  modules: Array<{ module: string; jobs: number; apiCostUsd: number }>;
  customers: Array<{ customer: string; jobs: number; apiCostUsd: number; subscriptionRuns: number }>;
  daily: Array<{ day: string; jobs: number; succeeded: number; failed: number; apiCostUsd: number }>;
  totals: { jobs: number; finished: number; apiCostUsd: number; inputTokens: number; outputTokens: number; searchCalls: number; subscriptionRuns: number };
}

export async function getPerformance(mode: "demo" | "live", days = 14): Promise<PerformanceReport> {
  const [agents, jobs] = await Promise.all([agentRegistry.list(), allJobs()]);
  const own = jobs.filter((j) => j.mode === mode);
  const finished = own.filter((j) => j.status === "succeeded" || j.status === "failed");

  const perAgent = agents.map((a): AgentPerformance => {
    const mine = own.filter((j) => j.agentId === a.id);
    const done = mine.filter((j) => j.status === "succeeded" || j.status === "failed");
    const succeeded = done.filter((j) => j.status === "succeeded").length;
    const durations = done.map(durationMs).filter((d): d is number => d !== null);
    return {
      agentId: a.id,
      name: a.name,
      total: mine.length,
      succeeded,
      failed: done.length - succeeded,
      completionRate: done.length ? round(succeeded / done.length, 3) : null,
      errorRate: done.length ? round((done.length - succeeded) / done.length, 3) : null,
      avgDurationSec: durations.length ? Math.round(durations.reduce((s, d) => s + d, 0) / durations.length / 100) / 10 : null,
      apiCostUsd: round(mine.reduce((s, j) => s + j.cost.apiCostUsd, 0)),
      subscriptionRuns: mine.reduce((s, j) => s + j.cost.subscriptionRuns, 0),
    };
  });

  const engines = (["internal", "claude_api", "claude_code"] as EngineKind[]).map((engine) => {
    const mine = own.filter((j) => j.engine === engine && j.status !== "blocked");
    return {
      engine,
      jobs: mine.length,
      succeeded: mine.filter((j) => j.status === "succeeded").length,
      apiCostUsd: round(mine.reduce((s, j) => s + j.cost.apiCostUsd, 0)),
      subscriptionRuns: mine.reduce((s, j) => s + j.cost.subscriptionRuns, 0),
    };
  });

  const group = <K extends string>(key: (j: AiJob) => K | null) => {
    const map = new Map<K, AiJob[]>();
    for (const j of own) {
      const k = key(j);
      if (k) map.set(k, [...(map.get(k) ?? []), j]);
    }
    return map;
  };
  const modules = [...group((j) => j.module).entries()].map(([module, list]) => ({ module, jobs: list.length, apiCostUsd: round(list.reduce((s, j) => s + j.cost.apiCostUsd, 0)) }));
  const customers = [...group((j) => j.subject.customerName ?? null).entries()]
    .map(([customer, list]) => ({ customer, jobs: list.length, apiCostUsd: round(list.reduce((s, j) => s + j.cost.apiCostUsd, 0)), subscriptionRuns: list.reduce((s, j) => s + j.cost.subscriptionRuns, 0) }))
    .sort((a, b) => b.jobs - a.jobs)
    .slice(0, 20);

  const today = new Date();
  const daily = Array.from({ length: days }, (_, i) => {
    const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - (days - 1 - i)));
    const day = d.toISOString().slice(0, 10);
    const list = own.filter((j) => j.createdAt.slice(0, 10) === day);
    return {
      day,
      jobs: list.length,
      succeeded: list.filter((j) => j.status === "succeeded").length,
      failed: list.filter((j) => j.status === "failed").length,
      apiCostUsd: round(list.reduce((s, j) => s + j.cost.apiCostUsd, 0)),
    };
  });

  return {
    mode,
    agents: perAgent,
    engines,
    modules,
    customers,
    daily,
    totals: {
      jobs: own.length,
      finished: finished.length,
      apiCostUsd: round(own.reduce((s, j) => s + j.cost.apiCostUsd, 0)),
      inputTokens: own.reduce((s, j) => s + j.cost.inputTokens, 0),
      outputTokens: own.reduce((s, j) => s + j.cost.outputTokens, 0),
      searchCalls: own.reduce((s, j) => s + j.cost.searchCalls, 0),
      subscriptionRuns: own.reduce((s, j) => s + j.cost.subscriptionRuns, 0),
    },
  };
}
