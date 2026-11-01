import { expect, test, type Page } from "@playwright/test";

/**
 * Accepttest V3 etape 4 — Dashboard og det samlede seks-moduls forløb (Demo Mode).
 * Kører sidst (efter acceptance/aos/production/sales-crm). Ingen betalte AI-kald,
 * ingen e-mails, opkald eller deployment.
 */

async function kpi(page: Page, key: string) {
  return (await page.getByTestId(`kpi-${key}-value`).textContent())?.trim() ?? "";
}

test("Executive Overview: 12 klikbare KPI'er, filtre, datagrundlag og beregningsmetoder", async ({ page }) => {
  await page.goto("/research");
  await page.getByTestId("nav-dashboard").click();
  await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();
  await expect(page.getByTestId("data-basis")).toContainText("DEMO");
  await expect(page.getByTestId("dashboard-filters")).toBeVisible();
  // Dashboard-demoen indlæses, så alle områder har data.
  await page.getByTestId("demo-load").click();
  await expect(page.getByTestId("demo-status")).toContainText("demo-virksomheder", { timeout: 60_000 });
  await expect(page.getByTestId("overview-kpis").locator('[data-testid^="kpi-"][href]')).toHaveCount(12);
  expect(await kpi(page, "approvals")).not.toBe("0");
  expect(await kpi(page, "overdue-projects")).not.toBe("0");
  await expect(page.getByTestId("hero-mrr")).not.toHaveText(/^0 /);
  await expect(page.getByTestId("attention-today").getByTestId("action-item").first()).toBeVisible();
  await page.getByTestId("definitions").locator("summary").click();
  await expect(page.getByTestId("definitions")).toContainText("aldrig en sum af måneder");
});

test("Demoen er idempotent og genbruger eksisterende kunder og projekter", async ({ request }) => {
  const before = await (await request.get("/api/dashboard/demo")).json();
  const again = await (await request.post("/api/dashboard/demo", { data: { action: "load" } })).json();
  expect(again.status.accounts).toBe(before.accounts);
  expect(again.status.projects).toBe(before.projects);
  const data = await (await request.get("/api/dashboard?period=all")).json();
  // Ingen dobbeltoptælling: én aftale pr. projekt, selvom kunden også har vundet salgsmulighed (og evt. accepteret tilbud).
  const projectAgreements = data.finance.agreements.filter((a: { kind: string }) => a.kind === "project");
  expect(new Set(projectAgreements.map((a: { sourceId: string }) => a.sourceId)).size).toBe(projectAgreements.length);
  const customerKeys = data.finance.agreements.map((a: { customerKey: string }) => a.customerKey);
  expect(data.overview.kpis.find((k: { key: string }) => k.key === "customers").value).toBeGreaterThanOrEqual(new Set(customerKeys).size);
  expect(data.finance.levels.find((l: { key: string }) => l.key === "invoiced")).toMatchObject({ available: false, implementation: null });
  expect((await request.get("/api/dashboard?period=custom&from=2026-10-20")).status()).toBe(400);
});

test("KPI'er fører til filtrerede visninger, og filtre slår igennem", async ({ page }) => {
  await page.goto("/dashboard");
  await page.getByTestId("kpi-overdue-projects").click();
  await page.waitForURL(/\/dashboard\/delivery\?projectStatus=overdue/);
  await expect(page.getByTestId("filter-project-status")).toHaveValue("overdue");
  const rows = page.getByTestId("delivery-row");
  await expect(rows.first()).toBeVisible();
  for (const row of await rows.all()) await expect(row).toContainText("Forsinket");

  await page.getByTestId("filter-period").selectOption("7d");
  await page.waitForURL(/period=7d/);
  await expect(page).toHaveURL(/projectStatus=overdue/);
  await page.getByTestId("filter-reset").click();
  await page.waitForURL((u) => !u.search.includes("projectStatus"));

  await page.getByTestId("filter-period").selectOption("custom");
  await page.getByTestId("filter-from").fill("2026-10-01");
  await page.getByTestId("filter-to").fill("2026-10-31");
  await page.getByTestId("filter-apply-range").click();
  await page.waitForURL(/period=custom&from=2026-10-01&to=2026-10-31/);
  await page.goto("/dashboard?period=custom&from=2026-10-31&to=2026-10-01");
  await expect(page.getByText("Filteret kunne ikke anvendes")).toBeVisible();

  await page.goto("/dashboard");
  await page.getByTestId("kpi-approvals").click();
  await page.waitForURL(/\/aos\/approvals/);
});

