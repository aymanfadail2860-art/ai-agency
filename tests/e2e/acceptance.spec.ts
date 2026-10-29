import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

/**
 * Accepttest V2 (Demo Mode) — scenarierne A-F fra masterprompten.
 */

const dkk = (n: number) =>
  new Intl.NumberFormat("da-DK", { style: "currency", currency: "DKK", minimumFractionDigits: 2 }).format(n).replace(/ /g, " ");

async function readPrices(page: Page) {
  const impl = await page.getByTestId("impl-price").evaluateAll((els) => els.map((e) => Number((e as HTMLInputElement).value)));
  const monthly = await page.getByTestId("monthly-price").evaluateAll((els) => els.map((e) => ((e as HTMLInputElement).disabled ? 0 : Number((e as HTMLInputElement).value))));
  return { impl: impl.reduce((a, b) => a + b, 0), monthly: monthly.reduce((a, b) => a + b, 0) };
}

async function discoverAndCreate(page: Page, example: string, candidateIndex = 0) {
  await page.goto("/research");
  await page.getByTestId(`demo-example-${example}`).click();
  await expect(page.getByTestId("discovery-result")).toBeVisible();
  if (candidateIndex > 0) await page.getByTestId(`brand-candidate-${candidateIndex}`).click();
  await page.getByTestId("create-brand").click();
  await page.waitForURL(/\/research\/brands\/brd_/);
}

async function runResearch(page: Page) {
  await page.getByTestId("start-research").click();
  await expect(page.getByTestId("research-progress")).toBeVisible();
  await page.waitForURL(/\/research\/reports\/rrep_/, { timeout: 30_000 });
}

