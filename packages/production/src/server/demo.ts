import { brandRegistry } from "@agency/core/server";
import { agentRegistry } from "@agency/orchestrator/server";
import { AppError, newId, nowIso } from "@agency/shared";
import { PHASE_KEYS, phaseIndex, phaseLabel, type Phase, type ProductionProject } from "../contracts";
import { addDays, addFile, advancePhase, blockersFor, createProject, logEvent, recordCustomerApproval, recordTest, type Actor } from "./service";
import { projectStore, taskStore, testStore } from "./store";

/**
 * DEMO-SIMULERING (kun demoprojekter i Demo Mode)
 * ----------------------------------------------
 * Viser, hvordan et projekt bevæger sig gennem faserne. Alt, der udføres her,
 * markeres `simulated: true` og vises som "Demo-simulering" — det er IKKE
 * arbejde udført af en AI-agent. Ingen AI-kald, ingen eksterne ændringer.
 * Faseporte oprettes som rigtige (demo-)godkendelser i AOS, som brugeren selv
 * afgør; kun baggrundsporteføljen springer porte over (tydeligt logget).
 */

const DEMO_NOTE = "Demo-simulering";

function requireDemo(project: ProductionProject) {
  if (!project.isDemo || project.mode !== "demo") throw new AppError("conflict", "Simulering er kun tilgængelig for demoprojekter i Demo Mode.");
}

const agentActor = (id: string, name: string): Actor => ({ kind: "agent", id, name: `${name} (${DEMO_NOTE.toLowerCase()})` });

async function simulatePhaseWork(project: ProductionProject): Promise<string[]> {
  const actions: string[] = [];
  const names = new Map((await agentRegistry.list()).map((a) => [a.id, a.name]));
  const lead = project.agents.find((a) => a.role === "project_lead");
  const leadActor: Actor = lead ? agentActor(lead.agentId, names.get(lead.agentId) ?? "Atlas") : { kind: "system", id: null, name: DEMO_NOTE };
  const actorFor = (agentId: string | undefined) => (agentId ? agentActor(agentId, names.get(agentId) ?? agentId) : leadActor);
  const byRole = (role: string) => project.agents.find((a) => a.role === role)?.agentId;

  const open = (await taskStore.list()).filter((t) => t.projectId === project.id && t.phase === project.phase && t.status !== "done");
  for (const task of open) {
    await taskStore.update(task.id, (t) => ({ ...t, status: "done", simulated: true, completedAt: nowIso(), updatedAt: nowIso() }));
    await logEvent(project.id, "simulation", `${DEMO_NOTE}: "${task.title}" markeret som udført${task.assignee ? ` for ${task.assignee.name}` : ""}.`, actorFor(task.assignee?.id), true);
  }
  if (open.length) actions.push(`${open.length} opgave(r) i ${phaseLabel(project.phase)} markeret som udført (simuleret).`);

  const file = async (kind: "document" | "code" | "report" | "deliverable", title: string, description: string, agentId: string | undefined, ref: string | null = null) => {
    await addFile(project.id, { kind, title, description, url: null, ref, phase: project.phase }, actorFor(agentId), true);
    actions.push(`Eksempelleverance: ${title}.`);
  };
  const slug = project.name.toLowerCase().replace(/[^a-z0-9æøå]+/g, "-").replace(/^-|-$/g, "");

  switch (project.phase) {
    case "requirements":
      await file("document", "Kravspecifikation v1 (eksempel)", "Behov, succeskriterier og acceptkriterier fra kravworkshoppen.", byRole("project_lead"));
      break;
    case "architecture":
      await file("document", "Teknisk arkitektur (eksempel)", "Komponenter, dataflows, integrationer og risici.", byRole("developer"));
      await file("document", "Testplan (eksempel)", "Testcases afledt af acceptkriterierne.", byRole("qa"));
      break;
    case "development":
      await file("code", "Kodereference: tilpasning af grundbasen", "Eksempelreference — der er ikke skrevet kode.", byRole("developer"), `planlagt repository · gren claude/${slug}`);
      await projectStore.update(project.id, (p) => ({ ...p, deliverables: p.deliverables.map((d) => (d.status === "planned" ? { ...d, status: "in_review" } : d)), updatedAt: nowIso() }));
      actions.push("Leverancer sat til review (simuleret).");
      break;
    case "integrations":
      await projectStore.update(project.id, (p) => ({ ...p, architecture: { ...p.architecture, integrations: p.architecture.integrations.map((i) => ({ ...i, status: "simulated" as const })) }, updatedAt: nowIso() }));
      await file("report", "Integrationsrapport (eksempel)", "Integrationerne er simuleret — ingen rigtige forbindelser er oprettet.", byRole("integration"));
      break;
    case "qa": {
      const tests = (await testStore.list()).filter((t) => t.projectId === project.id && t.status !== "passed");
      const qaActor = actorFor(byRole("qa"));
      for (const [i, t] of tests.entries()) {
        const firstFailed = i === Math.min(3, tests.length - 1);
        await recordTest(
          project.id,
          t.id,
          firstFailed
            ? { status: "passed", resultNote: `${DEMO_NOTE}: fejlede i første kørsel og bestod efter rettelse.`, defect: { title: `Fejl fundet i "${t.area}"`, severity: "medium", resolved: true } }
            : { status: "passed", resultNote: `${DEMO_NOTE}: bestået.` },
          qaActor,
          true,
        );
      }
      if (tests.length) actions.push(`${tests.length} testcases registreret som bestået (simuleret, én med rettet fejl).`);
      await file("report", "Testrapport (eksempel)", "Samlet resultat af testplanen.", byRole("qa"));
      break;
    }
    case "internal_approval":
      await projectStore.update(project.id, (p) => ({ ...p, deliverables: p.deliverables.map((d) => ({ ...d, status: "approved" as const })), updatedAt: nowIso() }));
      actions.push("Leverancer godkendt internt (simuleret).");
      break;
    case "customer_approval":
      if (!project.customerApproval) {
        await recordCustomerApproval(project.id, { approvedBy: `Kontaktperson hos ${project.customer.name} (fiktiv)`, note: `${DEMO_NOTE}: godkendt efter demo.` }, leadActor, true);
        actions.push("Kundens godkendelse registreret (fiktiv kontaktperson).");
      }
      break;
    case "deployment":
      await file("document", "Driftsdokumentation (eksempel)", "Demo: der er ikke foretaget nogen rigtig deployment.", byRole("developer"));
      break;
    case "delivered":
      await file("deliverable", "Overleveringsdokument (eksempel)", "Brugervejledning, adgange og overleveringsnoter.", byRole("project_lead"));
      break;
    default:
      break;
  }
  return actions;
}

