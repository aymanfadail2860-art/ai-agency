import { beforeAll, describe, expect, it } from "vitest";
import { relationRegistry, updateSettings } from "@agency/core/server";
import { buildQuoteHandoff, createBrand, decideRelation, discover, getBrandOverview, getJob, getReport, startResearch, updateReport } from "@agency/research/server";

async function runToCompletion(brandId: string) {
  let job = await startResearch({ brandId });
  for (let i = 0; i < 100 && job.status !== "completed" && job.status !== "failed"; i++) {
    await new Promise((r) => setTimeout(r, 20));
    job = await getJob(job.id);
  }
  expect(job.status).toBe("completed");
  return (await getReport(job.reportId!)).report;
}

beforeAll(async () => {
  await updateSettings({ mode: "demo" });
});

describe("Scenarie A — CVR-baseret research", () => {
  it("slår CVR op, finder brand og P-nummer, gennemfører research og bygger handoff v2", async () => {
    const d = await discover({ type: "cvr", value: "00000001" });
    expect(d.legalEntities).toHaveLength(1);
    expect(d.legalEntities[0].via).toBe("user_cvr_input");
    expect(d.legalEntities[0].establishments).toHaveLength(1);
    expect(d.brandCandidates[0].name).toBe("Nordlys VVS & Energi ApS");
    const { brand } = await createBrand({ type: "cvr", name: d.brandCandidates[0].name, websiteUrl: d.brandCandidates[0].website, legalEntityId: d.legalEntities[0].company.id });
    const rel = await relationRegistry.forBrand(brand.id);
    expect(rel.map((r) => r.status)).toEqual(["confirmed"]);
    const report = await runToCompletion(brand.id);
    expect(report.schemaVersion).toBe(2);
    expect(report.researchBasis).toBe("demo");
    expect(report.recommendations.length).toBeGreaterThanOrEqual(5);
    expect(report.recommendations.length).toBeLessThanOrEqual(10);
    expect(report.websiteAnalysis!.pages.length).toBeGreaterThan(1);
    expect(report.websiteAnalysis!.features.some((f) => f.status === "not_observed")).toBe(true);
    expect(report.digitalMaturity!.level).not.toBe("unknown");
    expect(report.meetingQuestions!.length).toBeGreaterThan(3);
    expect(report.overallRecommendation).toMatch(/starte med/);
    for (const r of report.recommendations) {
      expect(r.score.criteria.map((c) => c.key)).toEqual(["relevance", "business_value", "evidence", "implementation_ease"]);
      expect(r.customerQuestions!.length).toBeGreaterThan(0);
      expect(r.proposedSolution).toBeTruthy();
    }
    const ids = new Set(report.sources.map((s) => s.id));
    for (const f of [...Object.values(report.profile).flat(), ...report.recommendations.flatMap((r) => r.findings)]) {
      for (const id of f.sourceIds) expect(ids.has(id)).toBe(true);
      if (f.classification === "fact") expect(f.sourceIds.length).toBeGreaterThan(0);
    }
    await updateReport(report.id, { recommendations: report.recommendations.slice(0, 3).map((r) => ({ id: r.id, selected: true })) });
    const handoff = await buildQuoteHandoff(report.id);
    expect(handoff.version).toBe(2);
    expect(handoff.legalEntity?.cvr).toBe("00000001");
    expect(handoff.services).toHaveLength(3);
  });
});

describe("Scenarie B — URL-baseret research", () => {
  it("finder CVR på hjemmesiden som FORSLAG og kan fortsætte uden bekræftelse", async () => {
    const d = await discover({ type: "url", value: "studiofjord.example" });
    expect(d.website?.reachable).toBe(true);
    expect(d.website?.domain).toBe("studiofjord.example");
    expect(d.cvrMentions.map((m) => m.cvr)).toEqual(["00000003"]);
    expect(d.legalEntities[0].via).toBe("website_cvr_mention");
    const { brand } = await createBrand({ type: "url", name: d.brandCandidates[0].name, websiteUrl: d.website!.url, suggestedLegalEntityIds: d.legalEntities.map((e) => e.company.id) });
    expect((await relationRegistry.forBrand(brand.id)).map((r) => r.status)).toEqual(["suggested"]);
    const report = await runToCompletion(brand.id);
    expect(report.companyId).toBeNull();
    expect(report.legalEntities!.map((l) => l.status)).toEqual(["suggested"]);
    expect(report.limitations.join(" ")).toMatch(/foreslået, men ikke bekræftet/);
    await updateReport(report.id, { recommendations: [{ id: report.recommendations[0].id, selected: true }] });
    expect((await buildQuoteHandoff(report.id)).legalEntity).toBeNull();
  });

  it("gennemfører research uden CVR, når hjemmesiden ikke nævner et", async () => {
    const d = await discover({ type: "url", value: "https://havblik.example/" });
    expect(d.cvrMentions).toHaveLength(0);
    expect(d.legalEntities).toHaveLength(0);
    const { brand } = await createBrand({ type: "url", name: d.brandCandidates[0].name, websiteUrl: d.website!.url });
    const report = await runToCompletion(brand.id);
    expect(report.recommendations.length).toBeGreaterThanOrEqual(3);
    expect(report.recommendations.some((r) => r.serviceName === "Bookingautomatisering")).toBe(true);
  });

  it("genbruger samme brand ved gentagen research af samme domæne", async () => {
    const a = await createBrand({ type: "url", name: "Klinik Havblik", websiteUrl: "https://havblik.example/" });
    const b = await createBrand({ type: "url", name: "Andet navn", websiteUrl: "https://www.havblik.example" });
    expect(b.brand.id).toBe(a.brand.id);
    expect(b.created).toBe(false);
  });
});

