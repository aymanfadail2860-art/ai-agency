import { writeFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

/**
 * LIVE-TEST af den deployede platform (kun fiktive demodata).
 * Resultater og skærmbilleder skrives til LIVE_OUT (standard: ./live-results).
 */
const OUT = process.env.LIVE_OUT ?? "live-results";
const results: Record<string, unknown> = {};
const shot = (page: Page, name: string) => page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false });
const dkk = (n: number) => new Intl.NumberFormat("da-DK", { style: "currency", currency: "DKK", minimumFractionDigits: 2 }).format(n).replace(/ /g, " ");
const sum = (page: Page, id: string) => page.getByTestId(id).evaluateAll((els) => els.reduce((s, e) => s + Number((e as HTMLInputElement).value), 0));

test.afterAll(() => writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 2)));

test("API: validering, kontrakter, sikkerhed og lagring", async ({ request }) => {
  const settings = await request.get("/settings");
  const html = await settings.text();
  results.storageBackend = html.includes("Supabase (database)") ? "supabase" : html.includes("lokale JSON-filer") ? "file" : "ukendt";
  expect(results.storageBackend).toBe(process.env.LIVE_EXPECT_STORAGE ?? "supabase");

  const status = await (await request.get("/api/integrations/status")).json();
  results.integrations = Object.fromEntries(status.integrations.map((i: { key: string; configured: boolean }) => [i.key, i.configured]));
  expect(JSON.stringify(status)).not.toMatch(/sb_secret_|sb_publishable_|eyJhbGci/);

  const invalid = await request.post("/api/research/companies/lookup", { data: { cvr: "12345678" } });
  results.cvrInvalid = { status: invalid.status(), message: (await invalid.json()).error.message };
  expect(invalid.status()).toBe(400);
  const short = await request.post("/api/research/companies/lookup", { data: { cvr: "1234" } });
  expect(short.status()).toBe(400);
  const valid = await request.post("/api/research/companies/lookup", { data: { cvr: "10150817" } });
  results.cvrValidLookup = { status: valid.status(), body: await valid.json() };

  const badIntake = await request.post("/api/quotes/intake", { data: { contract: "research.quote-handoff", version: 1, services: [] } });
  expect(badIntake.status()).toBe(400);
  for (const p of ["/api/production/intake", "/api/crm/activities", "/api/dashboard/metrics"]) {
    expect((await request.post(p, { data: {} })).status()).toBe(501);
  }
  const foreign = await request.put("/api/settings", { data: { mode: "live" }, headers: { origin: "https://evil.example" } });
  expect(foreign.status()).toBe(403);
  const ssrf = await request.post("/api/research/jobs", { data: { companyId: "cmp_doesnotexist", websiteUrl: "http://169.254.169.254/" } });
  expect([400, 404]).toContain(ssrf.status());
  results.apiChecks = "ok";
});

