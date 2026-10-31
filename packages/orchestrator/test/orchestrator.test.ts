import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { getTaskType, policiesFor, routeTask, type EngineAvailability, type EngineKind, type TaskTypeDefinition } from "@agency/orchestrator";

const fire = vi.hoisted(() => ({ outcome: null as unknown, calls: [] as Array<{ text: string }> }));
vi.mock("@agency/integrations", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@agency/integrations")>();
  return {
    ...actual,
    fireRoutine: vi.fn(async (_config: unknown, text: string) => {
      fire.calls.push({ text });
      return fire.outcome;
    }),
  };
});

const avail = (over: Partial<Record<EngineKind, boolean>> = {}): Record<EngineKind, EngineAvailability> => ({
  internal: { available: true, reason: "ok" },
  claude_api: { available: over.claude_api ?? false, reason: over.claude_api ? "nøgle sat" : "ANTHROPIC_API_KEY mangler" },
  claude_code: { available: over.claude_code ?? false, reason: over.claude_code ? "rutine sat" : "rutine mangler" },
});
const brand = getTaskType("research.brand_analysis")!;
const deep = getTaskType("research.deep_research")!;
const base = { mode: "live" as const, apiBudgetRemainingUsd: 5, approvalThresholdUsd: 1 };

describe("Execution Router", () => {
  it("AUTO på en interaktiv opgave vælger Claude API, når nøglen findes", () => {
    const d = routeTask({ ...base, task: brand, policy: "AUTO", availability: avail({ claude_api: true }) });
    expect(d.engine).toBe("claude_api");
    expect(d.fallback).toBe(false);
    expect(d.trace.join(" ")).toMatch(/interaktiv/);
  });

  it("falder tydeligt tilbage til intern software uden nøgle — og forklarer hvorfor", () => {
    const d = routeTask({ ...base, task: brand, policy: "AUTO", availability: avail() });
    expect(d.engine).toBe("internal");
    expect(d.fallback).toBe(true);
    expect(d.candidates.find((c) => c.engine === "claude_api")?.reason).toMatch(/ANTHROPIC_API_KEY/);
  });

  it("*_ONLY har ingen stille fallback", () => {
    const d = routeTask({ ...base, task: brand, policy: "CLAUDE_API_ONLY", availability: avail() });
    expect(d.engine).toBeNull();
    expect(d.blockedReason).toMatch(/ANTHROPIC_API_KEY/);
    const code = routeTask({ ...base, task: deep, policy: "CLAUDE_CODE_ONLY", availability: avail() });
    expect(code.engine).toBeNull();
  });

  it("NO_AI bruger intern software og afviser opgaver, der kræver AI", () => {
    expect(routeTask({ ...base, task: brand, policy: "NO_AI", availability: avail({ claude_api: true }) }).engine).toBe("internal");
    expect(routeTask({ ...base, task: deep, policy: "NO_AI", availability: avail({ claude_code: true }) }).engine).toBeNull();
  });

  it("baggrundsopgaver foretrækker Claude Code (abonnement) frem for betalt API", () => {
    const task: TaskTypeDefinition = { ...getTaskType("dashboard.insights")!, implemented: true };
    expect(routeTask({ ...base, task, policy: "AUTO", availability: avail({ claude_api: true, claude_code: true }) }).engine).toBe("claude_code");
    expect(routeTask({ ...base, task, policy: "CLAUDE_API_PREFERRED", availability: avail({ claude_api: true, claude_code: true }) }).engine).toBe("claude_api");
  });

  it("respekterer API-budgettet og kræver godkendelse over tærsklen", () => {
    const overBudget = routeTask({ ...base, apiBudgetRemainingUsd: 0.1, task: brand, policy: "AUTO", availability: avail({ claude_api: true }) });
    expect(overBudget.engine).toBe("internal");
    expect(overBudget.candidates[0]?.reason).toMatch(/budget/);
    const costly = routeTask({ ...base, approvalThresholdUsd: 0.1, task: brand, policy: "AUTO", availability: avail({ claude_api: true }) });
    expect(costly.requiresApproval).toBe(true);
  });

  it("kritiske bivirkninger kræver altid godkendelse; planlagte opgaver blokeres", () => {
    const deploy: TaskTypeDefinition = { ...getTaskType("production.deploy")!, implemented: true };
    const d = routeTask({ ...base, task: deploy, policy: "AUTO", availability: avail({ claude_code: true }) });
    expect(d.requiresApproval).toBe(true);
    expect(d.approvalReasons.join(" ")).toMatch(/Deployment/);
    expect(routeTask({ ...base, task: getTaskType("production.deploy")!, policy: "AUTO", availability: avail({ claude_code: true }) }).blockedReason).toMatch(/ikke implementeret/);
  });

  it("Demo Mode bruger aldrig eksterne motorer", () => {
    expect(routeTask({ ...base, mode: "demo", task: brand, policy: "CLAUDE_API_ONLY", availability: avail({ claude_api: true }) }).engine).toBe("internal");
    expect(routeTask({ ...base, mode: "demo", task: deep, policy: "AUTO", availability: avail({ claude_code: true }) }).engine).toBeNull();
  });

  it("tilbyder kun politikker, som opgaven understøtter", () => {
    expect(policiesFor(deep)).toEqual(["AUTO", "CLAUDE_CODE_PREFERRED", "CLAUDE_CODE_ONLY"]);
    expect(policiesFor(brand)).toContain("NO_AI");
  });
});