test("Scenarie A + F: CVR → brand → research → tilbud → PDF → versioner → persistens", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/research$/);
  await expect(page.getByRole("heading", { name: "AI Company Research" })).toBeVisible();
  await expect(page.getByTestId("entry-url")).toBeVisible();
  await expect(page.getByTestId("entry-cvr")).toBeVisible();

  // CVR-indgang: juridisk enhed og P-nummer identificeres
  await page.getByTestId("demo-example-00000001").click();
  const panel = page.getByTestId("discovery-result");
  await expect(panel).toContainText("Nordlys VVS & Energi ApS");
  await expect(panel).toContainText("Angivet af dig");
  await expect(panel).toContainText("P-nr. 0000000101");
  await page.getByTestId("create-brand").click();
  await page.waitForURL(/\/research\/brands\/brd_/);
  await expect(page.locator('[data-testid="relation"][data-status="confirmed"]')).toHaveCount(1);

  await runResearch(page);
  await expect(page.getByTestId("research-basis")).toContainText("Demo Mode");
  await expect(page.getByTestId("overall-recommendation")).toContainText("starte med");
  await expect(page.getByTestId("meeting-questions").locator("li").first()).toBeVisible();
  await page.getByRole("tab", { name: /Website-analyse/ }).click();
  await expect(page.getByTestId("feature-online_booking")).toContainText("Ikke observeret");
  await expect(page.getByTestId("feature-contact_form")).toContainText("Observeret");
  await page.getByRole("tab", { name: /Konkurrenter/ }).click();
  await expect(page.getByText("Aarhus Rør & Varme ApS (fiktiv)")).toBeVisible();
  await page.getByRole("tab", { name: /Serviceanbefalinger/ }).click();

  const recs = page.getByTestId("recommendation");
  expect(await recs.count()).toBeGreaterThanOrEqual(5);
  await page.locator('button:text-is("[1]")').first().click();
  await expect(page.getByRole("dialog")).toContainText("Fiktiv demokilde");
  await page.keyboard.press("Escape");

  // Vælg tre, fravælg én, redigér beskrivelse — og genindlæs
  for (let i = 0; i < 4; i++) await recs.nth(i).locator('input[type="checkbox"]').check();
  await recs.nth(3).locator('input[type="checkbox"]').uncheck();
  await recs.nth(0).getByRole("button", { name: /Fordele, forudsætninger/ }).click();
  await expect(recs.nth(0).getByText("Spørgsmål til kunden")).toBeVisible();
  await recs.nth(0).getByLabel("Beskrivelse til tilbuddet").fill("E2E: redigeret beskrivelse.");
  await page.getByLabel("Noter til rapporten").fill("E2E-noter");
  await page.getByTestId("save-report").click();
  await expect(page.getByText("Gemt", { exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole("tab", { name: /Serviceanbefalinger/ }).click();
  await expect(page.getByTestId("selected-count")).toHaveText("3");
  await expect(page.getByLabel("Noter til rapporten")).toHaveValue("E2E-noter");

  // Tilbud
  await page.getByTestId("create-quote").click();
  await page.waitForURL(/\/quotes\/qte_/);
  await expect(page.getByTestId("line-item")).toHaveCount(3);
  await expect(page.getByTestId("preview-recipient")).toContainText("Nordlys VVS & Energi ApS");
  await expect(page.getByTestId("quote-preview")).toContainText("E2E: redigeret beskrivelse.");
  await page.getByTestId("impl-price").first().fill("20000");
  await page.getByTestId("monthly-price").first().fill("2500");
  await page.getByTestId("add-one-time").click();
  await page.getByTestId("impl-price").last().fill("4000");
  await page.getByLabel("Rabattype").selectOption("percent");
  await page.getByLabel("Værdi").fill("10");
  await page.getByLabel("Gælder for").selectOption("implementation");
  await page.getByLabel("Særlige vilkår").fill("E2E-vilkår");
  const prices = await readPrices(page);
  const implNet = Math.round(prices.impl * 0.9 * 100) / 100;
  await expect(page.getByTestId("preview-impl-excl")).toHaveText(dkk(implNet));
  await expect(page.getByTestId("preview-monthly-excl")).toHaveText(dkk(prices.monthly));
  await expect(page.getByTestId("preview-first-year-excl")).toHaveText(`${dkk(implNet + 12 * prices.monthly)} ekskl. moms`);
  await page.getByTestId("generate-content").click();
  await expect(page.getByText(/Demo Mode — tilbudsteksten er genereret ud fra skabelon/)).toBeVisible();
  await expect(page.getByTestId("quote-preview")).toContainText("Forudsætninger og forbehold");
  await expect(page.getByTestId("quote-preview")).toContainText("(engangsydelse)");
  await page.getByTestId("save-draft").click();
  await expect(page.getByText("Udkastet er gemt.")).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await page.getByTestId("export-pdf").click();
  const pdf = readFileSync((await (await downloadPromise).path())!);
  expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");

  await page.getByTestId("new-version").click();
  await expect(page.getByText(/Version 2 er oprettet/)).toBeVisible();
  const quoteUrl = page.url();
  await page.goto("/quotes");
  await page.locator('[data-testid^="open-quote-"]').first().click();
  await expect(page).toHaveURL(quoteUrl);
  await expect(page.getByTestId("version-select").locator("option")).toHaveCount(2);
  await expect(page.getByTestId("impl-price").first()).toHaveValue("20000");
  await expect(page.getByLabel("Særlige vilkår")).toHaveValue("E2E-vilkår");
});

test("Scenarie B: URL uden CVR → fuld research → tilbud uden juridisk enhed", async ({ page }) => {
  await discoverAndCreate(page, "httpshavblikexample");
  await expect(page.getByText("Ingen juridisk enhed er knyttet til brandet")).toBeVisible();
  await runResearch(page);
  await expect(page.getByTestId("overview-tab")).toContainText("Ingen juridisk enhed identificeret");
  await page.getByRole("tab", { name: /Serviceanbefalinger/ }).click();
  const recs = page.getByTestId("recommendation");
  await recs.nth(0).locator('input[type="checkbox"]').check();
  await page.getByTestId("create-quote").click();
  await page.waitForURL(/\/quotes\/qte_/);
  await expect(page.getByTestId("quote-preview")).toContainText("Ikke bekræftet");
});

test("Scenarie C: to brands under samme CVR holdes adskilt", async ({ page }) => {
  await discoverAndCreate(page, "00000004", 1);
  await expect(page.getByRole("heading", { level: 1, name: "Fjordhuset Café" })).toBeVisible();
  await runResearch(page);
  const cafeReport = page.url();
  await expect(page.getByTestId("report-summary")).toContainText("Fjordhuset Café");

  await discoverAndCreate(page, "00000004", 2);
  await expect(page.getByRole("heading", { level: 1, name: "Fjordhuset Events" })).toBeVisible();
  await runResearch(page);
  expect(page.url()).not.toBe(cafeReport);
  await expect(page.getByTestId("report-summary")).toContainText("Fjordhuset Events");
  await page.getByRole("tab", { name: /Website-analyse/ }).click();
  await expect(page.getByTestId("website-tab")).not.toContainText("fjordhuset-cafe");
});

test("Scenarie D: flere juridiske enheder vælges ikke automatisk", async ({ page }) => {
  await page.goto("/research");
  await page.getByTestId("demo-example-httpsbryggerietnordlysexample").click();
  await expect(page.getByTestId("discovered-legal-entity")).toHaveCount(2);
  await expect(page.getByTestId("discovery-result")).toContainText("Foreslået — skal bekræftes");
  await page.getByTestId("create-brand").click();
  await page.waitForURL(/\/research\/brands\/brd_/);
  await expect(page.getByText("Flere mulige juridiske enheder")).toBeVisible();
  await expect(page.locator('[data-testid="relation"][data-status="confirmed"]')).toHaveCount(0);
  await expect(page.locator('[data-testid="relation"][data-status="suggested"]')).toHaveCount(2);
  await page.getByTestId("confirm-00000006").click();
  await expect(page.locator('[data-testid="relation"][data-cvr="00000006"]')).toHaveAttribute("data-status", "confirmed");
  await page.getByTestId("reject-00000005").click();
  await expect(page.locator('[data-testid="relation"][data-cvr="00000005"]')).toHaveAttribute("data-status", "rejected");
  await runResearch(page);
  await expect(page.getByTestId("overview-tab")).toContainText("Bryggeriet Nordlys Drift ApS");
  await expect(page.getByTestId("overview-tab")).not.toContainText("Bryggeriet Nordlys Holding ApS");
});

test("Afventende moduler", async ({ page }) => {
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
});

test("API-kontrakter og validering", async ({ request }) => {
  const bad = await request.post("/api/quotes/intake", { data: { contract: "research.quote-handoff", version: 2, services: [] } });
  expect(bad.status()).toBe(400);
  for (const path of ["/api/production/intake", "/api/crm/activities", "/api/dashboard/metrics"]) {
    expect((await request.post(path, { data: {} })).status()).toBe(501);
  }
  expect((await request.post("/api/research/discover", { data: { type: "url", value: "ikke en url" } })).status()).toBe(400);
  expect((await request.put("/api/settings", { data: { mode: "live" }, headers: { origin: "https://evil.example" } })).status()).toBe(403);
  const status = await (await request.get("/api/integrations/status")).json();
  expect(status.integrations.map((i: { key: string }) => i.key)).toEqual(["cvr", "ai", "search", "website"]);
});

test("Scenarie E: Live Mode uden integrationer viser begrænsninger og ingen fiktive data", async ({ page, request }) => {
  await request.put("/api/settings", { data: { mode: "live" } });
  try {
    await page.goto("/research");
    await expect(page.getByTestId("mode-badge").first()).toContainText("Live");
    await page.getByTestId("entry-cvr").click();
    await expect(page.getByText("CVR-opslag er ikke konfigureret")).toBeVisible();
    const cvr = await request.post("/api/research/discover", { data: { type: "cvr", value: "10150817" } });
    expect(cvr.status()).toBe(503);
    const demoUrl = await request.post("/api/research/discover", { data: { type: "url", value: "https://nordlys-vvs.example" } });
    expect(demoUrl.status()).toBe(409);
    const ssrf = await request.post("/api/research/discover", { data: { type: "url", value: "http://169.254.169.254/latest" } });
    expect(ssrf.status()).toBe(400);
    expect((await ssrf.json()).error.code).toBe("blocked_url");
    await expect(page.getByTestId(/demo-example-/)).toHaveCount(0);
  } finally {
    await request.put("/api/settings", { data: { mode: "demo" } });
  }
});
