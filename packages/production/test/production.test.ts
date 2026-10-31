import { beforeAll, describe, expect, it } from "vitest";
import { SERVICE_BASES, taskTemplateFor } from "@agency/production";

beforeAll(async () => {
  const { updateSettings } = await import("@agency/core/server");
  await updateSettings({ mode: "demo" });
});

async function newProject(overrides: Record<string, unknown> = {}) {
  const { createProject } = await import("@agency/production/server");
  return createProject(
    { customer: { name: "Testkunde" }, name: "AI-receptionist", serviceBaseKey: "ai_receptionist", implementationPrice: 24500, monthlyPrice: 2900, startDate: "2026-11-02", ...overrides },
    { mode: "demo", isDemo: true },
  );
}

describe("Service Factory", () => {
  it("har 8 servicebaser, og skabelonen dækker alle faser", () => {
    expect(SERVICE_BASES.map((b) => b.name)).toEqual([
      "AI-receptionist",
      "AI-chatbot",
      "CRM-system",
      "Workflow Automation",
      "AI Customer Support",
      "Lead Generation System",
      "Website / Web Application",
      "AI Content Production",
    ]);
    const phases = new Set(taskTemplateFor(SERVICE_BASES[0]!).map((t) => t.phase));
    expect(phases.size).toBe(11);
  });

  it("indlæses idempotent i lagringen", async () => {
    const { ensureServiceFactorySeeded, listServiceBases } = await import("@agency/production/server");
    await Promise.all([ensureServiceFactorySeeded(), ensureServiceFactorySeeded()]);
    expect((await listServiceBases()).length).toBe(8);
  });
});

describe("Produktionsprojekt", () => {
  it("opretter projekt med opgaver, testplan og AOS-agenter fra servicebasen", async () => {
    const { getProject } = await import("@agency/production/server");
    const project = await newProject();
    expect(project.phase).toBe("created");
    expect(project.agents.map((a) => a.agentId)).toEqual(["agt_atlas", "agt_forge", "agt_link", "agt_vega"]);
    expect(project.targetDate).toBe("2026-12-07");
    const bundle = await getProject(project.id);
    expect(bundle.tasks.length).toBeGreaterThan(15);
    expect(bundle.tasks.find((t) => t.phase === "development")?.assignee?.name).toBe("Forge");
    expect(bundle.tests).toHaveLength(10);
    // Hændelser i samme millisekund har ingen fast rækkefølge — tjek indholdet.
    expect(bundle.events.map((e) => e.kind).sort()).toEqual(["agent_assigned", "created"]);
  });

  it("afviser ukendte agenter og leveringsdato før start", async () => {
    await expect(newProject({ agents: [{ agentId: "agt_findesikke", role: "developer" }] })).rejects.toThrow(/Agent Manager/);
    await expect(newProject({ targetDate: "2026-10-01" })).rejects.toThrow(/før startdatoen/);
  });

  it("kræver udførte opgaver før næste fase og går gennem faseporte i AOS' Approval Manager", async () => {
    const { advancePhase, getProject, updateTask, recordCustomerApproval, onGateDecision } = await import("@agency/production/server");
    const { listApprovals } = await import("@agency/orchestrator/server");
    const project = await newProject();
    await expect(advancePhase(project.id)).rejects.toMatchObject({ code: "conflict" });

    // Udfør alle påkrævede opgaver fase for fase, til porten før kundegodkendelse.
    const completePhase = async () => {
      const { project: p, tasks } = await getProject(project.id);
      for (const t of tasks.filter((x) => x.phase === p.phase && x.required)) await updateTask(project.id, t.id, { status: "done" });
    };
    let result = { project, approvalId: null as string | null };
    while (!result.approvalId) {
      await completePhase();
      result = await advancePhase(project.id);
    }
    expect(result.project.phase).toBe("internal_approval");
    expect(result.project.pendingGate?.toPhase).toBe("customer_approval");
    const approval = (await listApprovals({ status: "pending" })).find((a) => a.id === result.approvalId)!;
    expect(approval.subject.ref).toMatchObject({ module: "production", entityId: project.id, action: "phase_gate" });
    await expect(advancePhase(project.id)).rejects.toThrow(/Afventer godkendelse/);

    await onGateDecision(project.id, approval.id, true, null);
    let state = await getProject(project.id);
    expect(state.project.phase).toBe("customer_approval");
    expect(state.project.pendingGate).toBeNull();

    await completePhase();
    await expect(advancePhase(project.id)).rejects.toThrow(/Kundens godkendelse/);
    await recordCustomerApproval(project.id, { approvedBy: "Restaurantchef (test)" });
    const deploy = await advancePhase(project.id);
    expect(deploy.project.pendingGate?.toPhase).toBe("deployment");
    await onGateDecision(project.id, deploy.approvalId!, false, "Ikke endnu");
    state = await getProject(project.id);
    expect(state.project.phase).toBe("customer_approval");
    expect(state.events[0]?.message).toContain("Afvist i AOS");
  });

  it("sender en opgave til AOS' Job Center — samme job ses i begge moduler, og routeren blokerer ærligt", async () => {
    const { getProject, sendTaskToJobCenter, jobsForProject } = await import("@agency/production/server");
    const project = await newProject();
    const task = (await getProject(project.id)).tasks.find((t) => t.phase === "development")!;
    const { task: updated, job } = await sendTaskToJobCenter(project.id, task.id);
    expect(job.status).toBe("blocked");
    expect(job.agentId).toBe("agt_forge");
    expect(job.subject.projectId).toBe(project.id);
    expect(updated.aiJobId).toBe(job.id);
    expect((await jobsForProject(project)).map((j) => j.id)).toEqual([job.id]);
    // Idempotent: samme opgave giver samme åbne job.
    expect((await sendTaskToJobCenter(project.id, task.id)).job.id).toBe(job.id);
  });

  it("opretter projekt fra accepteret tilbud via kontrakten — idempotent pr. intakeId", async () => {
    const { createFromIntake } = await import("@agency/production/server");
    const intake = {
      contract: "quotes.production-intake",
      version: 2,
      intakeId: "pin_test_1",
      sentBy: "quotes",
      acceptedAt: new Date().toISOString(),
      mode: "demo",
      customer: { brandId: null, legalEntity: null, name: "Café Test" },
      quote: { quoteId: "qte_test", quoteNumber: "T-2026-0099", versionId: "qver_test", versionNumber: 1 },
      lineItems: [
        {
          id: "qli_1",
          kind: "service",
          catalogItemId: "svc_ai_chatbot",
          sourceRecommendationId: null,
          name: "AI-chatbot",
          description: "Chat på hjemmesiden",
          deliverables: ["Chatwidget", "Vidensbase"],
          implementationPrice: 14500,
          monthlyPrice: 1490,
          quantity: 1,
          addOns: [],
          estimatedWeeks: { min: 2, max: 4 },
          rationale: null,
        },
      ],
      totals: { implementationExclVat: 14500, monthlyExclVat: 1490, firstYearExclVat: 32380 },
      specialTerms: "",
      requestedStartDate: null,
    };
    const a = await createFromIntake(intake);
    expect(a.created).toBe(true);
    expect(a.project.serviceBaseKey).toBe("ai_chatbot");
    expect(a.project.deliverables.map((d) => d.name)).toEqual(["Chatwidget", "Vidensbase"]);
    expect(a.project.source).toMatchObject({ kind: "quote", quoteNumber: "T-2026-0099" });
    const b = await createFromIntake(intake);
    expect(b.created).toBe(false);
    expect(b.project.id).toBe(a.project.id);
    await expect(createFromIntake({ ...intake, version: 3 })).rejects.toThrow();
  });
});