test("De fem områder viser salg, økonomi, levering, AI og handlinger ærligt", async ({ page }) => {
  await page.goto("/dashboard/sales?period=90d");
  await expect(page.getByTestId("sales-view")).toBeVisible();
  await expect(page.getByTestId("chart-funnel")).toContainText("Forhandling");
  await page.getByTestId("chart-leads").getByText("Vis som tabel").click();
  await expect(page.getByTestId("chart-leads").locator("table")).toBeVisible();

  await page.getByTestId("dash-nav-finance").click();
  await page.waitForURL(/\/dashboard\/finance\?period=90d/);
  await expect(page.getByTestId("level-invoiced")).toHaveAttribute("data-available", "false");
  await expect(page.getByTestId("level-paid")).toContainText("Ikke tilgængelig");
  await expect(page.getByTestId("contribution-value")).toBeVisible();

  await page.getByTestId("dash-nav-delivery").click();
  await expect(page.getByTestId("agent-assignments")).toContainText("Atlas");

  await page.getByTestId("dash-nav-ai").click();
  await expect(page.getByTestId("ai-view")).toContainText("Ingen rigtige AI-kørsler endnu");
  await expect(page.getByTestId("ai-runs")).toContainText("separat");
  await expect(page.getByTestId("budget")).toContainText("Ikke konfigureret");

  await page.getByTestId("dash-nav-actions").click();
  await expect(page.getByTestId("action-center")).toBeVisible();
  const followup = page.locator('[data-testid="action-item"][data-rule="overdue_followup"]').first();
  await expect(followup).toBeVisible();
  await followup.getByRole("link").click();
  await page.waitForURL(/\/crm\/companies\/acc_.*tab=activities/);
});

test("Samlet forløb: Research → CRM → Tilbud → Produktion → AOS → Dashboard uden betalte AI-kald", async ({ page, request }) => {
  await page.goto("/dashboard");
  await page.getByTestId("demo-flow").click();
  await expect(page.getByTestId("flow-progress")).toHaveText("11 af 11 trin", { timeout: 60_000 });
  await expect(page.locator('[data-testid="six-module-flow"] [data-done="false"]')).toHaveCount(0);
  // Trin 11 åbner Dashboard filtreret på kunden — aftalen tælles præcis én gang.
  await page.locator('[data-flow-step="dashboard"]').getByRole("link", { name: "Åbn" }).click();
  await page.waitForURL(/\/dashboard\?customer=brd_/);
  const customer = new URL(page.url()).searchParams.get("customer")!;
  const data = await (await request.get(`/api/dashboard?period=all&customer=${customer}`)).json();
  expect(data.finance.agreements).toHaveLength(1);
  expect(data.finance.agreements[0].kind).toBe("project");
  expect(data.ai.realAiRuns).toBe(0);
  expect(data.ai.apiCostUsd).toBe(0);
  await expect(page.getByTestId("kpi-customers-value")).toHaveText("1");
});

test("Nulstilling fjerner kun demodata", async ({ page, request }) => {
  await page.goto("/dashboard");
  await page.getByTestId("demo-reset").click();
  await page.getByTestId("demo-reset-confirm").click();
  await expect(page.getByTestId("demo-message")).toContainText("nulstillet", { timeout: 60_000 });
  const status = await (await request.get("/api/dashboard/demo")).json();
  expect(status.loaded).toBe(false);
  const accounts = await (await request.get("/api/crm/accounts")).json();
  expect(accounts.filter((a: { account: { tags: string[] } }) => a.account.tags.includes("dashboard-demo"))).toHaveLength(0);
  // Rigtige (ikke-demo) CRM-virksomheder fra de tidligere tests er urørte.
  expect(accounts.some((a: { account: { isDemo: boolean } }) => !a.account.isDemo)).toBe(true);
});

test("Dashboard på mobil: ingen vandret overløb", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of ["/dashboard", "/dashboard/sales", "/dashboard/finance", "/dashboard/delivery", "/dashboard/ai", "/dashboard/actions"]) {
    await page.goto(path);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBe(0);
  }
});
