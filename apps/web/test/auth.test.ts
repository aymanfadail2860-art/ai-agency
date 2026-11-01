import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { classifyPath, safeNextPath } from "../lib/auth/access";
import { hardenCookie } from "../lib/auth/config";
import { ACTIVE_ROLES, AGENCY_ROLES, hasPlatformAccess, roleOf } from "../lib/auth/roles";

const APP = path.join(__dirname, "../app");
function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name === "route.ts" || e.name === "page.tsx") out.push(p);
  }
  return out;
}
const urlOf = (f: string) =>
  "/" +
  path
    .relative(APP, path.dirname(f))
    .split(path.sep)
    .filter((s) => s && !/^\(.+\)$/.test(s))
    .map((s) => (s.startsWith("[") ? "x1" : s))
    .join("/");
const files = walk(APP);

describe("Adgangsklassifikation dækker samtlige routes (deny by default)", () => {
  it("alle sider er beskyttede undtagen /login", () => {
    const pages = files.filter((f) => f.endsWith("page.tsx")).map(urlOf);
    expect(pages.length).toBeGreaterThan(30);
    for (const url of pages) expect(classifyPath(url), url).toBe(url === "/login" ? "public" : "page");
  });

  it("alle API-routes kræver session — undtagen login/logout og Claude Code-callback (kun POST)", () => {
    const apis = files.filter((f) => f.endsWith("route.ts")).map(urlOf);
    for (const url of apis) {
      for (const method of ["GET", "POST", "PUT", "PATCH", "DELETE"]) {
        const expected = url === "/api/auth/login" || url === "/api/auth/logout" ? "public" : url === "/api/aos/jobs/x1/callback" && method === "POST" ? "machine" : "api";
        expect(classifyPath(url, method), `${method} ${url}`).toBe(expected);
      }
    }
  });

  it("hver route handler er pakket i route() — offentlige/maskine-varianter kun på de tilladte routes", () => {
    for (const f of files.filter((x) => x.endsWith("route.ts"))) {
      const src = fs.readFileSync(f, "utf8");
      const url = urlOf(f);
      for (const m of src.matchAll(/export (const|async function) (GET|POST|PUT|PATCH|DELETE)\b(.*)/g)) {
        const line = m[0];
        const allowedRaw = url === "/api/auth/login" && m[2] === "GET"; // 405-svar uden data
        if (allowedRaw) continue;
        expect(line, `${m[2]} ${url}`).toMatch(/= (route|publicRoute|machineRoute)[<(]/);
        if (/publicRoute/.test(line)) expect(["/api/auth/login", "/api/auth/logout"], url).toContain(url);
        if (/machineRoute/.test(line)) expect(url).toBe("/api/aos/jobs/x1/callback");
      }
    }
  });

  it("stier normaliseres, og varianter omgår ikke kontrollen", () => {
    expect(classifyPath("/login/")).toBe("public");
    expect(classifyPath("/login/../dashboard")).toBe("page");
    expect(classifyPath("/api/auth/login/x")).toBe("api");
    expect(classifyPath("/api/aos/jobs/aij_1/callback", "GET")).toBe("api");
    expect(classifyPath("/api/aos/jobs/aij_1/callback/x", "POST")).toBe("api");
    expect(classifyPath("/_next/static/chunk.js")).toBe("public");
    expect(classifyPath("/_nextfoo")).toBe("page");
  });
});

describe("Roller", () => {
  it("kun admin er aktiv; fremtidige roller giver bevidst ingen adgang endnu", () => {
    expect(ACTIVE_ROLES).toEqual(["admin"]);
    expect(hasPlatformAccess(roleOf({ app_metadata: { agency_role: "admin" } }))).toBe(true);
    for (const r of AGENCY_ROLES.filter((x) => x !== "admin")) expect(hasPlatformAccess(roleOf({ app_metadata: { agency_role: r } })), r).toBe(false);
  });
  it("rollen læses kun fra app_metadata (ikke user_metadata) og ukendte værdier afvises", () => {
    expect(roleOf({ app_metadata: {} })).toBeNull();
    expect(roleOf({ app_metadata: { agency_role: "superuser" } })).toBeNull();
    expect(roleOf({ app_metadata: { agency_role: ["admin"] } })).toBeNull();
    expect(roleOf({ user_metadata: { agency_role: "admin" } } as never)).toBeNull();
    expect(roleOf(null)).toBeNull();
  });
});

describe("Redirect efter login og cookies", () => {
  it("kun interne stier accepteres (ingen open redirect)", () => {
    expect(safeNextPath("/crm/companies?q=a")).toBe("/crm/companies?q=a");
    for (const bad of ["//evil.example", "https://evil.example", "/\\evil.example", "javascript:alert(1)", "/api/crm/accounts", "/login", "", null, undefined]) expect(safeNextPath(bad as string), String(bad)).toBe("/dashboard");
  });
  it("sessionscookies er altid httpOnly og SameSite=Lax, Secure på https", () => {
    expect(hardenCookie({ httpOnly: false, sameSite: "none", maxAge: 10 }, true)).toEqual({ httpOnly: true, sameSite: "lax", secure: true, path: "/", maxAge: 10 });
    expect(hardenCookie(undefined, false)).toMatchObject({ httpOnly: true, secure: false });
  });
});
