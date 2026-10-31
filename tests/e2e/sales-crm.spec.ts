import { expect, test, type Page } from "@playwright/test";

/**
 * Accepttest V3 etape 3 — CRM (Demo Mode).
 * Kører efter acceptance/aos/production-specs (der findes research, tilbud og projekter).
 * Intet her sender e-mails, ringer op eller starter betalte AI-opgaver.
 */

async function createCompany(page: Page, name: string, website: string) {
  await page.goto("/crm/companies");
  await page.getByTestId("new-account").click();
  await page.getByTestId("account-name").fill(name);
  await page.getByTestId("account-website").fill(website);
  await page.getByTestId("account-submit").click();
  await page.waitForURL(/\/crm\/companies\/acc_/);
  return page.url().match(/acc_[a-z0-9]+/)![0];
}

test("CRM-dashboard: klikbare KPI'er, separate pipelineværdier og periodefilter", async ({ page }) => {
  await page.goto("/research");
  await page.getByTestId("nav-crm").click();
  await expect(page.getByRole("heading", { level: 1, name: "CRM" })).toBeVisible();
  await expect(page.getByTestId("pending-notice")).toHaveCount(0);
  for (const key of ["new-leads", "active-leads", "qualified", "meetings", "open-quotes", "pipeline", "won", "lost", "customers", "follow-ups", "overdue"]) {
    await expect(page.getByTestId(`crm-kpi-${key}`)).toBeVisible();
  }
  await expect(page.getByTestId("pipeline-values")).toContainText("ENGANGSOMSÆTNING", { ignoreCase: true });
  await expect(page.getByTestId("pipeline-values")).toContainText("MRR", { ignoreCase: true });
  await page.getByTestId("crm-period").selectOption("7");
  await page.waitForURL(/period=7/);
  await page.getByTestId("crm-kpi-overdue").click();
  await page.waitForURL(/\/crm\/activities\?view=overdue/);
  await expect(page.getByRole("tab", { name: /Forsinkede/ })).toHaveAttribute("aria-selected", "true");
});

test("Virksomhed: oprettelse uden dubletter, kontakt, stamdata og 360-faner", async ({ page }) => {
  const id = await createCompany(page, "Testfirma CRM ApS", "testfirma-crm.example");
  await expect(page.getByTestId("company-360")).toBeVisible();
  // Samme domæne igen → eksisterende profil, ingen dublet.
  const again = await createCompany(page, "Testfirma CRM (dublet)", "https://www.testfirma-crm.example/");
  expect(again).toBe(id);
  await expect(page.getByText("ingen dublet oprettet")).toBeVisible();
  await page.goto("/crm/companies");
  await page.getByTestId("account-search").fill("testfirma");
  await expect(page.getByTestId("account-card")).toHaveCount(1);

  await page.goto(`/crm/companies/${id}`);
  await page.getByTestId("add-contact").click();
  await page.getByTestId("contact-name").fill("Karen Kontakt");
  await page.getByTestId("contact-email").fill("karen@testfirma-crm.example");
  await page.getByTestId("contact-submit").click();
  await expect(page.getByTestId("contact-row")).toContainText("Karen Kontakt");

  await page.getByTestId("edit-account").click();
  await page.locator("#acc-cvr").fill("123");
  await page.getByTestId("save-account").click();
  await expect(page.getByTestId("account-edit-form")).toContainText(/CVR|8 cifre|Ugyldig/i);
  await page.locator("#acc-cvr").fill("");
  await page.getByTestId("edit-status").selectOption("working");
  await page.getByTestId("edit-tags").fill("e2e, restaurant");
  await page.getByTestId("save-account").click();
  await expect(page.getByTestId("company-360").locator('[data-account-status="working"]').first()).toBeVisible();

  for (const tab of ["research", "opportunities", "quotes", "projects", "activities", "finance", "documents", "overview"]) {
    await page.getByTestId(`tab-${tab}`).click();
    if (tab !== "overview") await expect(page).toHaveURL(new RegExp(`tab=${tab}`));
  }
  await expect(page.getByTestId("echo-panel")).toContainText("Afventer implementering");
});

