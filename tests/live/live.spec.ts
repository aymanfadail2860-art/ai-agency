import { writeFileSync } from "node:fs";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

/**
 * LIVE-TEST (V2) af en deployet platform.
 *  - Demo-flows bruger kun fiktive data.
 *  - Hvis LIVE_RESEARCH_URL er sat, gennemføres også en reel URL-research i Live Mode
 *    (kun offentligt tilgængelige sider). Platformen sættes tilbage til Demo Mode bagefter.
 * Resultater og skærmbilleder skrives til LIVE_OUT (standard: ./live-results).
 */
const OUT = process.env.LIVE_OUT ?? "live-results";
const results: Record<string, unknown> = {};
const shot = (page: Page, name: string) => page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false });
const dkk = (n: number) => new Intl.NumberFormat("da-DK", { style: "currency", currency: "DKK", minimumFractionDigits: 2 }).format(n).replace(/ /g, " ");
const sum = (page: Page, id: string) => page.getByTestId(id).evaluateAll((els) => els.reduce((s, e) => s + ((e as HTMLInputElement).disabled ? 0 : Number((e as HTMLInputElement).value)), 0));

test.afterAll(() => writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 2)));

async function setMode(request: APIRequestContext, mode: "demo" | "live") {
  const res = await request.put("/api/settings", { data: { mode } });
  expect(res.ok()).toBe(true);
}

test("API: lagring, integrationer, validering og sikkerhed", async ({ request }) => {
  await setMode(request, "demo");
  const html = await (await request.get("/settings")).text();
  results.storageBackend = html.includes("Supabase (database)") ? "supabase" : html.includes("lokale JSON-filer") ? "file" : "ukendt";
  expect(results.storageBackend).toBe(process.env.LIVE_EXPECT_STORAGE ?? "supabase");
  const status = await (await request.get("/api/integrations/status")).json();
  results.integrations = Object.fromEntries(status.integrations.map((i: { key: string; configured: boolean }) => [i.key, i.configured]));
  expect(JSON.stringify(status)).not.toMatch(/sb_secret_|sb_publishable_|eyJhbGci|sk-ant-/);
  expect((await request.post("/api/research/discover", { data: { type: "url", value: "ikke en url" } })).status()).toBe(400);
  expect((await request.post("/api/research/discover", { data: { type: "url", value: "http://169.254.169.254/" } })).status()).toBe(409);
  expect((await request.post("/api/quotes/intake", { data: { contract: "research.quote-handoff", version: 2, services: [] } })).status()).toBe(400);
  for (const p of ["/api/production/intake", "/api/crm/activities", "/api/dashboard/metrics"]) expect((await request.post(p, { data: {} })).status()).toBe(501);
  expect((await request.put("/api/settings", { data: { mode: "live" }, headers: { origin: "https://evil.example" } })).status()).toBe(403);
  results.apiChecks = "ok";
});

