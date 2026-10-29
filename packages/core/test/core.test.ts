import { describe, expect, it } from "vitest";
import { z } from "zod";
import { CONTRACT_REGISTRY, DEFAULT_SERVICE_CATALOG, MODULES, ProductionIntakeSchema, ServiceCatalogItemSchema } from "@agency/core";
import { checkRateLimit, companyRegistry, createCollectionStore, listEvents, resetRateLimits } from "@agency/core/server";

describe("modulregister", () => {
  it("indeholder fem selvstændige moduler med egne routes; kun Research og Tilbud er aktive", () => {
    expect(MODULES.map((m) => m.key)).toEqual(["research", "quotes", "production", "crm", "dashboard"]);
    expect(MODULES.filter((m) => m.status === "active").map((m) => m.key)).toEqual(["research", "quotes"]);
    expect(new Set(MODULES.map((m) => m.route)).size).toBe(5);
    expect(MODULES.find((m) => m.key === "production")!.route).toBe("/production");
  });
  it("dokumenterer kontrakter — kun research.quote-handoff (v2 og v1) er aktiv", () => {
    expect(CONTRACT_REGISTRY.filter((c) => c.status === "active").map((c) => `${c.name}@${c.version}`)).toEqual(["research.quote-handoff@2", "research.quote-handoff@1"]);
  });
});

describe("servicekatalog", () => {
  it("er gyldigt, har unikke id'er og kun demopriser", () => {
    for (const item of DEFAULT_SERVICE_CATALOG) expect(() => ServiceCatalogItemSchema.parse(item)).not.toThrow();
    expect(new Set(DEFAULT_SERVICE_CATALOG.map((i) => i.id)).size).toBe(DEFAULT_SERVICE_CATALOG.length);
    expect(DEFAULT_SERVICE_CATALOG.every((i) => i.isDemoPrice)).toBe(true);
    expect(DEFAULT_SERVICE_CATALOG.length).toBeGreaterThanOrEqual(13);
  });
});

describe("fremtidig kontrakt quotes.production-intake@1", () => {
  it("validerer en accepteret tilbudsoverførsel", () => {
    const now = new Date().toISOString();
    const result = ProductionIntakeSchema.safeParse({
      contract: "quotes.production-intake",
      version: 1,
      intakeId: "int_1",
      sentBy: "quotes",
      acceptedAt: now,
      mode: "demo",
      company: { companyId: "cmp_1", cvr: "00000001", name: "Test" },
      quote: { quoteId: "qte_1", quoteNumber: "T-2026-0001", versionId: "qver_1", versionNumber: 1 },
      lineItems: [],
      totals: { implementationExclVat: 0, monthlyExclVat: 0, firstYearExclVat: 0 },
      specialTerms: "",
      requestedStartDate: null,
    });
    expect(result.success).toBe(false); // mindst én linje kræves
  });
});

describe("JSON-lagring", () => {
  const Item = z.object({ id: z.string(), value: z.number() });
  it("persisterer, opdaterer og serialiserer samtidige skrivninger", async () => {
    const store = createCollectionStore("platform", "test-items", Item);
    await Promise.all(Array.from({ length: 25 }, (_, i) => store.upsert({ id: `i${i}`, value: i })));
    expect(await store.list()).toHaveLength(25);
    await store.update("i3", (x) => ({ ...x, value: 99 }));
    expect((await store.get("i3"))?.value).toBe(99);
    expect(await store.remove("i3")).toBe(true);
    expect(await store.get("i3")).toBeNull();
    await expect(store.upsert({ id: "bad", value: "x" } as never)).rejects.toThrow();
  });
});

describe("fælles kundeidentitet", () => {
  it("adskiller demo og live for samme CVR og logger hændelser", async () => {
    const base = {
      cvr: "10150817", name: "X", address: null, industry: null, companyForm: null, status: null, foundedAt: null, employees: null,
      contact: { phone: null, email: null, website: null }, adProtected: false,
      registrySource: { provider: "demo" as const, retrievedAt: new Date().toISOString(), reference: null },
    };
    const demo = await companyRegistry.register({ ...base, mode: "demo" });
    const live = await companyRegistry.register({ ...base, mode: "live" });
    expect(demo.id).not.toBe(live.id);
    expect((await companyRegistry.register({ ...base, mode: "demo", name: "Y" })).id).toBe(demo.id);
    expect((await listEvents(100)).some((e) => e.type === "company.registered" && e.subject.companyId === demo.id)).toBe(true);
  });
});