test("Aktiviteter: planlæg, afslut med resultat og vis som tidslinje", async ({ page }) => {
  await page.goto("/crm/companies");
  await page.getByTestId("account-search").fill("testfirma");
  await page.getByTestId("account-card").first().click();
  await page.waitForURL(/\/crm\/companies\/acc_/);
  await page.getByTestId("tab-activities").click();
  await page.getByTestId("activity-kind").selectOption("meeting");
  await page.getByTestId("activity-subject").fill("Behovsmøde (e2e)");
  await page.getByTestId("activity-submit").click();
  const row = page.getByTestId("activity-row").filter({ hasText: "Behovsmøde (e2e)" });
  await expect(row).toHaveAttribute("data-activity-status", "planned");
  await row.getByTestId("complete-activity").click();
  await row.getByPlaceholder("Resultat").fill("Klar til tilbud");
  await row.getByTestId("save-complete").click();
  await expect(page.getByTestId("activity-row").filter({ hasText: "Behovsmøde (e2e)" })).toHaveAttribute("data-activity-status", "done");

  await page.goto("/crm/activities");
  await page.getByTestId("layout-timeline").click();
  await expect(page.getByTestId("activity-timeline")).toContainText("Behovsmøde (e2e)");
  await page.getByTestId("activity-kind-filter").selectOption("call");
  await expect(page.getByText("Behovsmøde (e2e)")).toHaveCount(0);
});

test("CRM → Tilbud → CRM → Produktion: tilbud vinder ikke alene, accept opretter ét projekt", async ({ page, request }) => {
  await page.goto("/crm/companies");
  await page.getByTestId("account-search").fill("testfirma");
  await page.getByTestId("account-card").first().click();
  await page.waitForURL(/\/crm\/companies\/acc_/);
  const accountId = page.url().match(/acc_[a-z0-9]+/)![0];
  await page.getByTestId("tab-opportunities").click();
  await page.getByTestId("new-opportunity").click();
  await page.getByTestId("opportunity-form").getByText("AI-chatbot", { exact: true }).click();
  await expect(page.getByTestId("opportunity-impl")).not.toHaveValue("0");
  await page.getByTestId("opportunity-title").fill("Chatbot til Testfirma");
  await page.getByTestId("opportunity-submit").click();
  const card = page.getByTestId("account-opportunity").filter({ hasText: "Chatbot til Testfirma" });
  await card.getByTestId("create-quote").click();
  await expect(card.getByTestId("opportunity-quote-link")).toContainText("Udkast");

  // Tilbud oprettet → stadig ikke vundet.
  await page.getByTestId("tab-quotes").click();
  await page.getByTestId("mark-quote-sent").click();
  await expect(page.getByTestId("account-quote").first()).toHaveAttribute("data-quote-status", "sent");
  await page.getByTestId("tab-opportunities").click();
  await expect(card).toHaveAttribute("data-opportunity-stage", "quote_sent");

  // Tilbudssiden viser CRM-koblingen.
  await card.getByTestId("opportunity-quote-link").click();
  await page.waitForURL(/\/quotes\/qte_/);
  await expect(page.getByTestId("quote-crm-opportunity")).toContainText("Chatbot til Testfirma");
  await page.getByTestId("quote-crm-opportunity").click();
  await page.waitForURL(/tab=opportunities/);

  await card.getByTestId("win-opportunity").click();
  await expect(page.getByTestId("transfer-production")).toBeChecked();
  await page.getByTestId("confirm-close").click();
  await expect(card).toHaveAttribute("data-opportunity-stage", "won");
  await expect(card.getByTestId("opportunity-project-link")).toBeVisible();
  await expect(page.getByTestId("account-status-badge").or(page.locator('[data-account-status="customer"]')).first()).toBeVisible();

  // Idempotent: endnu et "vundet"-kald opretter ikke et nyt projekt.
  const before = await (await request.get(`/api/crm/accounts/${accountId}`)).json();
  const opp = before.opportunities.find((o: { title: string }) => o.title === "Chatbot til Testfirma");
  expect((await request.post(`/api/crm/opportunities/${opp.id}/win`, { data: {} })).status()).toBe(200);
  const after = await (await request.get(`/api/crm/accounts/${accountId}`)).json();
  expect(after.projects).toHaveLength(before.projects.length);
  expect(after.projects).toHaveLength(1);

  await card.getByTestId("opportunity-project-link").click();
  await page.waitForURL(/\/production\/projects\/prj_/);
  await page.getByTestId("project-crm-link").click();
  await page.waitForURL(/tab=projects/);
  await expect(page.getByTestId("account-project")).toHaveCount(1);
});

