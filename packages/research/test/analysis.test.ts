import { describe, expect, it } from "vitest";
import { DEFAULT_SERVICE_CATALOG, type Company } from "@agency/core";
import { buildRecommendations, detectSignals, extractBrandName, extractCvrMentions, normalizeResearchUrl, parseHtmlPage, sanitizeClaudeAnalysis, scoreService, segmentForIndustryCode, segmentFromText } from "@agency/research/server";

const company = {
  id: "cmp_x", cvr: "00000001", name: "Test ApS", mode: "demo", address: null,
  industry: { code: "862300", text: "Tandlæger" }, companyForm: null, status: null, foundedAt: null,
  employees: { count: 8, interval: null, year: 2025 }, contact: { phone: null, email: null, website: "https://t.example/" },
  adProtected: false, registrySource: { provider: "demo", retrievedAt: new Date().toISOString(), reference: null },
  createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
} satisfies Company;

describe("branchesegmenter", () => {
  it("mapper branchekoder", () => {
    expect(segmentForIndustryCode("432200")).toBe("trades");
    expect(segmentForIndustryCode("862300")).toBe("health");
    expect(segmentForIndustryCode("479110")).toBe("ecommerce");
    expect(segmentForIndustryCode("251100")).toBe("manufacturing");
    expect(segmentForIndustryCode(null)).toBe("other");
  });
});

describe("signaldetektion", () => {
  it("skelner mellem observeret tilstedeværelse (fakta) og fravær (vurdering)", () => {
    const page = parseHtmlPage(
      '<html><head><title>T</title></head><body><a href="tel:+4512345678">Ring</a> Bestil tid på telefon. <a href="https://www.instagram.com/x">IG</a></body></html>',
      "https://t.example/",
    );
    const result = detectSignals({ company, pages: [{ sourceId: "src_a", page }], texts: [], registrySourceId: "src_r", websiteAttempted: true });
    expect(result.features.map((f) => f.key)).toEqual(expect.arrayContaining(["phone_visible", "social_links"]));
    // "Bestil tid på telefon" er ikke online booking.
    expect(result.features.some((f) => f.key === "online_booking")).toBe(false);
    const booking = result.signals.find((s) => s.key === "no_online_booking")!;
    expect(booking.classification).toBe("assessment");
    expect(result.signals.some((s) => s.key === "phone_centric_contact")).toBe(true);
  });
  it("genkender online booking og chat", () => {
    const page = parseHtmlPage('<body><a href="/online-booking">Book tid online</a><script src="https://widget.intercom.io/x.js"></script></body>', "https://t.example/");
    const result = detectSignals({ company, pages: [{ sourceId: "src_a", page }], texts: [], registrySourceId: "src_r", websiteAttempted: true });
    expect(result.features.map((f) => f.key)).toEqual(expect.arrayContaining(["online_booking", "chat_widget"]));
  });
});

describe("AI Opportunity Score", () => {
  const item = DEFAULT_SERVICE_CATALOG.find((i) => i.id === "svc_booking_automation")!;
  it("er gennemsigtig: fire vægtede kriterier, der summerer til totalen", () => {
    const score = scoreService({ item, segment: "health", matchedSignals: [] });
    expect(score.criteria.map((c) => c.key)).toEqual(["relevance", "business_value", "evidence", "implementation_ease"]);
    expect(score.criteria.reduce((s, c) => s + c.weight, 0)).toBeCloseTo(1);
    expect(score.total).toBe(Math.round(score.criteria.reduce((s, c) => s + c.value * c.weight, 0)));
  });
  it("stiger med observerede signaler og kildegrundlag", () => {
    const none = scoreService({ item, segment: "health", matchedSignals: [] });
    const some = scoreService({ item, segment: "health", matchedSignals: [{ key: "no_online_booking", label: "x", evidence: "x", sourceIds: ["a", "b"], classification: "assessment" }] });
    expect(some.total).toBeGreaterThan(none.total);
  });
  it("markerer anbefalinger uden observerede signaler som hypotese", () => {
    const recs = buildRecommendations({ brandName: "Test", industryText: "Tandlæger", segment: "health", segmentBasis: "registry", catalog: DEFAULT_SERVICE_CATALOG, signals: [], basisSourceIds: ["src_r"], limitations: [] });
    expect(recs.length).toBeGreaterThan(0);
    for (const r of recs) expect(r.findings.some((f) => f.classification === "hypothesis")).toBe(true);
  });
});

