import { defineConfig, devices } from "@playwright/test";

/**
 * Live-test mod en deployet AI Agency-instans (fx Vercel).
 * Kør: LIVE_BASE_URL=https://<deployment> pnpm exec playwright test -c playwright.live.config.ts
 * Testen bruger kun de fiktive demovirksomheder.
 */
const baseURL = process.env.LIVE_BASE_URL;
if (!baseURL) throw new Error("Sæt LIVE_BASE_URL til den deployede adresse.");

export default defineConfig({
  testDir: "./tests/live",
  timeout: 180_000,
  expect: { timeout: 30_000 },
  workers: 1,
  reporter: [["list"]],
  use: { baseURL, acceptDownloads: true, trace: "off" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
  ],
});