export interface SimulationResult {
  project: ProductionProject;
  actions: string[];
  approvalId: string | null;
}

/**
 * Ét trin i den guidede demo: fasens arbejde simuleres, og projektet går videre.
 * Ved en faseport oprettes en rigtig (demo-)godkendelse i AOS, som brugeren afgør.
 */
export async function simulateStep(projectId: string): Promise<SimulationResult> {
  const project = await projectStore.get(projectId);
  if (!project) throw new AppError("not_found", "Projektet blev ikke fundet.");
  requireDemo(project);
  if (project.pendingGate) throw new AppError("conflict", "Afventer godkendelse i AOS — godkend eller afvis først.");
  if (project.phase === "maintenance") throw new AppError("conflict", "Demoforløbet er gennemført. Projektet er i vedligeholdelse.");
  const actions = await simulatePhaseWork(project);
  const blockers = blockersFor((await projectStore.get(projectId))!, await taskStore.list());
  if (blockers.length) return { project: (await projectStore.get(projectId))!, actions: [...actions, ...blockers], approvalId: null };
  const { project: updated, approvalId } = await advancePhase(projectId, { kind: "system", id: null, name: DEMO_NOTE }, { simulated: true });
  actions.push(approvalId ? `Faseport: godkendelse oprettet i AOS (${phaseLabel(updated.pendingGate!.toPhase)}).` : `Fase: ${phaseLabel(updated.phase)}.`);
  return { project: updated, actions, approvalId };
}

/** Kun for baggrundsporteføljen: spoler frem til en fase. Porte springes over og logges som simuleret. */
async function fastForward(projectId: string, target: Phase): Promise<void> {
  for (let guard = 0; guard < PHASE_KEYS.length; guard++) {
    const project = (await projectStore.get(projectId))!;
    if (phaseIndex(project.phase) >= phaseIndex(target)) return;
    await simulatePhaseWork(project);
    const next = PHASE_KEYS[phaseIndex(project.phase) + 1]!;
    const now = nowIso();
    await projectStore.update(projectId, (p) => ({
      ...p,
      phase: next,
      status: next === "delivered" ? "delivered" : next === "maintenance" ? "maintenance" : p.status,
      phaseHistory: [...p.phaseHistory.map((h) => (h.completedAt === null ? { ...h, completedAt: now } : h)), { phase: next, enteredAt: now, completedAt: null }],
      deliverables: next === "delivered" ? p.deliverables.map((d) => ({ ...d, status: "delivered" as const })) : p.deliverables,
      updatedAt: now,
    }));
    await logEvent(projectId, "phase_changed", `${DEMO_NOTE}: ${phaseLabel(project.phase)} → ${phaseLabel(next)}${["customer_approval", "deployment"].includes(next) ? " (faseport simuleret — ingen godkendelse registreret i AOS)" : ""}.`, { kind: "system", id: null, name: DEMO_NOTE }, true);
  }
}

