import { expect, test, type Page } from "@playwright/test";

/**
 * Accepttest V3 etape 2 — Produktion & Levering (Demo Mode).
 * Kører efter acceptance.spec.ts (der findes tilbud) og aos.spec.ts.
 */

async function runGuidedDemo(page: Page) {
  const state = async () => `${await page.getByTestId("guided-step").textContent()}|${await page.getByTestId("gate-panel").count()}`;
  for (let i = 0; i < 16; i++) {
    if ((await page.getByTestId("current-phase").textContent()) === "Vedligeholdelse") return;
    const before = await state();
    const approve = page.getByTestId("gate-approve");
    if (await approve.count()) await approve.click();
    else await page.getByTestId("simulate-phase").click();
    // Vent, til siden viser det næste trin (eller faseporten), før næste handling.
    await expect.poll(state, { timeout: 20_000 }).not.toBe(before);
  }
}

test("Tilbud → Produktion: kundens accept overfører aftalen via kontrakten", async ({ page }) => {
  await page.goto("/quotes");
  await page.locator('[data-testid^="open-quote-"]').first().click();
  await page.waitForURL(/\/quotes\/qte_/);
  const quoteUrl = page.url();
  await page.getByTestId("accept-quote").click();
  await page.getByTestId("confirm-accept").click();
  await page.waitForURL(/\/production\/projects\/prj_/);
  await expect(page.getByTestId("current-phase")).toHaveText("Oprettet");
  await expect(page.getByTestId("source-quote")).toContainText("accepteret");
  await page.getByRole("tab", { name: /Finance/ }).click();
  await expect(page.getByTestId("tab-finance")).toContainText("Priserne stammer fra");
  // Idempotent: tilbuddet viser nu linket til det samme projekt.
  const projectUrl = page.url();
  await page.goto(quoteUrl);
  await page.getByTestId("open-production-project").click();
  await page.waitForURL(projectUrl);
});

test("Manuelt projekt: oprettelse, opgaver, fase og agentopgave via AOS' Job Center", async ({ page }) => {
  await page.goto("/production/new?base=ai_chatbot");
  await page.locator("#customer-mode").selectOption("new");
  await page.getByTestId("customer-name").fill("Testkunde ApS");
  await page.getByTestId("project-name").fill("Chatbot til Testkunde");
  await expect(page.getByTestId("impl-price")).toHaveValue("14500");
  await page.getByTestId("create-project").click();
  await page.waitForURL(/\/production\/projects\/prj_/);
  await expect(page.getByTestId("advance-phase")).toBeDisabled();
  await expect(page.getByTestId("phase-blockers")).toContainText("Bekræft aftale");

  await page.getByRole("tab", { name: /Tasks/ }).click();
  const first = page.getByTestId("task-row").first();
  await first.getByTestId("task-status").selectOption("done");
  await expect(first).toHaveAttribute("data-task-status", "done");
  await page.getByTestId("advance-phase").click();
  await expect(page.getByTestId("current-phase")).toHaveText("Kravafdækning");

  // Agentopgave → fælles Job Center. Routeren blokerer ærligt (planlagt opgavetype / Demo Mode).
  await page.getByRole("tab", { name: /Tasks/ }).click();
  await page.getByTestId("send-to-job-center").first().click();
  const jobLink = page.getByTestId("task-job-link").first();
  await expect(jobLink).toContainText("Blokeret");
  await jobLink.click();
  await page.waitForURL(/\/aos\/jobs\/aij_/);
  await expect(page.getByTestId("job-routing")).toContainText("ikke implementeret");
  await page.goto("/aos/jobs");
  await expect(page.getByTestId("job-row").filter({ hasText: "Chatbot til Testkunde" })).toHaveCount(1);
});

test("Guidet demo: Restaurant Nord gennem alle faser med faseporte i AOS", async ({ page, request }) => {
  await page.goto("/production");
  await page.getByTestId("load-demo").click();
  await page.waitForURL(/\/production\/projects\/prj_/, { timeout: 60_000 });
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("AI-receptionist til Restaurant Nord");
  await expect(page.getByTestId("guided-step")).toContainText("Trin 1 af 11");
  await expect(page.getByTestId("source-quote")).toContainText("accepteret");

  await runGuidedDemo(page);
  await expect(page.getByTestId("current-phase")).toHaveText("Vedligeholdelse");
  await page.getByRole("tab", { name: /Testing/ }).click();
  await expect(page.locator('[data-testid="test-row"][data-test-status="passed"]')).toHaveCount(10);
  await page.getByRole("tab", { name: /Activity/ }).click();
  await expect(page.getByTestId("project-events")).toContainText("Godkendt i AOS");
  await expect(page.getByTestId("project-events")).toContainText("Demo-simulering");

  // Faseportene er rigtige (demo-)godkendelser i AOS.
  const approvals = (await (await request.get("/api/aos/approvals")).json()) as Array<{ status: string; subject: { ref?: { module: string } }; category: string }>;
  const production = approvals.filter((a) => a.subject.ref?.module === "production");
  expect(production.map((a) => a.category).sort()).toEqual(["deployment", "production"]);
  expect(production.every((a) => a.status === "approved")).toBe(true);

  // Agenterne er AOS' agenter; simuleret arbejde gør dem ikke "aktive".
  await page.goto("/aos/agents/agt_forge");
  await expect(page.getByTestId("agent-assignments")).toContainText("AI-receptionist til Restaurant Nord");
  await page.goto("/aos/office");
  await expect(page.locator('[data-testid^="office-agent-"][data-agent-status="working"]')).toHaveCount(0);
});

test("Dashboard, filtre, Service Factory og demo-beskyttelse", async ({ page, request }) => {
  await page.goto("/production");
  expect(Number(await page.getByTestId("kpi-overdue").locator("p").nth(1).textContent())).toBeGreaterThan(0);
  await page.getByTestId("project-search").fill("Fjordhuset");
  await expect(page.getByTestId("project-card")).toHaveCount(1);
  await page.getByTestId("project-search").fill("");
  await page.getByTestId("kpi-overdue").click();
  await expect(page.getByTestId("project-card").first()).toContainText("Forsinket");
  await expect(page.getByTestId("deadlines")).toBeVisible();
  await expect(page.getByTestId("production-agents")).toContainText("Forge");

  await page.getByTestId("open-service-factory").click();
  await expect(page.locator('[data-testid^="service-base-"]')).toHaveCount(8);

  // Simulering kræver et demoprojekt.
  const projects = (await (await request.get("/api/production/projects")).json()) as Array<{ project: { id: string; isDemo: boolean } }>;
  const real = projects.find((p) => !p.project.isDemo)!;
  const sim = await request.post(`/api/production/projects/${real.project.id}/simulate`, { data: {} });
  expect(sim.status()).toBe(409);

  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of ["/production", "/production/new", "/production/service-factory", `/production/projects/${real.project.id}`]) {
    await page.goto(path);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  }
});
