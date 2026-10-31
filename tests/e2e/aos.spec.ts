import { expect, test } from "@playwright/test";

/**
 * Accepttest V3 — AOS og den fælles AI-infrastruktur (Demo Mode).
 * Kører efter acceptance.spec.ts, så der findes registrerede research-job.
 */

test("Research → Job Center → AOS: jobbet er registreret med routing, tidslinje og resultat", async ({ page }) => {
  await page.goto("/aos");
  await expect(page.getByRole("heading", { level: 1, name: "Command Center" })).toBeVisible();
  await expect(page.getByTestId("kpi-agents")).toHaveText("8");
  expect(Number(await page.getByTestId("kpi-succeeded").textContent())).toBeGreaterThan(0);
  await expect(page.getByTestId("aos-data-basis")).toContainText("Demo Mode");

  await page.getByTestId("aos-nav-jobs").click();
  const row = page.getByTestId("job-row").filter({ hasText: "Research:" }).first();
  await expect(row).toContainText("Gennemført");
  await row.getByRole("link").click();
  await expect(page.getByTestId("job-timeline")).toContainText("Kommerciel rapport: færdig");
  await expect(page.getByTestId("job-routing")).toContainText("Demo Mode");
  await page.getByTestId("job-report-link").click();
  await page.waitForURL(/\/research\/reports\/rrep_/);
});

test("Agent Office viser reelle statusser, og en agent kan åbnes", async ({ page }) => {
  await page.goto("/aos/office");
  const scout = page.getByTestId("office-agent-scout");
  await expect(scout).toBeVisible();
  // Ingen job kører nu — ingen agent må fremstå som aktiv.
  await expect(page.locator('[data-testid^="office-agent-"][data-agent-status="working"]')).toHaveCount(0);
  await scout.click();
  await expect(page.getByTestId("office-detail")).toContainText("Research Specialist");
  await expect(page.getByTestId("office-detail")).toContainText("Seneste afsluttede");
  await page.getByTestId("office-open-agent").click();
  await page.waitForURL(/\/aos\/agents\/agt_scout/);
  await expect(page.getByTestId("agent-versions")).toContainText("v1");

  await page.goto("/aos/activity");
  expect(await page.getByTestId("activity-item").count()).toBeGreaterThan(5);
});

test("Ny agentversion aktiveres først efter godkendelse", async ({ page }) => {
  await page.goto("/aos/agents/agt_nova");
  await page.getByTestId("agent-edit").click();
  const form = page.getByTestId("agent-version-form");
  await form.getByLabel("Instruktioner").fill("Du er Nova, tilbudsspecialist. Skriv korte, klare tilbudstekster. Priser beregnes altid af platformen.");
  await form.getByLabel("Hvad ændres og hvorfor?").fill("Kortere tilbudstekster");
  await page.getByTestId("agent-version-submit").click();
  await expect(page.getByText("Version 2 er oprettet og afventer godkendelse.")).toBeVisible();
  await expect(page.getByTestId("agent-instructions")).not.toContainText("korte, klare");

  await page.goto("/aos/approvals");
  const pending = page.getByTestId("approval-pending").filter({ hasText: "Nova v2" });
  await expect(pending).toContainText("Ændring af agent");
  await pending.getByTestId("approval-approve").click();
  await expect(page.getByTestId("approval-pending").filter({ hasText: "Nova v2" })).toHaveCount(0);

  await page.goto("/aos/agents/agt_nova");
  await expect(page.getByTestId("agent-instructions")).toContainText("korte, klare");
  await expect(page.getByTestId("agent-versions")).toContainText("Erstattet");
});

test("Deaktiveret agent får ingen opgaver; dyb research vises ærligt som utilgængelig i Demo Mode", async ({ page, request }) => {
  const { brands } = (await (await request.get("/api/research/brands")).json()) as { brands: Array<{ brand: { id: string } }> };
  const brandId = brands[0]?.brand.id;
  expect(brandId).toBeTruthy();

  expect((await request.patch("/api/aos/agents/agt_scout", { data: { enabled: false } })).ok()).toBe(true);
  try {
    const blocked = await request.post("/api/research/jobs", { data: { brandId } });
    expect(blocked.status()).toBe(409);
    expect((await blocked.json()).error.message).toContain("deaktiveret");
  } finally {
    await request.patch("/api/aos/agents/agt_scout", { data: { enabled: true } });
  }

  const deep = await request.post(`/api/research/brands/${brandId}/deep-research`, { data: {} });
  expect(deep.status()).toBe(202);
  const job = await deep.json();
  expect(job.status).toBe("blocked");
  expect(job.error.message).toContain("Demo Mode");
  expect(JSON.stringify(job)).not.toContain("tokenHash");
  // Callback uden gyldig nøgle afvises.
  expect((await request.post(`/api/aos/jobs/${job.id}/callback`, { data: { type: "progress", message: "x" }, headers: { authorization: "Bearer forkert" } })).status()).toBe(401);

  await page.goto(`/research/brands/${brandId}`);
  await expect(page.getByTestId("deep-research-unavailable")).toContainText("Demo Mode");
});

test("Integration Manager og Performance viser kun reelle data; mobil uden vandret scroll", async ({ page }) => {
  await page.goto("/aos/integrations");
  await expect(page.getByTestId("integration-claude_api")).toContainText("Mangler konfiguration");
  await expect(page.getByTestId("integration-elevenlabs")).toContainText("Planlagt");
  await page.getByTestId("integration-test-claude_code").click();
  await expect(page.getByTestId("integration-result-claude_code")).toContainText("CLAUDE_CODE_ROUTINE_RESEARCH_ID");
  await expect(page.locator("body")).not.toContainText(/sk-ant-|sb_secret_/);

  await page.goto("/aos/performance");
  await expect(page.getByTestId("agent-performance")).toContainText("Scout");
  await expect(page.getByTestId("engine-distribution")).toContainText("Intern software");

  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of ["/aos", "/aos/office", "/aos/jobs"]) {
    await page.goto(path);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  }
});