describe("rate limiting", () => {
  it("afviser forespørgsler over grænsen inden for vinduet", () => {
    resetRateLimits();
    const opts = { limit: 2, windowMs: 1000 };
    expect(checkRateLimit("k", opts, 0).allowed).toBe(true);
    expect(checkRateLimit("k", opts, 10).allowed).toBe(true);
    expect(checkRateLimit("k", opts, 20).allowed).toBe(false);
    expect(checkRateLimit("k", opts, 1500).allowed).toBe(true);
  });
});

describe("delt rate limiting", () => {
  it("bruger hukommelsen lokalt og afviser over grænsen", async () => {
    const { enforceSharedRateLimit } = await import("@agency/core/server");
    resetRateLimits();
    const opts = { limit: 2, windowMs: 60_000 };
    await enforceSharedRateLimit("test:1.2.3.4", opts);
    await enforceSharedRateLimit("test:1.2.3.4", opts);
    await expect(enforceSharedRateLimit("test:1.2.3.4", opts)).rejects.toMatchObject({ code: "rate_limited" });
    await expect(enforceSharedRateLimit("test:5.6.7.8", opts)).resolves.toBeUndefined();
  });
});

describe("brand-first identitet", () => {
  it("genbruger brand pr. domæne og bekræfter aldrig relationer automatisk", async () => {
    const { brandRegistry, relationRegistry, companyRegistry, normalizeDomain } = await import("@agency/core/server");
    expect(normalizeDomain("https://WWW.Eksempel.dk/om")).toBe("eksempel.dk");
    const a = await brandRegistry.create({ name: "Eksempel", mode: "demo", websiteUrl: "https://eksempel.example/", createdVia: "url" });
    const b = await brandRegistry.create({ name: "Andet", mode: "demo", websiteUrl: "https://www.eksempel.example", createdVia: "url" });
    expect(b.brand.id).toBe(a.brand.id);
    const live = await brandRegistry.create({ name: "Eksempel", mode: "live", websiteUrl: "https://eksempel.example/", createdVia: "url" });
    expect(live.brand.id).not.toBe(a.brand.id);
    const noSite = await brandRegistry.create({ name: "Uden hjemmeside", mode: "demo", websiteUrl: null, createdVia: "cvr" });
    expect(noSite.brand.primaryDomain).toBeNull();

    const entity = await companyRegistry.register({
      cvr: "24256790", name: "Test A/S", mode: "demo", address: null, industry: null, companyForm: null, status: null, foundedAt: null, employees: null,
      contact: { phone: null, email: null, website: null }, adProtected: false, registrySource: { provider: "demo", retrievedAt: new Date().toISOString(), reference: null },
    });
    const rel = await relationRegistry.upsert(a.brand.id, entity, "suggested", { method: "website_cvr_mention", description: "Står på siden", url: null });
    expect(rel.status).toBe("suggested");
    const rejected = await relationRegistry.decide(rel.id, "rejected");
    expect(rejected.status).toBe("rejected");
    const again = await relationRegistry.upsert(a.brand.id, entity, "suggested", { method: "cvr_name_search", description: "Navnesøgning", url: null });
    expect(again.status).toBe("rejected");
    expect(again.evidence).toHaveLength(2);
  });
});

describe("omkostningsgrænser", () => {
  it("tæller forbrug pr. døgn og stopper ved budgettet", async () => {
    const { recordUsage, getDailyUsage, assertWithinBudget } = await import("@agency/core/server");
    process.env.AI_DAILY_BUDGET_USD = "0.5";
    await recordUsage("anthropic", { calls: 1, inputTokens: 1000, outputTokens: 500, estimatedCostUsd: 0.3, model: "m" });
    await expect(assertWithinBudget("anthropic")).resolves.toBeUndefined();
    await recordUsage("anthropic", { calls: 1, estimatedCostUsd: 0.25 });
    const u = await getDailyUsage("anthropic");
    expect(u.calls).toBe(2);
    expect(u.estimatedCostUsd).toBeCloseTo(0.55);
    await expect(assertWithinBudget("anthropic")).rejects.toMatchObject({ code: "rate_limited" });
    process.env.RESEARCH_DAILY_LIMIT = "1";
    await recordUsage("research_jobs", { calls: 1 });
    await expect(assertWithinBudget("research_jobs")).rejects.toMatchObject({ code: "rate_limited" });
    delete process.env.AI_DAILY_BUDGET_USD;
    delete process.env.RESEARCH_DAILY_LIMIT;
  });
});
