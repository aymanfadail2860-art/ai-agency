import { defineConfig, devices } from "@playwright/test";

/**
 * Live-test mod en deployet AI Agency-instans (fx Vercel).
 * Kør: LIVE_BASE_URL=https://<deployment> pnpm exec playwright test -c playwright.live.config.ts
 * Testen bruger kun de fiktive demovirksomheder.
 * V4.1: Adgangstjekket (access.spec.ts) kræver intet. Den fulde test kræver
 * LIVE_ADMIN_EMAIL og LIVE_ADMIN_PASSWORD (gives kun som miljøvariabler — aldrig i repoet).
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
    // Adgangstjek uden login (altid).
    { name: "access", testMatch: /access\.spec\.ts/, use: { ...devices["Desktop Chrome"] } },
    // Fuld live-test med administratorsession (kun med LIVE_ADMIN_EMAIL/LIVE_ADMIN_PASSWORD).
    { name: "setup", testMatch: /live-auth\.setup\.ts/ },
    { name: "desktop", testMatch: /live\.spec\.ts/, dependencies: ["setup"], use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 }, storageState: process.env.LIVE_ADMIN_EMAIL ? "live-results/.admin-state.json" : undefined } },
  ],
});