describe("Scenarie C — flere brands under samme CVR", () => {
  it("holder rapporter adskilt pr. brand", async () => {
    const d = await discover({ type: "cvr", value: "00000004" });
    expect(d.brandCandidates.map((c) => c.name)).toEqual(["Fjordhuset Gruppen ApS", "Fjordhuset Café", "Fjordhuset Events"]);
    expect(d.legalEntities[0].establishments).toHaveLength(2);
    const legalEntityId = d.legalEntities[0].company.id;
    const cafe = (await createBrand({ type: "cvr", name: "Fjordhuset Café", websiteUrl: d.brandCandidates[1].website, legalEntityId })).brand;
    const events = (await createBrand({ type: "cvr", name: "Fjordhuset Events", websiteUrl: d.brandCandidates[2].website, legalEntityId })).brand;
    expect(cafe.id).not.toBe(events.id);
    const r1 = await runToCompletion(cafe.id);
    const r2 = await runToCompletion(events.id);
    expect(r1.brandId).toBe(cafe.id);
    expect(r2.brandId).toBe(events.id);
    expect(r1.websiteAnalysis!.pages.every((p) => p.url.includes("fjordhuset-cafe"))).toBe(true);
    expect(r2.websiteAnalysis!.pages.every((p) => p.url.includes("fjordhuset-events"))).toBe(true);
    const o1 = await getBrandOverview(cafe.id);
    expect(o1.reports.map((r) => r.id)).toEqual([r1.id]);
  });
});

describe("Scenarie D — flere juridiske enheder", () => {
  it("vælger ikke automatisk en usikker relation", async () => {
    const d = await discover({ type: "url", value: "https://bryggeriet-nordlys.example" });
    expect(d.cvrMentions.map((m) => m.cvr).sort()).toEqual(["00000005", "00000006"]);
    expect(d.legalEntities).toHaveLength(2);
    expect(d.limitations.join(" ")).toMatch(/flere juridiske enheder/);
    const { brand } = await createBrand({ type: "url", name: d.brandCandidates[0].name, websiteUrl: d.website!.url, suggestedLegalEntityIds: d.legalEntities.map((e) => e.company.id) });
    let rels = await relationRegistry.forBrand(brand.id);
    expect(rels.every((r) => r.status === "suggested")).toBe(true);
    const drift = rels.find((r) => r.cvr === "00000006")!;
    await decideRelation(brand.id, drift.id, "confirmed");
    await decideRelation(brand.id, rels.find((r) => r.cvr === "00000005")!.id, "rejected");
    rels = await relationRegistry.forBrand(brand.id);
    expect(rels.find((r) => r.cvr === "00000006")!.status).toBe("confirmed");
    expect(rels.find((r) => r.cvr === "00000006")!.evidence.map((e) => e.method)).toContain("user_confirmed");
    // En afvist relation bliver ikke genoplivet af nye forslag.
    await createBrand({ type: "url", name: "x", websiteUrl: d.website!.url, suggestedLegalEntityIds: d.legalEntities.map((e) => e.company.id) });
    expect((await relationRegistry.forBrand(brand.id)).find((r) => r.cvr === "00000005")!.status).toBe("rejected");
    const report = await runToCompletion(brand.id);
    expect(report.companyId).toBe(drift.legalEntityId);
    expect(report.legalEntities!.map((l) => l.cvr)).toEqual(["00000006"]);
  });
});

describe("Scenarie E — manglende integration (Live Mode)", () => {
  it("afviser CVR-research uden konfigureret CVR og bruger ingen fiktive data", async () => {
    await updateSettings({ mode: "live" });
    try {
      await expect(discover({ type: "cvr", value: "10150817" })).rejects.toMatchObject({ code: "integration_not_configured" });
      await expect(discover({ type: "url", value: "https://nordlys-vvs.example" })).rejects.toMatchObject({ code: "mode_mismatch" });
    } finally {
      await updateSettings({ mode: "demo" });
    }
  });
});