describe("Demo-simulering", () => {
  it("markerer alt simuleret arbejde, opretter rigtige demogodkendelser ved faseporte og kræver demoprojekt", async () => {
    const { simulateStep, getProject, createProject, onGateDecision } = await import("@agency/production/server");
    const project = await newProject();
    let step = await simulateStep(project.id);
    expect(step.project.phase).toBe("requirements");
    while (!step.approvalId) step = await simulateStep(project.id);
    expect(step.project.phase).toBe("internal_approval");
    const bundle = await getProject(project.id);
    expect(bundle.events.filter((e) => e.kind === "simulation").every((e) => e.simulated)).toBe(true);
    expect(bundle.tests.every((t) => t.status === "passed" && t.simulated)).toBe(true);
    expect(bundle.files.every((f) => f.simulated)).toBe(true);
    await expect(simulateStep(project.id)).rejects.toThrow(/Afventer godkendelse/);
    await onGateDecision(project.id, step.approvalId, true, null);
    step = await simulateStep(project.id);
    expect(step.project.customerApproval?.approvedBy).toContain("fiktiv");

    const real = await createProject({ customer: { name: "Rigtig kunde" }, name: "Projekt", serviceBaseKey: "ai_chatbot", implementationPrice: 1, monthlyPrice: 1 }, { mode: "demo" });
    await expect(simulateStep(real.id)).rejects.toThrow(/kun tilgængelig for demoprojekter/);
  });

  it("baggrundsporteføljen dækker planlægning, udvikling, test, godkendelse, forsinkelse og drift", async () => {
    const { seedDemoPortfolio, getDashboard } = await import("@agency/production/server");
    const seeded = await seedDemoPortfolio();
    expect(seeded.map((p) => p.phase)).toEqual(["development", "qa", "customer_approval", "maintenance"]);
    const dashboard = await getDashboard("demo");
    expect(dashboard.counts.development).toBeGreaterThan(0);
    expect(dashboard.counts.testing).toBeGreaterThan(0);
    expect(dashboard.counts.approval).toBeGreaterThan(0);
    expect(dashboard.counts.delivered).toBeGreaterThan(0);
    expect(dashboard.counts.overdue).toBeGreaterThan(0);
    expect(dashboard.agents.map((a) => a.name)).toContain("Forge");
  });
});
