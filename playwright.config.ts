import path from "node:path";
import { defineConfig, devices } from "@playwright/test";
import { LOCAL_AUTH_URL, signLocalJwt } from "./scripts/local-auth/jwt.mjs";

const PORT = 3210;
const dataDir = path.join(__dirname, ".data-e2e");
export const ADMIN_STATE = path.join(__dirname, "tests/e2e/.auth/admin.json");

/**
 * E2E mod en RIGTIG Supabase Auth-server (det officielle supabase/auth-image i
 * Docker, scripts/local-auth) — ingen mock af login eller sessioner.
 * `setup` opretter testbrugere med tilfældige adgangskoder og logger ind som
 * administrator; alle øvrige tests kører med den session.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    acceptDownloads: true,
  },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    { name: "chromium", dependencies: ["setup"], use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 }, storageState: ADMIN_STATE } },
  ],
  webServer: [
    {
      command: "node scripts/local-auth/start.mjs",
      url: `${LOCAL_AUTH_URL}/auth/v1/health`,
      reuseExistingServer: false,
      timeout: 180_000,
      env: { LOCAL_AUTH_SITE_URL: `http://localhost:${PORT}` },
    },
    {
      // Kræver `pnpm build` først (test:e2e gør det automatisk). Starter med tom datamappe.
      command: `node -e "require('fs').rmSync('${dataDir.replace(/\\/g, "/")}',{recursive:true,force:true})" && pnpm --filter @agency/web exec next start -p ${PORT}`,
      url: `http://localhost:${PORT}/login`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        DATA_DIR: dataDir,
        PLATFORM_DEFAULT_MODE: "demo",
        ANTHROPIC_API_KEY: "",
        BRAVE_SEARCH_API_KEY: "",
        SUPABASE_URL: LOCAL_AUTH_URL,
        // Lokal anon-nøgle (kun til den lokale Auth-server). Ingen servernøgle → JSON-lagring.
        SUPABASE_PUBLISHABLE_KEY: signLocalJwt("anon"),
        SUPABASE_SECRET_KEY: "",
        SUPABASE_SERVICE_ROLE_KEY: "",
        // Hele suiten kører fra én klient; grænserne i drift er uændrede (60/min, 10 login/15 min).
        WRITE_RATE_LIMIT_PER_MINUTE: "600",
        LOGIN_RATE_LIMIT_PER_IP: "200",
      },
    },
  ],
});
