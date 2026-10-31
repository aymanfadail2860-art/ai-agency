import { brandRegistry, getSettings } from "@agency/core/server";
import { decideApproval, listApprovals, registerApprovalHandler } from "@agency/orchestrator/server";
import {
  applyRestaurantNordScenario,
  createFromIntake,
  deleteDemoProject,
  findProjectByQuote,
  listDemoProjects,
  onGateDecision,
  seedDemoPortfolio,
} from "@agency/production/server";
import type { ProductionProject } from "@agency/production";
import { acceptQuote, buildProductionIntake, getQuote, intakeFromHandoff } from "@agency/quotes/server";
import { AppError } from "@agency/shared";

/**
 * KOMPOSITION: Tilbud → Produktion, og Produktion ↔ AOS
 * ----------------------------------------------------
 * Tilbud og Produktion kender ikke hinanden: overførslen sker via kontrakten
 * `quotes.production-intake@2`. Faseporte afgøres i AOS' Approval Manager.
 */
let wired = false;

export function ensureProductionWiring(): void {
  if (wired) return;
  wired = true;
  registerApprovalHandler("production", "phase_gate", async (ref, approval, approved, note) => {
    await onGateDecision(ref.entityId, approval.id, approved, note);
  });
}

/** Kunden har accepteret: tilbuddet markeres accepteret, og kontrakten sendes til Produktion. Idempotent. */
export async function acceptQuoteAndCreateProject(quoteId: string): Promise<{ project: ProductionProject; created: boolean }> {
  ensureProductionWiring();
  const quote = await acceptQuote(quoteId);
  return createFromIntake(buildProductionIntake(quote));
}

const RN_HANDOFF_ID = "hnd_demo_restaurant_nord";

/** Restaurant Nord: demokunde → (fiktivt) accepteret tilbud → intake → produktionsprojekt. */
async function seedRestaurantNord(): Promise<ProductionProject> {
  const { brand } = await brandRegistry.create({ name: "Restaurant Nord", mode: "demo", websiteUrl: "https://restaurant-nord.example", createdVia: "demo" });
  const { quoteId } = await intakeFromHandoff({
    contract: "research.quote-handoff",
    version: 2,
    handoffId: RN_HANDOFF_ID,
    createdAt: new Date().toISOString(),
    mode: "demo",
    brand: { brandId: brand.id, name: brand.name, website: "https://restaurant-nord.example" },
    legalEntity: null,
    researchReportId: "rrep_demo_restaurant_nord",
    researchSummary: "Demo: Restaurant Nord er en fiktiv restaurant med 80 kuverter, hvor telefonen ofte ikke bliver besvaret i travle perioder.",
    overallRecommendation: "Demo: Start med en AI-receptionist med bookingintegration.",
    opportunities: [{ title: "Ubesvarede opkald", observed: "Fiktivt eksempel: mange opkald i travle perioder.", potentialProblem: "Tabte bookinger.", solution: "AI-receptionist med booking." }],
    services: [
      {
        recommendationId: "rec_demo_rn_1",
        catalogItemId: "svc_ai_receptionist",
        serviceName: "AI-receptionist",
        description: "Telefonreceptionist med booking, svar på almindelige spørgsmål og viderestilling.",
        rationale: "Demo: fiktivt eksempel.",
        keyFindings: [],
        priority: "high",
        complexity: "medium",
        score: 88,
        note: null,
        proposedSolution: "AI-receptionist med bookingintegration og viderestilling.",
        customerQuestions: [],
      },
    ],
    userNotes: "DEMO — fiktiv kunde og aftale.",
  });
  const quote = await acceptQuote(quoteId);
  const { project } = await createFromIntake(buildProductionIntake(quote));
  return applyRestaurantNordScenario(project.id);
}

async function requireDemoMode() {
  if ((await getSettings()).mode !== "demo") throw new AppError("mode_mismatch", "Demoporteføljen kan kun indlæses i Demo Mode.");
}

/** Indlæser demoporteføljen (Restaurant Nord + fire baggrundsprojekter), hvis den ikke findes. */
export async function seedProductionDemo(): Promise<{ projects: ProductionProject[]; restaurantNordId: string; created: boolean }> {
  ensureProductionWiring();
  await requireDemoMode();
  const existing = await listDemoProjects();
  const rn = existing.find((p) => p.source.kind === "quote" && p.customer.name === "Restaurant Nord");
  if (existing.length && rn) return { projects: existing, restaurantNordId: rn.id, created: false };
  const portfolio = existing.length ? existing : await seedDemoPortfolio();
  const restaurantNord = rn ?? (await seedRestaurantNord());
  return { projects: [...portfolio, restaurantNord], restaurantNordId: restaurantNord.id, created: true };
}

/** Nulstiller demoen: åbne demogodkendelser afvises, demoprojekter slettes, og porteføljen indlæses igen. */
export async function resetProductionDemo() {
  ensureProductionWiring();
  await requireDemoMode();
  const demo = await listDemoProjects();
  const ids = new Set(demo.map((p) => p.id));
  for (const approval of await listApprovals({ status: "pending", mode: "demo" })) {
    if (approval.subject.ref?.module === "production" && ids.has(approval.subject.ref.entityId)) await decideApproval(approval.id, false, "Demo nulstillet");
  }
  for (const p of demo) await deleteDemoProject(p.id);
  return seedProductionDemo();
}

export async function productionProjectForQuote(quoteId: string): Promise<ProductionProject | null> {
  await getQuote(quoteId);
  return findProjectByQuote(quoteId);
}