describe("Job Center", () => {
  beforeEach(async () => {
    const { updateSettings } = await import("@agency/core/server");
    await updateSettings({ mode: "demo" });
    fire.calls = [];
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("kører et internt job, registrerer tidslinje, resultat og agentstatus", async () => {
    const { submitJob, registerExecutor, getJob, getAgentStates } = await import("@agency/orchestrator/server");
    registerExecutor("research.brand_analysis", async (_job, ctx) => {
      await ctx.emit("step", "Hjemmeside analyseret");
      await ctx.recordCost({ searchCalls: 2 });
      await ctx.complete({ summary: "Færdig", artifacts: [] });
    });
    const job = await submitJob({ taskType: "research.brand_analysis", title: "Research: Test", subject: { brandId: "brd_x", customerName: "Test" } });
    const done = await getJob(job.id);
    expect(done.status).toBe("succeeded");
    expect(done.engine).toBe("internal");
    expect(done.agentId).toBe("agt_scout");
    expect(done.cost.searchCalls).toBe(2);
    expect(done.timeline.map((e) => e.kind)).toEqual(["created", "routed", "started", "step", "completed"]);
    expect("callback" in done).toBe(false);
    const scout = (await getAgentStates("demo")).find((s) => s.agent.key === "scout")!;
    expect(scout.status).toBe("idle");
    expect(scout.lastJob?.id).toBe(job.id);
  });

  it("dublerer ikke åbne job med samme idempotensnøgle", async () => {
    const { submitJob, registerExecutor } = await import("@agency/orchestrator/server");
    registerExecutor("research.brand_analysis", async () => {
      /* forbliver kørende */
    });
    const a = await submitJob({ taskType: "research.brand_analysis", title: "A", idempotencyKey: "brand:brd_same" });
    const b = await submitJob({ taskType: "research.brand_analysis", title: "B", idempotencyKey: "brand:brd_same" });
    expect(b.id).toBe(a.id);
  });

  it("blokerer AI-krævende opgaver i Demo Mode i stedet for at vise falske resultater", async () => {
    const { submitJob } = await import("@agency/orchestrator/server");
    const job = await submitJob({ taskType: "research.deep_research", title: "Dyb research" });
    expect(job.status).toBe("blocked");
    expect(job.error?.message).toMatch(/Demo Mode/);
  });
});

describe("Claude Code-rutine og callbacks", () => {
  beforeEach(async () => {
    const { updateSettings } = await import("@agency/core/server");
    await updateSettings({ mode: "live" });
    vi.stubEnv("CLAUDE_CODE_ROUTINE_RESEARCH_ID", "trig_01TEST");
    vi.stubEnv("CLAUDE_CODE_ROUTINE_RESEARCH_TOKEN", "sk-ant-oat01-test");
    vi.stubEnv("AGENCY_PUBLIC_URL", "https://agency.example");
    fire.calls = [];
  });
  afterEach(async () => {
    vi.unstubAllEnvs();
    const { updateSettings } = await import("@agency/core/server");
    await updateSettings({ mode: "demo" });
  });

  it("sender jobbet med engangsnøgle, accepterer kun gyldige callbacks og validerer resultatet", async () => {
    const { submitJob, handleCallback, getJob, registerResultSchema } = await import("@agency/orchestrator/server");
    registerResultSchema("research.deep_research", z.object({ findings: z.array(z.string()).min(1) }));
    fire.outcome = { ok: true, sessionId: "session_01ABC", sessionUrl: "https://claude.ai/code/session_01ABC" };
    const job = await submitJob({ taskType: "research.deep_research", title: "Dyb research", input: { brand: "Test" } });
    expect(job.status).toBe("dispatched");
    expect(job.external?.claudeCodeSessionUrl).toContain("session_01ABC");
    expect(job.cost.subscriptionRuns).toBe(1);

    const payload = JSON.parse(fire.calls[0]!.text);
    expect(payload.protocol).toBe("ai-agency.routine-job@1");
    expect(payload.callback.url).toBe(`https://agency.example/api/aos/jobs/${job.id}/callback`);
    const auth = `Bearer ${payload.callback.token}`;

    await expect(handleCallback(job.id, "Bearer forkert", { type: "progress", message: "x" })).rejects.toMatchObject({ code: "unauthorized" });
    await expect(handleCallback(job.id, null, { type: "progress", message: "x" })).rejects.toMatchObject({ code: "unauthorized" });
    expect((await handleCallback(job.id, auth, { type: "progress", kind: "tool_call", message: "WebSearch: brand" })).status).toBe("running");
    await expect(handleCallback(job.id, auth, { type: "result", status: "succeeded", summary: "ok", data: { findings: [] } })).rejects.toMatchObject({ code: "validation_error" });
    expect((await handleCallback(job.id, auth, { type: "result", status: "succeeded", summary: "Fundet 1 ting", data: { findings: ["a"] } })).status).toBe("succeeded");

    const done = await getJob(job.id);
    expect(done.result?.data).toEqual({ findings: ["a"] });
    expect(done.timeline.filter((e) => e.source === "engine").map((e) => e.kind)).toEqual(["tool_call", "completed"]);
    expect(done.timeline.some((e) => e.kind === "callback_rejected")).toBe(true);
    // Nøglen er brugt op efter resultatet.
    await expect(handleCallback(job.id, auth, { type: "progress", message: "igen" })).rejects.toMatchObject({ code: "unauthorized" });
  });

  it("kræver bekræftelse før genforsøg, når et kald kan have startet en session", async () => {
    const { submitJob, retryJob } = await import("@agency/orchestrator/server");
    fire.outcome = { ok: false, status: 500, code: "server_error", message: "Serverfejl.", ambiguous: true, retryAfterSeconds: null };
    const job = await submitJob({ taskType: "research.deep_research", title: "Dyb research" });
    expect(job.status).toBe("failed");
    expect(job.error?.message).toMatch(/kontroller i Claude Code/);
    await expect(retryJob(job.id)).rejects.toMatchObject({ code: "conflict" });
    fire.outcome = { ok: true, sessionId: "session_02", sessionUrl: "https://claude.ai/code/session_02" };
    const again = await retryJob(job.id, { confirmPossibleDuplicate: true });
    expect(again.status).toBe("dispatched");
    expect(again.attempt).toBe(2);
    expect(fire.calls).toHaveLength(2);
  });

  it("annullering lukker callback-nøglen og fortæller ærligt, at sessionen ikke stoppes", async () => {
    const { submitJob, cancelJob, handleCallback } = await import("@agency/orchestrator/server");
    fire.outcome = { ok: true, sessionId: "session_03", sessionUrl: "https://claude.ai/code/session_03" };
    const job = await submitJob({ taskType: "research.deep_research", title: "Dyb research" });
    const token = JSON.parse(fire.calls[0]!.text).callback.token;
    const cancelled = await cancelJob(job.id);
    expect(cancelled.timeline.at(-1)?.message).toMatch(/stoppes ikke automatisk/);
    await expect(handleCallback(job.id, `Bearer ${token}`, { type: "progress", message: "x" })).rejects.toMatchObject({ code: "unauthorized" });
  });
});

describe("Agent Manager og godkendelser", () => {
  it("indlæser de 8 agenter idempotent og aktiverer kun nye versioner efter godkendelse", async () => {
    const { agentRegistry, ensureAgentsSeeded, decideApproval, listApprovals } = await import("@agency/orchestrator/server");
    await Promise.all([ensureAgentsSeeded(), ensureAgentsSeeded()]);
    const agents = await agentRegistry.list();
    expect(agents.map((a) => a.name)).toEqual(["Atlas", "Scout", "Nova", "Forge", "Vega", "Link", "Echo", "Pulse"]);

    const nova = agents.find((a) => a.key === "nova")!;
    await expect(agentRegistry.proposeVersion(nova.id, { ...nova.version, allowedTools: ["rm_rf"], changeNote: "test" })).rejects.toThrow();
    const { version, approvalId } = await agentRegistry.proposeVersion(nova.id, {
      description: nova.version.description,
      specialty: nova.version.specialty,
      instructions: `${nova.version.instructions} Skriv kortere.`,
      allowedTools: nova.version.allowedTools,
      engines: nova.version.engines,
      taskTypes: nova.version.taskTypes,
      changeNote: "Kortere tekster",
    });
    expect(version.status).toBe("pending_approval");
    expect((await agentRegistry.get(nova.id))!.activeVersion).toBe(1);
    expect((await listApprovals({ status: "pending" })).some((a) => a.id === approvalId)).toBe(true);

    await decideApproval(approvalId, true, null);
    const after = (await agentRegistry.get(nova.id))!;
    expect(after.activeVersion).toBe(2);
    expect(after.version.instructions).toMatch(/Skriv kortere/);
    expect((await agentRegistry.versions(nova.id)).find((v) => v.version === 1)?.status).toBe("superseded");
    await expect(decideApproval(approvalId, false, null)).rejects.toMatchObject({ code: "conflict" });
  });

  it("en deaktiveret agent får ingen opgaver", async () => {
    const { agentRegistry, submitJob } = await import("@agency/orchestrator/server");
    await agentRegistry.setEnabled("agt_scout", false);
    const job = await submitJob({ taskType: "research.brand_analysis", title: "Research" });
    expect(job.status).toBe("blocked");
    expect(job.error?.message).toMatch(/deaktiveret/);
    await agentRegistry.setEnabled("agt_scout", true);
  });
});

describe("Hængende job", () => {
  it("et afbrudt job blokerer ikke nye forsøg med samme idempotensnøgle", async () => {
    const { updateSettings } = await import("@agency/core/server");
    await updateSettings({ mode: "demo" });
    const { submitJob, registerExecutor, getJob } = await import("@agency/orchestrator/server");
    registerExecutor("research.brand_analysis", async () => {
      /* simulerer en serverfunktion, der dør uden at melde tilbage */
    });
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      const first = await submitJob({ taskType: "research.brand_analysis", title: "A", idempotencyKey: "brand:brd_stale" });
      expect(first.status).toBe("running");
      vi.setSystemTime(Date.now() + 11 * 60_000);
      const second = await submitJob({ taskType: "research.brand_analysis", title: "B", idempotencyKey: "brand:brd_stale" });
      expect(second.id).not.toBe(first.id);
      const old = await getJob(first.id);
      expect(old.status).toBe("failed");
      expect(old.error?.code).toBe("stale");
    } finally {
      vi.useRealTimers();
    }
  });
});
