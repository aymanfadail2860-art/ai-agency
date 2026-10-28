import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

/**
 * Accepttest for V1 — følger acceptkriterierne i masterprompten (punkt 1-16).
 */

const dkk = (n: number) =>
  new Intl.NumberFormat("da-DK", { style: "currency", currency: "DKK", minimumFractionDigits: 2 }).format(n).replace(/ /g, " ");

async function readPrices(page: Page) {
  const impl = await page.getByTestId("impl-price").evaluateAll((els) => els.map((e) => Number((e as HTMLInputElement).value)));
  const monthly = await page.getByTestId("monthly-price").evaluateAll((els) => els.map((e) => Number((e as HTMLInputElement).value)));
  return { impl: impl.reduce((a, b) => a + b, 0), monthly: monthly.reduce((a, b) => a + b, 0) };
}

test("komplet flow: Demo Mode → research → servicevalg → tilbud → PDF → genåbning → afventende moduler", async ({ page }) => {
  // 1-2. Applikationen kører, og Research åbnes.
  await page.goto("/");
  await expect(page).toHaveURL(/\/research$/);
  await expect(page.getByRole("heading", { name: "AI Company Research" })).toBeVisible();
  await expect(page.getByTestId("mode-badge").first()).toContainText("Demo");

  // 3. Vælg en fiktiv virksomhed i Demo Mode.
  await page.getByTestId("demo-company-nordlys-vvs").click();
  await expect(page).toHaveURL(/\/research\/companies\/cmp_/);
  await expect(page.getByText("Fiktive demodata")).toBeVisible();

  // 4. Start research.
  await page.getByTestId("start-research").click();
  await expect(page.getByTestId("research-progress")).toBeVisible();
  await page.waitForURL(/\/research\/reports\/rrep_/, { timeout: 30_000 });

  // 5. Gennemse researchrapporten.
  await expect(page.getByTestId("report-summary")).toContainText("Nordlys VVS");
  const recs = page.getByTestId("recommendation");
  expect(await recs.count()).toBeGreaterThanOrEqual(3);
  await expect(page.getByText("Verificeret fakta").first()).toBeVisible();
  await page.locator('button:text-is("[1]")').first().click();
  await expect(page.getByRole("dialog")).toContainText("Fiktiv demokilde");
  await page.keyboard.press("Escape");
  await page.getByRole("tab", { name: /Virksomhedsprofil/ }).click();
  await expect(page.getByText("Digital tilstedeværelse")).toBeVisible();
  await page.getByRole("tab", { name: /Konkurrenter/ }).click();
  await expect(page.getByText("Aarhus Rør & Varme ApS (fiktiv)")).toBeVisible();
  await page.getByRole("tab", { name: /Serviceanbefalinger/ }).click();

  // 6. Vælg tre services — og kontrollér, at valgene bevares ved genindlæsning.
  for (let i = 0; i < 3; i++) await recs.nth(i).locator('input[type="checkbox"]').check();
  await expect(page.getByTestId("selected-count")).toHaveText("3");
  await page.getByTestId("save-report").click();
  await expect(page.getByText("Gemt", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("selected-count")).toHaveText("3");
  const selectedNames = await recs.locator("h3").evaluateAll((els) => els.slice(0, 3).map((e) => e.textContent ?? ""));

  // 7. Overfør til Tilbud.
  await page.getByTestId("create-quote").click();
  await page.waitForURL(/\/quotes\/qte_/);
  await expect(page.getByTestId("line-item")).toHaveCount(3);
  for (const name of selectedNames) await expect(page.getByTestId("quote-preview")).toContainText(name);

  // 8. Redigér priser.
  await page.getByTestId("impl-price").first().fill("20000");
  await page.getByTestId("monthly-price").first().fill("2500");
  const prices = await readPrices(page);
  await expect(page.getByTestId("preview-impl-excl")).toHaveText(dkk(prices.impl));
  await expect(page.getByTestId("preview-monthly-excl")).toHaveText(dkk(prices.monthly));

  // 9. Generér tilbud (Demo Mode bruger skabelon — tydeligt markeret).
  await page.getByTestId("generate-content").click();
  await expect(page.getByText(/Demo Mode — tilbudsteksten er genereret ud fra skabelon/)).toBeVisible();
  await expect(page.getByTestId("quote-preview")).toContainText("Identificerede muligheder");

  // 10. Kontrollér prisberegninger (inkl. rabat og moms).
  const firstYear = prices.impl + 12 * prices.monthly;
  await expect(page.getByTestId("preview-first-year-excl")).toHaveText(`${dkk(firstYear)} ekskl. moms`);
  await expect(page.getByTestId("preview-first-year-incl")).toHaveText(`${dkk(firstYear * 1.25)} inkl. moms`);
  await page.getByLabel("Rabattype").selectOption("percent");
  await page.getByLabel("Værdi").fill("10");
  await page.getByLabel("Gælder for").selectOption("implementation");
  const discountedYear = prices.impl * 0.9 + 12 * prices.monthly;
  await expect(page.getByTestId("preview-impl-excl")).toHaveText(dkk(prices.impl * 0.9));
  await expect(page.getByTestId("preview-first-year-excl")).toHaveText(`${dkk(discountedYear)} ekskl. moms`);
  await page.getByTestId("save-draft").click();
  await expect(page.getByText("Udkastet er gemt.")).toBeVisible();

  // 11. Eksportér PDF.
  const downloadPromise = page.waitForEvent("download");
  await page.getByTestId("export-pdf").click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^Tilbud-T-\d{4}-\d{4}-v1-.*DEMO\.pdf$/);
  const pdf = readFileSync((await download.path())!);
  expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  expect(pdf.length).toBeGreaterThan(5000);

  // Ny version: den tidligere låses.
  await page.getByTestId("new-version").click();
  await expect(page.getByText(/Version 2 er oprettet/)).toBeVisible();
  await expect(page.getByTestId("version-select").locator("option")).toHaveCount(2);

  // 12. Genindlæs og genåbn det gemte tilbud.
  const quoteUrl = page.url();
  await page.goto("/quotes");
  await page.locator('[data-testid^="open-quote-"]').first().click();
  await expect(page).toHaveURL(quoteUrl);
  await expect(page.getByTestId("impl-price").first()).toHaveValue("20000");
  await expect(page.getByTestId("preview-impl-excl")).toHaveText(dkk(prices.impl * 0.9));

  // 13-16. Afventende moduler via sidebar.
  for (const [nav, title] of [
    ["nav-production", "Produktion & Levering"],
    ["nav-crm", "CRM"],
    ["nav-dashboard", "Dashboard"],
  ] as const) {
    await page.getByTestId(nav).click();
    await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
    await expect(page.getByTestId("pending-notice")).toContainText("Afventer — modulet udvikles i en kommende version.");
  }
  await expect(page.getByTestId("demo-kpis")).toContainText("Demo");
});

