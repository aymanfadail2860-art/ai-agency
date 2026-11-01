import { expect, test } from "@playwright/test";

/** Adgangstjek mod den deployede platform UDEN login — kræver ingen oplysninger og ændrer intet. */
test.use({ storageState: { cookies: [], origins: [] } });

const PAGES = ["/", "/research", "/crm", "/crm/companies", "/quotes", "/production", "/aos", "/aos/jobs", "/aos/approvals", "/dashboard", "/dashboard/finance", "/settings"];
const APIS: Array<[string, string]> = [
  ["GET", "/api/dashboard"],
  ["GET", "/api/crm/accounts"],
  ["GET", "/api/quotes"],
  ["GET", "/api/production/projects"],
  ["GET", "/api/aos/jobs"],
  ["GET", "/api/aos/approvals"],
  ["GET", "/api/aos/integrations"],
  ["GET", "/api/settings"],
  ["GET", "/api/research/brands"],
  ["GET", "/api/dashboard/demo"],
  ["POST", "/api/crm/accounts"],
  ["POST", "/api/dashboard/demo"],
  ["PUT", "/api/settings"],
  ["DELETE", "/api/catalog/svc_ai_chatbot"],
];

test("Uden login: sider sender til login, API'er svarer 401 JSON", async ({ request }) => {
  for (const url of PAGES) {
    const res = await request.get(url, { maxRedirects: 0 });
    expect(res.status(), url).toBe(307);
    expect(res.headers()["location"], url).toContain("/login");
  }
  for (const [method, url] of APIS) {
    const res = await request.fetch(url, { method, data: method === "GET" ? undefined : {}, maxRedirects: 0 });
    expect(res.status(), `${method} ${url}`).toBe(401);
    expect((await res.json()).error.code, `${method} ${url}`).toBe("unauthorized");
  }
  const login = await request.get("/login");
  expect(login.status()).toBe(200);
  expect(await login.text()).toContain("Log ind");
  const bad = await request.post("/api/auth/login", { data: { email: "findes.ikke@example.invalid", password: "forkert-adgangskode" } });
  expect(bad.status()).toBe(401);
  expect((await bad.json()).error.message).toBe("E-mail eller adgangskode er forkert.");
});
