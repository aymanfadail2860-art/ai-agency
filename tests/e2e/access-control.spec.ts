import fs from "node:fs";
import path from "node:path";
import { expect, test, type Browser, type Page } from "@playwright/test";

/**
 * V4.1 — Adgangsbeskyttelse mod en RIGTIG Supabase Auth-server (ingen mock).
 * Testene kører uden session (tom storageState), medmindre de selv logger ind.
 */
test.use({ storageState: { cookies: [], origins: [] } });

type Users = Record<"admin" | "second" | "norole" | "manager", { email: string; password: string }>;
const users = (): Users => JSON.parse(fs.readFileSync(path.join(__dirname, ".auth/users.json"), "utf8"));

// ─── Samtlige routes i kodebasen (læses fra filsystemet, så nye routes testes automatisk) ──
const APP_DIR = path.join(__dirname, "../../apps/web/app");
function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name === "route.ts" || e.name === "page.tsx") out.push(p);
  }
  return out;
}
const toUrl = (file: string) =>
  "/" +
  path
    .relative(APP_DIR, path.dirname(file))
    .split(path.sep)
    .filter((s) => s && !/^\(.+\)$/.test(s))
    .map((s) => (s.startsWith("[") ? "x_test_1" : s))
    .join("/");
const files = walk(APP_DIR);
const PAGES = files.filter((f) => f.endsWith("page.tsx")).map(toUrl).sort();
const APIS = files
  .filter((f) => f.endsWith("route.ts"))
  .map((f) => ({ url: toUrl(f), methods: Array.from(fs.readFileSync(f, "utf8").matchAll(/export (?:const|async function) (GET|POST|PUT|PATCH|DELETE)\b/g)).map((m) => m[1]!) }))
  .sort((a, b) => a.url.localeCompare(b.url));
const PUBLIC_API = new Set(["/api/auth/login", "/api/auth/logout"]);

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByTestId("login-email").fill(email);
  await page.getByTestId("login-password").fill(password);
  await page.getByTestId("login-submit").click();
}

async function freshAdmin(browser: Browser) {
  const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const page = await ctx.newPage();
  await login(page, users().second.email, users().second.password);
  await page.waitForURL(/\/dashboard/);
  return { ctx, page };
}

test("Alle interne sider sender en ikke-logget-ind bruger til login (med tilbagevenden)", async ({ request }) => {
  expect(PAGES.length).toBeGreaterThan(30);
  for (const url of PAGES) {
    const res = await request.get(url, { maxRedirects: 0 });
    if (url === "/login") {
      expect(res.status(), url).toBe(200);
      continue;
    }
    expect(res.status(), url).toBe(307);
    const location = res.headers()["location"] ?? "";
    expect(location, url).toContain("/login");
    if (url !== "/") expect(decodeURIComponent(location), url).toContain(`next=${url}`);
  }
});

test("Alle API-routes afviser uautoriserede kald med 401 JSON — GET og skriveoperationer", async ({ request }) => {
  expect(APIS.length).toBeGreaterThan(70);
  let checked = 0;
  for (const { url, methods } of APIS) {
    if (PUBLIC_API.has(url)) continue;
    for (const method of methods) {
      const res = await request.fetch(url, { method, data: method === "GET" ? undefined : { name: "x", status: "sent", action: "load" }, maxRedirects: 0 });
      expect(res.status(), `${method} ${url}`).toBe(401);
      expect(res.headers()["content-type"], `${method} ${url}`).toContain("application/json");
      const body = await res.json();
      expect(body.error.code, `${method} ${url}`).toBe("unauthorized");
      checked++;
    }
  }
  expect(checked).toBeGreaterThan(80);
});

test("Login afslører ikke, om en e-mail findes, og sætter ingen session ved fejl", async ({ page, context }) => {
  const u = users();
  await login(page, u.admin.email, "forkert-adgangskode");
  await expect(page.getByTestId("login-error")).toHaveText("E-mail eller adgangskode er forkert.");
  await login(page, "findes.ikke@e2e.local", "forkert-adgangskode");
  await expect(page.getByTestId("login-error")).toHaveText("E-mail eller adgangskode er forkert.");
  expect((await context.cookies()).filter((c) => c.name.startsWith("sb-"))).toHaveLength(0);
  // Ingen offentlig selvregistrering i brugerfladen.
  await expect(page.getByText(/opret konto|tilmeld/i)).toHaveCount(0);
});

test("Gyldig konto uden rolle — og den fremtidige manager-rolle — får ingen adgang", async ({ page, context }) => {
  const u = users();
  for (const who of [u.norole, u.manager]) {
    await login(page, who.email, who.password);
    await expect(page.getByTestId("login-error")).toContainText("har ikke adgang");
    expect((await context.cookies()).filter((c) => c.name.startsWith("sb-") && c.value)).toHaveLength(0);
  }
  expect((await page.request.get("/api/crm/accounts")).status()).toBe(401);
});

test("Administrator logger ind, kommer tilbage til den ønskede side og kan åbne alle seks moduler", async ({ page, context }) => {
  const u = users();
  await page.goto("/production?x=1");
  await page.waitForURL(/\/login\?next=%2Fproduction%3Fx%3D1/);
  await page.getByTestId("login-email").fill(u.second.email);
  await page.getByTestId("login-password").fill(u.second.password);
  await page.getByTestId("login-submit").click();
  await page.waitForURL(/\/production\?x=1$/);
  const session = (await context.cookies()).find((c) => c.name.startsWith("sb-") && c.name.includes("auth-token"));
  expect(session?.httpOnly).toBe(true);
  expect(session?.sameSite).toBe("Lax");
  for (const [route, heading] of [
    ["/research", "Research"],
    ["/crm", "CRM"],
    ["/quotes", "Tilbud"],
    ["/production", "Produktion & Levering"],
    ["/aos", "Command Center"],
    ["/dashboard", "Dashboard"],
    ["/settings", "Indstillinger"],
  ] as const) {
    await page.goto(route);
    await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
  }
  expect((await page.request.get("/api/crm/accounts")).status()).toBe(200);
  // Allerede logget ind: login-siden sender videre.
  await page.goto("/login?next=/crm");
  await page.waitForURL(/\/crm$/);
});