const PORTFOLIO: Array<{ brand: string; domain: string; base: string; name: string; target: Phase; startOffset: number; duration: number; priority: "normal" | "high" | "low"; price: [number, number] }> = [
  { brand: "Klinik Havblik ApS", domain: "https://havblik.example", base: "ai_chatbot", name: "AI-chatbot til patienthenvendelser", target: "development", startOffset: -10, duration: 40, priority: "normal", price: [14500, 1490] },
  { brand: "Studio Fjord", domain: "https://studiofjord.example", base: "workflow_automation", name: "Automatisering af ordrehåndtering", target: "qa", startOffset: -22, duration: 38, priority: "high", price: [22500, 1800] },
  // Bevidst forsinket: leveringsdatoen er passeret, mens projektet afventer kundens godkendelse.
  { brand: "Fjordhuset Events", domain: "https://fjordhuset-events.example", base: "crm_system", name: "CRM til eventforespørgsler", target: "customer_approval", startOffset: -45, duration: 40, priority: "high", price: [34500, 2400] },
  { brand: "Nordlys VVS & Energi ApS", domain: "https://nordlys-vvs.example", base: "lead_generation", name: "Leadsystem til servicebesøg", target: "maintenance", startOffset: -90, duration: 45, priority: "low", price: [19500, 1900] },
];

/** Baggrundsportefølje til dashboardet (fiktive demokunder; genbruger eksisterende demo-brands pr. domæne). */
export async function seedDemoPortfolio(): Promise<ProductionProject[]> {
  const out: ProductionProject[] = [];
  const today = new Date().toISOString().slice(0, 10);
  for (const item of PORTFOLIO) {
    const { brand } = await brandRegistry.create({ name: item.brand, mode: "demo", websiteUrl: item.domain, createdVia: "demo" });
    const start = addDays(today, item.startOffset);
    const project = await createProject(
      {
        customer: { brandId: brand.id, name: brand.name },
        name: item.name,
        serviceBaseKey: item.base,
        implementationPrice: item.price[0],
        monthlyPrice: item.price[1],
        startDate: start,
        targetDate: addDays(start, item.duration),
        priority: item.priority,
        notes: "Demoprojekt med fiktive eksempeldata.",
      },
      { mode: "demo", isDemo: true, source: { kind: "demo", quoteId: null, quoteNumber: null, quoteVersionId: null, intakeId: null }, actor: { kind: "system", id: null, name: DEMO_NOTE } },
    );
    await fastForward(project.id, item.target);
    out.push((await projectStore.get(project.id))!);
  }
  return out;
}

/** Restaurant Nord: berig projektet (oprettet fra det accepterede demotilbud) med demoforløbets eksempeldata. */
export async function applyRestaurantNordScenario(projectId: string): Promise<ProductionProject> {
  const now = nowIso();
  const deliverables = [
    ["AI-telefonreceptionist", "Besvarer restaurantens telefon 24/7 med restaurantens stemme og tone."],
    ["Besvarelse af almindelige kundehenvendelser", "Åbningstider, menu, allergener, selskaber og parkering ud fra vidensbasen."],
    ["Bookingintegration", "Opslag af ledige borde og oprettelse af reservationer i bookingsystemet."],
    ["Overførsel til medarbejder", "Viderestilling ved klager, større selskaber og spørgsmål uden svar."],
    ["Samtalelogning", "Transskription, resumé og udfald for hvert opkald."],
    ["Administrationspanel", "Indstillinger, vidensbase, samtalelog og statistik for restauranten."],
  ];
  const updated = await projectStore.update(projectId, (p) => ({
    ...p,
    isDemo: true,
    name: "AI-receptionist til Restaurant Nord",
    priority: "high",
    description:
      "Restaurant Nord mister bookinger, når personalet ikke kan nå telefonen i travle perioder. AI-receptionisten besvarer alle opkald, svarer på de hyppigste spørgsmål, booker borde direkte i bookingsystemet og stiller videre til en medarbejder, når det er nødvendigt.",
    deliverables: deliverables.map(([name, description]) => ({ id: newId("deliverable"), name: name!, description: description!, status: "planned", phase: "development" })),
    notes: "DEMOPROJEKT med fiktive eksempeldata. Kunden, aftalen og alle resultater er fiktive. Gennemgå forløbet med \"Guidet demo\".",
    updatedAt: now,
  }));
  await logEvent(projectId, "note", "Demoscenarie indlæst: Restaurant Nord (fiktiv kunde).", { kind: "system", id: null, name: DEMO_NOTE }, true);
  return updated!;
}