test("Pipeline: Kanban-flytning og tabt kræver begrundelse", async ({ page }) => {
  const id = await createCompany(page, "Pipeline Test ApS", "pipeline-test.example");
  await page.goto("/crm/pipeline");
  await page.getByTestId("new-opportunity").click();
  await page.locator("#opp-account").selectOption(id);
  await page.getByTestId("opportunity-title").fill("Pipeline-test");
  await page.getByTestId("opportunity-submit").click();
  const card = page.getByTestId("opportunity-card").filter({ hasText: "Pipeline-test" });
  await expect(card).toHaveAttribute("data-opportunity-stage", "qualified");
  // Træk-og-slip til "Kontaktet" (synlig kolonne), derefter flyt via menuen til "Møde booket".
  await card.scrollIntoViewIfNeeded();
  await card.dragTo(page.getByTestId("stage-contacted"));
  await expect(page.getByTestId("stage-contacted").getByTestId("opportunity-card").filter({ hasText: "Pipeline-test" })).toBeVisible();
  await page.getByTestId("opportunity-card").filter({ hasText: "Pipeline-test" }).getByTestId("move-stage").selectOption("meeting_booked");
  await expect(page.getByTestId("stage-meeting_booked").getByTestId("opportunity-card").filter({ hasText: "Pipeline-test" })).toBeVisible();
  // Tabt via dialog — kræver begrundelse.
  await page.getByTestId("opportunity-card").filter({ hasText: "Pipeline-test" }).getByTestId("move-stage").selectOption("lost");
  await expect(page.getByTestId("confirm-close")).toBeDisabled();
  await page.getByTestId("lost-reason").fill("Valgte en anden leverandør");
  await page.getByTestId("confirm-close").click();
  await expect(page.getByTestId("opportunity-card").filter({ hasText: "Pipeline-test" })).toHaveCount(0);
  await page.getByTestId("pipeline-status").selectOption("lost");
  await expect(page.getByTestId("stage-lost").getByTestId("opportunity-card").filter({ hasText: "Pipeline-test" })).toBeVisible();
});

test("Research → CRM: start salgsmulighed fra rapportens anbefalinger", async ({ page, request }) => {
  const { brands } = await (await request.get("/api/research/brands")).json();
  // Bryggeriet Nordlys reserveres til den guidede demo (som ikke ændrer almindelige CRM-data).
  const withReport = brands.find((b: { brand: { name: string }; latestReport: { id: string } | null }) => b.latestReport && b.brand.name !== "Bryggeriet Nordlys");
  expect(withReport).toBeTruthy();
  await page.goto(`/research/reports/${withReport.latestReport.id}`);
  await expect(page.getByTestId("report-crm-panel")).toBeVisible();
  await page.getByTestId("report-start-opportunity").click();
  await page.waitForURL(/\/crm\/companies\/acc_.*tab=opportunities/);
  await expect(page.getByTestId("account-opportunity").first()).toHaveAttribute("data-opportunity-stage", "research");
  await page.getByTestId("tab-research").click();
  await expect(page.getByTestId("research-reports")).toBeVisible();
  // Rapporten viser nu, at kunden er i CRM — ingen ny virksomhed ved næste klik.
  await page.goto(`/research/reports/${withReport.latestReport.id}`);
  await expect(page.getByTestId("open-crm-account")).toBeVisible();
});

test("Echo-opgave registreres i AOS og blokeres ærligt (ikke implementeret, ingen betalt AI)", async ({ page }) => {
  await page.goto("/crm/companies");
  await page.getByTestId("account-search").fill("testfirma");
  await page.getByTestId("account-card").first().click();
  await page.waitForURL(/\/crm\/companies\/acc_/);
  await page.getByTestId("ai-task-crm.meeting_prep").click();
  await expect(page.getByTestId("echo-panel")).toContainText("blokeret");
  await page.getByTestId("ai-job-link").first().click();
  await page.waitForURL(/\/aos\/jobs\//);
});

test("Guidet CRM-demo: 12 trin og nulstilling", async ({ page, request }) => {
  await page.goto("/crm");
  const progress = page.getByTestId("crm-demo-progress");
  if ((await progress.textContent())?.startsWith("12")) {
    await page.getByTestId("crm-demo-reset").click();
    await expect(progress).toContainText("0 af 12");
  }
  for (let i = 1; i <= 12; i++) {
    await page.getByTestId("crm-demo-next").click();
    await expect(progress).toContainText(`${i} af 12`, { timeout: 30_000 });
  }
  await expect(page.locator('[data-demo-done="true"]')).toHaveCount(12);
  await page.getByTestId("crm-demo-account").click();
  await expect(page.getByTestId("company-360")).toContainText("Bryggeriet Nordlys");
  await expect(page.locator('[data-account-status="customer"]').first()).toBeVisible();
  await page.getByTestId("tab-opportunities").click();
  await expect(page.locator('[data-testid="account-opportunity"][data-opportunity-stage="won"]')).toHaveCount(1);
  await page.getByTestId("tab-projects").click();
  await expect(page.getByTestId("account-project")).toHaveCount(1);

  await page.goto("/crm");
  await page.getByTestId("crm-demo-reset").click();
  await expect(progress).toContainText("0 af 12");
  const accounts = await (await request.get("/api/crm/accounts")).json();
  expect(accounts.filter((a: { account: { isDemo: boolean } }) => a.account.isDemo)).toHaveLength(0);
});

test("CRM på mobil: ingen vandret overløb", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of ["/crm", "/crm/companies", "/crm/pipeline", "/crm/activities"]) {
    await page.goto(path);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBe(0);
  }
});
