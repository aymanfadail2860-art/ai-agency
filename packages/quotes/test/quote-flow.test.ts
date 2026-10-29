import { describe, expect, it } from "vitest";
import { ResearchQuoteHandoffSchema, type ResearchQuoteHandoff } from "@agency/core";
import { newId, nowIso } from "@agency/shared";
import { createVersion, exportQuotePdf, generateContent, getCatalog, getQuote, intakeFromHandoff, saveDraft, updateCatalogItem } from "@agency/quotes/server";
import { calculateQuoteTotals } from "../src/pricing";

function handoff(overrides: Partial<ResearchQuoteHandoff> = {}): ResearchQuoteHandoff {
  return {
    contract: "research.quote-handoff",
    version: 1,
    handoffId: newId("handoff"),
    createdAt: nowIso(),
    mode: "demo",
    company: { companyId: "cmp_test", cvr: "00000001", name: "Testfirma ApS", address: "Testvej 1, 8000 Aarhus C" },
    researchReportId: "rrep_test",
    researchSummary: "Testresumé (DEMO).",
    services: [
      { recommendationId: "rec_1", catalogItemId: "svc_ai_receptionist", serviceName: "AI-receptionist", description: "Besvarer opkald.", rationale: "Telefonbaseret kontakt observeret.", keyFindings: ["Telefon synlig"], priority: "high", complexity: "medium", score: 90, note: null },
      { recommendationId: "rec_2", catalogItemId: "svc_booking_automation", serviceName: "Bookingautomatisering", description: "Online booking.", rationale: "Ingen booking fundet.", keyFindings: [], priority: "high", complexity: "low", score: 88, note: "Spørg til kalender" },
      { recommendationId: "rec_3", catalogItemId: "svc_ai_chatbot", serviceName: "AI-chatbot", description: "Chat.", rationale: "Ingen chat fundet.", keyFindings: [], priority: "medium", complexity: "low", score: 80, note: null },
    ],
    userNotes: "Kontakt: indehaveren",
    ...overrides,
  };
}

describe("kontrakten research.quote-handoff@1", () => {
  it("afviser overførsel uden services", () => {
    expect(ResearchQuoteHandoffSchema.safeParse(handoff({ services: [] })).success).toBe(false);
  });
  it("afviser forkert kontraktversion", () => {
    expect(ResearchQuoteHandoffSchema.safeParse({ ...handoff(), version: 2 }).success).toBe(false);
  });
  it("afviser ugyldigt rapport-id", () => {
    expect(ResearchQuoteHandoffSchema.safeParse(handoff({ researchReportId: "x" })).success).toBe(false);
  });
});

