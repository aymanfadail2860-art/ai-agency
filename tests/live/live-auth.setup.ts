import { expect, test as setup } from "@playwright/test";

/** Logger ind som administrator i den deployede platform (oplysningerne gives kun som miljøvariabler). */
setup("log ind som administrator", async ({ page }) => {
  const email = process.env.LIVE_ADMIN_EMAIL;
  const password = process.env.LIVE_ADMIN_PASSWORD;
  setup.skip(!email || !password, "Ingen administratoroplysninger — kun adgangstjekket kører.");
  await page.goto("/login");
  await page.getByTestId("login-email").fill(email!);
  await page.getByTestId("login-password").fill(password!);
  await page.getByTestId("login-submit").click();
  await page.waitForURL(/\/dashboard/);
  await expect(page.getByTestId("current-user")).toContainText(email!);
  await page.context().storageState({ path: "live-results/.admin-state.json" });
});
