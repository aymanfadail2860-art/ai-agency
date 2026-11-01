import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { expect, test as setup } from "@playwright/test";
import { LOCAL_AUTH_URL, signLocalJwt } from "../../scripts/local-auth/jwt.mjs";

/**
 * Opretter testbrugere i den RIGTIGE lokale Supabase Auth-server via dens
 * admin-API (service_role) — samme mekanisme som Supabase-dashboardet bruger —
 * og logger ind som administrator gennem login-siden. Adgangskoderne er
 * tilfældige pr. kørsel og gemmes kun i den git-ignorerede mappe .auth/.
 */
const dir = path.join(__dirname, ".auth");
export const USERS_FILE = path.join(dir, "users.json");

async function createUser(email: string, password: string, role: string | null) {
  const svc = signLocalJwt("service_role", 3600);
  const res = await fetch(`${LOCAL_AUTH_URL}/auth/v1/admin/users`, {
    method: "POST",
    headers: { authorization: `Bearer ${svc}`, apikey: svc, "content-type": "application/json" },
    body: JSON.stringify({ email, password, email_confirm: true, app_metadata: role ? { agency_role: role } : {} }),
  });
  expect(res.status, await res.clone().text()).toBe(200);
}

setup("opret testbrugere og log ind som administrator", async ({ page }) => {
  fs.mkdirSync(dir, { recursive: true });
  const pw = () => `E2e-${randomBytes(18).toString("base64url")}`;
  const users = {
    admin: { email: "admin@e2e.local", password: pw() },
    second: { email: "admin2@e2e.local", password: pw() },
    norole: { email: "norole@e2e.local", password: pw() },
    manager: { email: "manager@e2e.local", password: pw() },
  };
  await createUser(users.admin.email, users.admin.password, "admin");
  await createUser(users.second.email, users.second.password, "admin");
  await createUser(users.norole.email, users.norole.password, null);
  // Fremtidig rolle — må IKKE give adgang endnu.
  await createUser(users.manager.email, users.manager.password, "manager");
  fs.writeFileSync(USERS_FILE, JSON.stringify(users), { mode: 0o600 });

  await page.goto("/research");
  await page.waitForURL(/\/login\?next=%2Fresearch/);
  await page.getByTestId("login-email").fill(users.admin.email);
  await page.getByTestId("login-password").fill(users.admin.password);
  await page.getByTestId("login-submit").click();
  await page.waitForURL(/\/research$/);
  await expect(page.getByTestId("current-user")).toContainText(users.admin.email);
  await page.context().storageState({ path: path.join(dir, "admin.json") });
});