test("Login-redirect accepterer kun interne stier (ingen open redirect)", async ({ page }) => {
  const u = users();
  await page.goto("/login?next=//evil.example/steal");
  await page.getByTestId("login-email").fill(u.second.email);
  await page.getByTestId("login-password").fill(u.second.password);
  await page.getByTestId("login-submit").click();
  await page.waitForURL(/\/dashboard$/);
  expect(page.url()).not.toContain("evil.example");
});

test("Logout tilbagekalder sessionen — også gamle cookies afvises bagefter", async ({ browser }) => {
  const { ctx, page } = await freshAdmin(browser);
  const before = await ctx.cookies();
  expect((await page.request.get("/api/dashboard")).status()).toBe(200);
  await page.getByTestId("logout").click();
  await page.waitForURL(/\/login\?reason=logged_out/);
  await expect(page.getByTestId("login-notice")).toHaveText("Du er logget ud.");
  expect((await page.request.get("/api/dashboard")).status()).toBe(401);
  // Genbrug af de gamle cookies (fx stjålet) virker ikke: sessionen er tilbagekaldt hos Supabase Auth.
  // (Separate kontekster: serveren sletter de forældede cookies ved første afvisning.)
  const replayApi = await browser.newContext({ storageState: { cookies: before, origins: [] } });
  const res = await replayApi.request.get("/api/dashboard");
  expect(res.status()).toBe(401);
  expect((await res.json()).error.message).toContain("udløbet");
  expect((await replayApi.cookies()).filter((c) => c.name.startsWith("sb-") && c.value)).toHaveLength(0);
  await replayApi.close();
  const replayPage = await browser.newContext({ storageState: { cookies: before, origins: [] } });
  const p = await replayPage.newPage();
  await p.goto("/crm");
  await p.waitForURL(/\/login\?next=%2Fcrm&reason=expired/);
  await expect(p.getByTestId("login-notice")).toContainText("udløbet");
  await replayPage.close();
  await ctx.close();
});

test("Udløbet adgangstoken fornyes automatisk med refresh-tokenet (rigtig fornyelse hos Supabase Auth)", async ({ browser }) => {
  const { ctx } = await freshAdmin(browser);
  const cookie = (await ctx.cookies()).find((c) => c.name.startsWith("sb-") && c.name.endsWith("auth-token"))!;
  expect(cookie, "sessionscookie (ikke opdelt)").toBeTruthy();
  expect(cookie.value.startsWith("base64-")).toBe(true);
  const session = JSON.parse(Buffer.from(cookie.value.slice(7), "base64url").toString("utf8"));
  // Markér adgangstokenet som udløbet — klienten skal nu forny det hos Auth-serveren.
  session.expires_at = Math.floor(Date.now() / 1000) - 60;
  const expired = `base64-${Buffer.from(JSON.stringify(session)).toString("base64url")}`;
  const ctx2 = await browser.newContext({ storageState: { cookies: [{ ...cookie, value: expired }], origins: [] } });
  const res = await ctx2.request.get("/api/dashboard");
  expect(res.status()).toBe(200);
  const renewed = (await ctx2.cookies()).find((c) => c.name.endsWith("auth-token"))!;
  const next = JSON.parse(Buffer.from(renewed.value.slice(7), "base64url").toString("utf8"));
  // Rotation: en fornyelse udsteder altid et nyt refresh-token (adgangstokenet kan være identisk inden for samme sekund).
  expect(next.refresh_token).not.toBe(session.refresh_token);
  expect(next.expires_at).toBeGreaterThan(Math.floor(Date.now() / 1000));
  await ctx2.close();
  await ctx.close();
});

test("Ugyldig session midt i arbejdet sender brugeren til login og tilbage", async ({ browser }) => {
  const { ctx, page } = await freshAdmin(browser);
  await page.goto("/crm/companies");
  await page.getByTestId("new-account").click();
  await ctx.clearCookies();
  await page.getByTestId("account-name").fill("Udløbet Session ApS");
  await page.getByTestId("account-submit").click();
  await page.waitForURL(/\/login\?reason=expired&next=%2Fcrm%2Fcompanies/);
  await expect(page.getByTestId("login-notice")).toContainText("udløbet");
  await ctx.close();
});

test("Claude Code-callbacks kræver jobbets engangsnøgle — en browsersession er ikke nok", async ({ browser, request }) => {
  const res = await request.post("/api/aos/jobs/aij_findesikke/callback", { data: { type: "progress", message: "x" } });
  expect(res.status()).toBe(401);
  const { ctx } = await freshAdmin(browser);
  const withSession = await ctx.request.post("/api/aos/jobs/aij_findesikke/callback", { data: { type: "progress", message: "x" } });
  expect([401, 404]).toContain(withSession.status());
  await ctx.close();
});

test("Login er rate-limited pr. e-mail", async ({ request }) => {
  const email = `brute-${Date.now()}@e2e.local`;
  const statuses: number[] = [];
  for (let i = 0; i < 6; i++) statuses.push((await request.post("/api/auth/login", { data: { email, password: "forkert" } })).status());
  expect(statuses.slice(0, 5).every((s) => s === 401)).toBe(true);
  expect(statuses[5]).toBe(429);
});
