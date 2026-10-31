import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

const PORT = 3210;
const dataDir = path.join(__dirname, ".data-e2e");

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
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } }],
  webServer: {
    // Kræver `pnpm build` først (test:e2e gør det automatisk). Starter med tom datamappe.
    command: `node -e "require('fs').rmSync('${dataDir.replace(/\\/g, "/")}',{recursive:true,force:true})" && pnpm --filter @agency/web exec next start -p ${PORT}`,
    url: `http://localhost:${PORT}/research`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      DATA_DIR: dataDir,
      PLATFORM_DEFAULT_MODE: "demo",
      ANTHROPIC_API_KEY: "",
      BRAVE_SEARCH_API_KEY: "",
      // Hele suiten kører fra én klient; grænsen i drift er uændret (60/min).
      WRITE_RATE_LIMIT_PER_MINUTE: "600",
    },
  },
});