describe("validering af AI-output", () => {
  it("nedgraderer fakta uden gyldig kilde og kasserer konkurrenter uden kilde", () => {
    const claim = (text: string, sourceIds: string[]) => ({ text, classification: "fact" as const, sourceIds });
    const empty = { whatTheyDo: [], valueCreation: [], customers: [], contactChannels: [], digitalProcesses: [], productsAndServices: [], businessModel: [], strengths: [], weaknesses: [] };
    const out = sanitizeClaudeAnalysis(
      {
        summary: "Resumé",
        brandUnderstanding: { ...empty, whatTheyDo: [claim("Ok", ["src_1"]), claim("Opdigtet", ["src_fake"])] },
        opportunities: [],
        recommendationNotes: [{ catalogItemId: "svc_unknown", relevance: "x", proposedSolution: "", businessBenefit: "", uncertainties: [], customerQuestions: [] }],
        competitors: [
          { name: "Rigtig", url: "https://r.example", observedFeatures: [], comparison: "x", sourceIds: ["src_1"] },
          { name: "Opdigtet A/S", url: null, observedFeatures: [], comparison: "x", sourceIds: [] },
        ],
        digitalMaturityRationale: "",
        meetingQuestions: ["Q1"],
        overallRecommendation: "Start med X.",
      },
      {
        brandName: "Test",
        websites: [],
        legalEntity: company,
        sources: [{ id: "src_1", kind: "website", title: "t", url: null, provider: "p", retrievedAt: new Date().toISOString(), excerpt: "", isDemo: true }],
        websiteAnalysis: { pages: [], features: [], blocked: [] },
        signals: [],
        recommendations: [],
      },
    );
    expect(out.profile.activities[0].classification).toBe("fact");
    expect(out.profile.activities[1].classification).toBe("assessment");
    expect(out.profile.activities[1].sourceIds).toEqual([]);
    expect(out.downgraded).toBe(1);
    expect(out.competitors.map((c) => c.name)).toEqual(["Rigtig"]);
    expect(out.notesByCatalogId.size).toBe(0);
    expect(out.meetingQuestions).toEqual(["Q1"]);
  });
});

describe("URL, brandnavn og CVR-omtaler", () => {
  it("normaliserer brugerindtastede adresser", () => {
    expect(normalizeResearchUrl("Eksempel.DK")).toEqual({ url: "https://eksempel.dk/", domain: "eksempel.dk" });
    expect(normalizeResearchUrl("http://www.eksempel.dk/om-os/?utm=1#top")).toEqual({ url: "http://www.eksempel.dk/om-os", domain: "eksempel.dk" });
    expect(() => normalizeResearchUrl("ikke en url")).toThrow();
    expect(() => normalizeResearchUrl("localhost")).toThrow();
    expect(() => normalizeResearchUrl("ftp://eksempel.dk")).toThrow();
  });

  it("udleder brandnavn fra og:site_name eller titel", () => {
    const a = parseHtmlPage('<head><meta property="og:site_name" content="Fjordhuset Café"><title>Brunch | Fjordhuset</title></head>', "https://x.example/");
    expect(extractBrandName(a, "x.example")).toBe("Fjordhuset Café");
    const b = parseHtmlPage("<head><title>Tandlæge i Odense — Klinik Havblik</title></head>", "https://havblik.example/");
    expect(extractBrandName(b, "havblik.example")).toBe("Klinik Havblik");
  });

  it("finder kun gyldige CVR-numre (modulus 11) på siden", () => {
    const page = parseHtmlPage("<body>Novo Nordisk A/S · CVR-nr. 24 25 67 90 · Ugyldigt: CVR 12345678 · Telefon 44448888</body>", "https://x.dk/");
    expect(extractCvrMentions([{ sourceId: "s", page }]).map((m) => m.cvr)).toEqual(["24256790"]);
    const demo = parseHtmlPage("<body>CVR 00000004</body>", "https://x.example/");
    expect(extractCvrMentions([{ sourceId: "s", page: demo }])).toHaveLength(0);
    expect(extractCvrMentions([{ sourceId: "s", page: demo }], true).map((m) => m.cvr)).toEqual(["00000004"]);
  });

  it("vurderer segment ud fra hjemmesidens tekst", () => {
    expect(segmentFromText("Vi er din lokale VVS-installatør")).toBe("trades");
    expect(segmentFromText("Book tid hos tandlægen")).toBe("health");
    expect(segmentFromText("Lorem ipsum")).toBe("other");
  });
});