test("Research → Tilbud: komplet flow med persistens", async ({ page }) => {
  // Research
  await page.goto("/research");
  await expect(page.getByTestId("mode-badge").first()).toContainText("Demo");
  await shot(page, "01-research");
  await page.getByTestId("demo-company-klinik-havblik").click();
  await page.waitForURL(/\/research\/companies\/cmp_/);
  await expect(page.getByText("Fiktive demodata")).toBeVisible();
  await expect(page.getByText("Reklamebeskyttet", { exact: true })).toBeVisible();
  await shot(page, "02-virksomhedsprofil");
  const t0 = Date.now();
  await page.getByTestId("start-research").click();
  await expect(page.getByTestId("research-progress")).toBeVisible();
  await page.waitForURL(/\/research\/reports\/rrep_/, { timeout: 90_000 });
  results.researchSeconds = Math.round((Date.now() - t0) / 100) / 10;
  const reportUrl = page.url();
  results.reportUrl = reportUrl;

  await expect(page.getByTestId("report-summary")).toContainText("Klinik Havblik");
  const recs = page.getByTestId("recommendation");
  results.recommendationCount = await recs.count();
  expect(results.recommendationCount).toBeGreaterThanOrEqual(3);
  results.scores = await recs.evaluateAll((els) => els.map((e) => `${e.querySelector("h3")?.textContent}: ${e.querySelector('[aria-label^="AI Opportunity Score"]')?.textContent}`));
  await page.locator('[aria-label="Vis scoreberegning"]').first().click();
  await expect(page.getByText("Observerede behovssignaler").first()).toBeVisible();
  await page.locator('button:text-is("[1]")').first().click();
  await expect(page.getByRole("dialog")).toContainText("Fiktiv demokilde");
  await shot(page, "03-kildehenvisning");
  await page.keyboard.press("Escape");
  await shot(page, "04-rapport");

  // Vælg fire, fravælg én, redigér beskrivelse og note
  for (let i = 0; i < 4; i++) await recs.nth(i).locator('input[type="checkbox"]').check();
  await recs.nth(3).locator('input[type="checkbox"]').uncheck();
  await expect(page.getByTestId("selected-count")).toHaveText("3");
  const first = recs.nth(0);
  await first.getByRole("button", { name: /Fordele, forudsætninger/ }).click();
  const editedText = "LIVE-TEST: Redigeret beskrivelse til tilbuddet (fiktiv).";
  await first.getByLabel("Beskrivelse til tilbuddet").fill(editedText);
  await first.getByLabel("Intern note").fill("Live-test note");
  await page.getByLabel("Noter til rapporten").fill("Live-test: noter gemt i Supabase.");
  await page.getByTestId("save-report").click();
  await expect(page.getByText("Gemt", { exact: true })).toBeVisible();

  // Genindlæs: valg, redigering og noter skal være bevaret (Supabase)
  await page.reload();
  await expect(page.getByTestId("selected-count")).toHaveText("3");
  await expect(page.getByLabel("Noter til rapporten")).toHaveValue("Live-test: noter gemt i Supabase.");
  await recs.nth(0).getByRole("button", { name: /Fordele, forudsætninger/ }).click();
  await expect(recs.nth(0).getByLabel("Beskrivelse til tilbuddet")).toHaveValue(editedText);
  await expect(recs.nth(3).locator('input[type="checkbox"]')).not.toBeChecked();
  results.researchPersistence = "ok";

  // Overfør til Tilbud
  await page.getByTestId("create-quote").click();
  await page.waitForURL(/\/quotes\/qte_/, { timeout: 60_000 });
  const quoteUrl = page.url();
  results.quoteUrl = quoteUrl;
  await expect(page.getByTestId("line-item")).toHaveCount(3);
  await expect(page.getByTestId("quote-preview")).toContainText(editedText);

  // Redigér priser, rabat og vilkår
  await page.getByTestId("impl-price").nth(0).fill("18000");
  await page.getByTestId("monthly-price").nth(0).fill("1500");
  await page.getByTestId("impl-price").nth(1).fill("21000");
  await page.getByTestId("monthly-price").nth(1).fill("2200");
  await page.getByLabel("Rabattype").selectOption("percent");
  await page.getByLabel("Værdi").fill("10");
  await page.getByLabel("Gælder for").selectOption("implementation");
  await page.getByLabel("Rabattekst").fill("Introrabat");
  await page.getByLabel("Særlige vilkår").fill("LIVE-TEST: Opstart senest 1. februar.");
  const impl = await sum(page, "impl-price");
  const monthly = await sum(page, "monthly-price");
  const implNet = Math.round(impl * 0.9 * 100) / 100;
  const year = implNet + 12 * monthly;
  await expect(page.getByTestId("preview-impl-excl")).toHaveText(dkk(implNet));
  await expect(page.getByTestId("preview-monthly-excl")).toHaveText(dkk(monthly));
  await expect(page.getByTestId("preview-first-year-excl")).toHaveText(`${dkk(year)} ekskl. moms`);
  await expect(page.getByTestId("preview-first-year-incl")).toHaveText(`${dkk(Math.round(year * 125) / 100)} inkl. moms`);
  results.calculations = { implementationGross: impl, implementationAfterDiscount: implNet, monthly, firstYearExclVat: year, firstYearInclVat: Math.round(year * 125) / 100 };

  await page.getByTestId("save-draft").click();
  await expect(page.getByText("Udkastet er gemt.")).toBeVisible();
  await page.getByTestId("generate-content").click();
  await expect(page.getByText(/Demo Mode — tilbudsteksten er genereret ud fra skabelon/)).toBeVisible();
  await expect(page.getByTestId("quote-preview")).toContainText("Identificerede muligheder");
  await expect(page.getByTestId("quote-preview")).toContainText("LIVE-TEST: Opstart senest 1. februar.");
  await shot(page, "05-tilbudseditor");

  // PDF
  const dl = page.waitForEvent("download");
  await page.getByTestId("export-pdf").click();
  const download = await dl;
  const pdfPath = `${OUT}/tilbud.pdf`;
  await download.saveAs(pdfPath);
  results.pdf = { filename: download.suggestedFilename() };

  // Genindlæs og genåbn fra tilbudslisten
  await page.goto("/quotes");
  await page.locator('[data-testid^="open-quote-"]').first().click();
  await expect(page).toHaveURL(quoteUrl);
  await expect(page.getByTestId("impl-price").nth(0)).toHaveValue("18000");
  await expect(page.getByTestId("monthly-price").nth(1)).toHaveValue("2200");
  await expect(page.getByLabel("Særlige vilkår")).toHaveValue("LIVE-TEST: Opstart senest 1. februar.");
  await expect(page.getByTestId("preview-impl-excl")).toHaveText(dkk(implNet));
  results.quotePersistence = "ok";

  // Versionering
  await page.getByTestId("new-version").click();
  await expect(page.getByText(/Version 2 er oprettet/)).toBeVisible();
  await page.getByTestId("impl-price").nth(0).fill("19000");
  await page.getByTestId("save-draft").click();
  await expect(page.getByText("Udkastet er gemt.")).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("version-select").locator("option")).toHaveCount(2);
  await expect(page.getByTestId("impl-price").nth(0)).toHaveValue("19000");
  const v1 = await page.getByTestId("version-select").locator("option").nth(1).getAttribute("value");
  await page.getByTestId("version-select").selectOption(v1!);
  await expect(page.getByText("Låst version")).toBeVisible();
  await expect(page.getByTestId("impl-price").nth(0)).toHaveValue("18000");
  await expect(page.getByTestId("impl-price").nth(0)).toBeDisabled();
  results.versioning = "ok";
});

test("Afventende moduler og visuel kontrol", async ({ page }) => {
  for (const [nav, title, file] of [
    ["nav-production", "Produktion & Levering", "06-produktion"],
    ["nav-crm", "CRM", "07-crm"],
    ["nav-dashboard", "Dashboard", "08-dashboard"],
  ] as const) {
    await page.goto("/research");
    await page.getByTestId(nav).click();
    await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
    await expect(page.getByTestId("pending-notice")).toContainText("Afventer — modulet udvikles i en kommende version.");
    await shot(page, file);
  }
  await page.goto("/settings");
  await shot(page, "09-indstillinger");
  // Responsivitet: mobilbredde
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/research");
  await expect(page.getByRole("navigation", { name: "Moduler (mobil)" })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  results.mobileHorizontalOverflowPx = overflow;
  await shot(page, "10-mobil-research");
  results.pendingModules = "ok";
});