describe("tilbudsflow", () => {
  it("opretter tilbud fra overførsel med katalogpriser og uden genindtastning", async () => {
    const h = handoff();
    const result = await intakeFromHandoff(h);
    const quote = await getQuote(result.quoteId);
    expect(quote.number).toMatch(/^T-\d{4}-\d{4}$/);
    expect(quote.company.name).toBe("Testfirma ApS");
    expect(quote.researchSummary).toBe("Testresumé (DEMO).");
    expect(quote.userNotes).toBe("Kontakt: indehaveren");
    expect(quote.researchInsights[1].note).toBe("Spørg til kalender");
    const v = quote.versions[0];
    expect(v.lineItems.map((l) => l.name)).toEqual(["AI-receptionist", "Bookingautomatisering", "AI-chatbot"]);
    const catalog = await getCatalog();
    expect(v.lineItems[0].implementationPrice).toBe(catalog.find((c) => c.id === "svc_ai_receptionist")!.implementationPrice);
    expect(v.content.title).toContain("Testfirma ApS");
    // Idempotent: samme handoffId giver samme tilbud.
    expect((await intakeFromHandoff(h)).quoteId).toBe(result.quoteId);
  });

  it("gemmer udkast, opretter versioner og låser tidligere versioner", async () => {
    const { quoteId, versionId } = await intakeFromHandoff(handoff());
    let quote = await getQuote(quoteId);
    const items = quote.versions[0].lineItems.map((l, i) => (i === 0 ? { ...l, implementationPrice: 20000, monthlyPrice: 2500 } : l));
    quote = await saveDraft(quoteId, versionId, { lineItems: items, discount: { kind: "percent", value: 10, scope: "implementation", label: "Introrabat" }, specialTerms: "Opstart senest 1. marts." });
    expect(quote.versions[0].lineItems[0].implementationPrice).toBe(20000);
    expect(quote.versions[0].specialTerms).toBe("Opstart senest 1. marts.");

    quote = await createVersion(quoteId);
    expect(quote.versions).toHaveLength(2);
    expect(quote.versions[0].status).toBe("superseded");
    expect(quote.currentVersionId).toBe(quote.versions[1].id);
    expect(quote.versions[1].versionNumber).toBe(2);
    expect(quote.versions[1].lineItems[0].implementationPrice).toBe(20000);
    await expect(saveDraft(quoteId, versionId, { specialTerms: "x" })).rejects.toThrow(/aktuelle version/);
  });

  it("genererer tilbudstekst med skabelon i Demo Mode og eksporterer gyldig PDF", async () => {
    const { quoteId, versionId } = await intakeFromHandoff(handoff());
    const { engine, quote } = await generateContent(quoteId, versionId);
    expect(engine).toBe("template");
    const v = quote.versions[0];
    for (const key of ["introduction", "situation", "opportunities", "solutions", "implementationPlan", "benefits", "terms", "nextSteps"] as const) {
      expect(v.content[key].length).toBeGreaterThan(10);
    }
    expect(v.content.benefits).not.toMatch(/\d+ ?%/);
    const pdf = await exportQuotePdf(quoteId);
    expect(Buffer.from(pdf.bytes.slice(0, 5)).toString()).toBe("%PDF-");
    expect(pdf.bytes.length).toBeGreaterThan(3000);
    expect(pdf.filename).toMatch(/DEMO\.pdf$/);
    const totals = calculateQuoteTotals(v);
    expect(totals.firstYear.exclVat).toBe(totals.implementation.exclVat + 12 * totals.monthly.exclVat);
  });

  it("bruger redigerede katalogpriser ved nye tilbud", async () => {
    await updateCatalogItem("svc_ai_chatbot", { implementationPrice: 9999, monthlyPrice: 999 });
    const { quoteId } = await intakeFromHandoff(handoff());
    const quote = await getQuote(quoteId);
    const chatbot = quote.versions[0].lineItems.find((l) => l.catalogItemId === "svc_ai_chatbot")!;
    expect(chatbot.implementationPrice).toBe(9999);
    expect(chatbot.monthlyPrice).toBe(999);
  });
});

describe("tilbud V2 (brand-first, CVR valgfrit)", () => {
  const v2 = (legal: boolean) => ({
    contract: "research.quote-handoff" as const,
    version: 2 as const,
    handoffId: newId("handoff"),
    createdAt: nowIso(),
    mode: "demo" as const,
    brand: { brandId: "brd_test", name: "Fjordhuset Café", website: "https://fjordhuset-cafe.example/" },
    legalEntity: legal ? { companyId: "cmp_x", cvr: "00000004", name: "Fjordhuset Gruppen ApS", address: "Havnen 3, 8000 Aarhus C" } : null,
    researchReportId: "rrep_v2",
    researchSummary: "Cafébrand (DEMO).",
    overallRecommendation: "Start med bookingautomatisering.",
    opportunities: [{ title: "Booking", observed: "Bordbestilling via telefon.", potentialProblem: "Manuelt arbejde.", solution: "Online booking." }],
    services: [{ recommendationId: "rec_1", catalogItemId: "svc_booking_automation", serviceName: "Bookingautomatisering", description: "Online booking.", rationale: "Telefonbooking observeret.", keyFindings: [], priority: "high" as const, complexity: "low" as const, score: 90, note: null, proposedSolution: "Online booking med påmindelser.", customerQuestions: ["Hvordan bookes borde i dag?"] }],
    userNotes: "",
  });

  it("opretter tilbud til et brand uden CVR og nævner det i forbeholdene", async () => {
    const { quoteId } = await intakeFromHandoff(v2(false));
    const q = await getQuote(quoteId);
    expect(q.brand?.name).toBe("Fjordhuset Café");
    expect(q.company).toBeNull();
    expect(q.versions[0].content.assumptions).toMatch(/ikke bekræftet/);
    expect(q.versions[0].content.opportunities).toMatch(/Bordbestilling via telefon/);
    const pdf = await exportQuotePdf(quoteId);
    expect(pdf.filename).toMatch(/Fjordhuset-Caf/);
  });

  it("viser juridisk enhed, når relationen er bekræftet", async () => {
    const { quoteId } = await intakeFromHandoff(v2(true));
    const q = await getQuote(quoteId);
    expect(q.company?.cvr).toBe("00000004");
    expect(q.versions[0].content.assumptions).toMatch(/Fjordhuset Gruppen ApS/);
  });
});