test("API-kontrakter og validering", async ({ request }) => {
  const bad = await request.post("/api/quotes/intake", { data: { contract: "research.quote-handoff", version: 1, services: [] } });
  expect(bad.status()).toBe(400);
  expect((await bad.json()).error.code).toBe("validation_error");

  for (const path of ["/api/production/intake", "/api/crm/activities", "/api/dashboard/metrics"]) {
    const res = await request.post(path, { data: {} });
    expect(res.status()).toBe(501);
    expect((await res.json()).contract).toMatch(/@1$/);
  }

  const invalidCvr = await request.post("/api/research/companies/lookup", { data: { cvr: "12345678" } });
  expect(invalidCvr.status()).toBe(400);

  const foreign = await request.put("/api/settings", { data: { mode: "live" }, headers: { origin: "https://evil.example" } });
  expect(foreign.status()).toBe(403);

  const status = await request.get("/api/integrations/status");
  const body = await status.json();
  expect(body.integrations.map((i: { key: string }) => i.key)).toEqual(["cvr", "ai", "search", "website"]);
  expect(JSON.stringify(body)).not.toMatch(/sk-ant|api[_-]?key"\s*:\s*"[^"]+/i);
});

test("Live Mode uden konfigureret CVR-nøgle viser integrationsstatus og ingen demo-fallback", async ({ page, request }) => {
  await request.put("/api/settings", { data: { mode: "live" } });
  try {
    await page.goto("/research");
    await expect(page.getByTestId("mode-badge").first()).toContainText("Live");
    const status = await (await request.get("/api/integrations/status")).json();
    const cvr = status.integrations.find((i: { key: string }) => i.key === "cvr");
    if (!cvr.configured) {
      await expect(page.getByText("CVR-integrationen er ikke konfigureret")).toBeVisible();
      const res = await request.post("/api/research/companies/lookup", { data: { cvr: "10150817" } });
      expect(res.status()).toBe(503);
    }
    await expect(page.getByTestId(/demo-company-/)).toHaveCount(0);
  } finally {
    await request.put("/api/settings", { data: { mode: "demo" } });
  }
});
