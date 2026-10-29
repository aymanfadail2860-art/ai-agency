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
  it("dokumenterer kontrakter — kun research.quote-handoff er aktiv i V1", () => {
    expect(CONTRACT_REGISTRY.filter((c) => c.status === "active").map((c) => c.name)).toEqual(["research.quote-handoff"]);
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