test("Demo: CVR → brand → research → tilbud → PDF → versioner → persistens", async ({ page }) => {
  await page.goto("/research");
  await expect(page.getByTestId("entry-url")).toBeVisible();
  await page.getByTestId("demo-example-00000001").click();
  await expect(page.getByTestId("discovery-result")).toContainText("P-nr. 0000000101");
  await shot(page, "01-discovery-cvr");
  await page.getByTestId("create-brand").click();
  await page.waitForURL(/\/research\/brands\/brd_/);
  const t0 = Date.now();
  await page.getByTestId("start-research").click();
  await page.waitForURL(/\/research\/reports\/rrep_/, { timeout: 90_000 });
  results.demoResearchSeconds = Math.round((Date.now() - t0) / 100) / 10;
  await expect(page.getByTestId("overall-recommendation")).toBeVisible();
  await shot(page, "02-rapport-overblik");
  await page.getByRole("tab", { name: /Website-analyse/ }).click();
  await expect(page.getByTestId("feature-contact_form")).toContainText("Observeret");
  await page.getByRole("tab", { name: /Serviceanbefalinger/ }).click();
  const recs = page.getByTestId("recommendation");
  results.demoRecommendations = await recs.count();
  for (let i = 0; i < 4; i++) await recs.nth(i).locator('input[type="checkbox"]').check();
  await recs.nth(3).locator('input[type="checkbox"]').uncheck();
  await recs.nth(0).getByRole("button", { name: /Fordele, forudsætninger/ }).click();
  await recs.nth(0).getByLabel("Beskrivelse til tilbuddet").fill("LIVE-TEST: redigeret beskrivelse (fiktiv).");
  await page.getByLabel("Noter til rapporten").fill("LIVE-TEST: noter i Supabase.");
  await page.getByTestId("save-report").click();
  await expect(page.getByText("Gemt", { exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole("tab", { name: /Serviceanbefalinger/ }).click();
  await expect(page.getByTestId("selected-count")).toHaveText("3");
  await expect(page.getByLabel("Noter til rapporten")).toHaveValue("LIVE-TEST: noter i Supabase.");
  results.researchPersistence = "ok";

  await page.getByTestId("create-quote").click();
  await page.waitForURL(/\/quotes\/qte_/, { timeout: 60_000 });
  results.quoteUrl = page.url();
  await page.getByTestId("impl-price").nth(0).fill("18000");
  await page.getByTestId("monthly-price").nth(0).fill("1500");
  await page.getByTestId("add-one-time").click();
  await page.getByTestId("impl-price").last().fill("3500");
  await page.getByLabel("Rabattype").selectOption("percent");
  await page.getByLabel("Værdi").fill("10");
  await page.getByLabel("Gælder for").selectOption("implementation");
  await page.getByLabel("Særlige vilkår").fill("LIVE-TEST: Opstart senest 1. februar.");
  const impl = await sum(page, "impl-price");
  const monthly = await sum(page, "monthly-price");
  const implNet = Math.round(impl * 0.9 * 100) / 100;
  await expect(page.getByTestId("preview-impl-excl")).toHaveText(dkk(implNet));
  await expect(page.getByTestId("preview-first-year-excl")).toHaveText(`${dkk(implNet + 12 * monthly)} ekskl. moms`);
  results.calculations = { implementationGross: impl, implementationAfterDiscount: implNet, monthly, firstYearExclVat: implNet + 12 * monthly };
  await page.getByTestId("generate-content").click();
  await expect(page.getByTestId("quote-preview")).toContainText("Forudsætninger og forbehold");
  await page.getByTestId("save-draft").click();
  await expect(page.getByText("Udkastet er gemt.")).toBeVisible();
  await shot(page, "03-tilbud");
  const dl = page.waitForEvent("download");
  await page.getByTestId("export-pdf").click();
  const download = await dl;
  await download.saveAs(`${OUT}/tilbud.pdf`);
  results.pdf = download.suggestedFilename();
  await page.getByTestId("new-version").click();
  await expect(page.getByText(/Version 2 er oprettet/)).toBeVisible();
  await page.goto(results.quoteUrl as string);
  await expect(page.getByTestId("version-select").locator("option")).toHaveCount(2);
  await expect(page.getByTestId("impl-price").nth(0)).toHaveValue("18000");
  await expect(page.getByLabel("Særlige vilkår")).toHaveValue("LIVE-TEST: Opstart senest 1. februar.");
  results.quotePersistence = "ok";
});

test("Demo: flere brands under samme CVR og flere juridiske enheder", async ({ page }) => {
  await page.goto("/research");
  await page.getByTestId("demo-example-00000004").click();
  await expect(page.getByTestId("brand-candidate-2")).toContainText("Fjordhuset Events");
  await page.getByTestId("brand-candidate-2").click();
  await page.getByTestId("create-brand").click();
  await page.waitForURL(/\/research\/brands\/brd_/);
  await expect(page.getByRole("heading", { level: 1, name: "Fjordhuset Events" })).toBeVisible();

  await page.goto("/research");
  await page.getByTestId("demo-example-httpsbryggerietnordlysexample").click();
  await expect(page.getByTestId("discovered-legal-entity")).toHaveCount(2);
  await page.getByTestId("create-brand").click();
  await page.waitForURL(/\/research\/brands\/brd_/);
  await expect(page.locator('[data-testid="relation"][data-status="confirmed"]')).toHaveCount(0);
  results.multipleLegalEntitiesNotAutoConfirmed = true;
  await shot(page, "04-flere-juridiske-enheder");
});

test("Live Mode: reel URL-research (kun når LIVE_RESEARCH_URL er sat)", async ({ page, request }) => {
  const target = process.env.LIVE_RESEARCH_URL;
  test.skip(!target, "LIVE_RESEARCH_URL ikke sat");
  await setMode(request, "live");
  try {
    const t0 = Date.now();
    const d = await (await request.post("/api/research/discover", { data: { type: "url", value: target } })).json();
    results.liveDiscovery = { website: d.website, cvrMentions: d.cvrMentions, legalEntities: d.legalEntities?.length ?? 0, limitations: d.limitations, error: d.error };
    expect(d.website).toBeTruthy();
    const created = await (await request.post("/api/research/brands", { data: { type: "url", name: d.brandCandidates[0].name, websiteUrl: d.website.url, suggestedLegalEntityIds: (d.legalEntities ?? []).map((e: { company: { id: string } }) => e.company.id) } })).json();
    const brandId = created.brand.id;
    let job = await (await request.post("/api/research/jobs", { data: { brandId } })).json();
    for (let i = 0; i < 60 && job.status !== "completed" && job.status !== "failed"; i++) {
      await new Promise((r) => setTimeout(r, 1500));
      job = await (await request.get(`/api/research/jobs/${job.id}`)).json();
    }
    results.liveJob = { status: job.status, steps: job.steps.map((s: { key: string; status: string; detail: string | null }) => `${s.key}: ${s.status}${s.detail ? ` (${s.detail})` : ""}`), seconds: Math.round((Date.now() - t0) / 1000) };
    expect(job.status).toBe("completed");
    const { report } = await (await request.get(`/api/research/reports/${job.reportId}`)).json();
    results.liveReport = {
      basis: report.researchBasis,
      engine: report.analysisEngine,
      pages: report.websiteAnalysis.pages.map((p: { pageType: string; url: string }) => `${p.pageType}: ${p.url}`),
      blocked: report.websiteAnalysis.blocked,
      featuresObserved: report.websiteAnalysis.features.filter((f: { status: string }) => f.status === "observed").map((f: { label: string }) => f.label),
      maturity: report.digitalMaturity,
      recommendations: report.recommendations.map((r: { serviceName: string; score: { total: number } }) => `${r.serviceName} (${r.score.total})`),
      overallRecommendation: report.overallRecommendation,
      limitations: report.limitations,
      sources: report.sources.length,
    };
    expect(report.researchBasis).toBe("live");
    expect(report.sources.every((s: { isDemo: boolean }) => !s.isDemo)).toBe(true);
    await page.goto(`/research/reports/${job.reportId}`);
    await expect(page.getByTestId("research-basis")).toContainText("Reel research");
    await shot(page, "05-live-rapport");
    await page.getByRole("tab", { name: /Website-analyse/ }).click();
    await shot(page, "06-live-website-analyse");
  } finally {
    await setMode(request, "demo");
  }
});

test("Afventende moduler og mobil", async ({ page }) => {
  for (const [nav, title] of [
    ["nav-production", "Produktion & Levering"],
    ["nav-crm", "CRM"],
    ["nav-dashboard", "Dashboard"],
  ] as const) {
    await page.goto("/research");
    await page.getByTestId(nav).click();
    await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
    await expect(page.getByTestId("pending-notice")).toContainText("Afventer — modulet udvikles i en kommende version.");
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/research");
  results.mobileHorizontalOverflowPx = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(results.mobileHorizontalOverflowPx).toBe(0);
  results.pendingModules = "ok";
});
