// KUN LOKAL TEST — starter den officielle Supabase Auth-server (supabase/auth) med
// Postgres i Docker og eksponerer den under samme sti som Supabase (/auth/v1),
// så platformen og e2e-testene taler med en rigtig Auth-server (ingen mock).
// Bruges af playwright.config.ts (webServer). Kræver Docker.
import { execFileSync } from "node:child_process";
import http from "node:http";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { LOCAL_JWT_SECRET } from "./jwt.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const DB = "ai-agency-e2e-auth-db";
const AUTH = "ai-agency-e2e-auth";
const PG_PORT = 55432;
const AUTH_PORT = 59999;
const PROXY_PORT = 54321;
const AUTH_IMAGE = process.env.LOCAL_AUTH_IMAGE ?? "supabase/auth:v2.178.0";
const SITE_URL = process.env.LOCAL_AUTH_SITE_URL ?? "http://localhost:3210";
const JWT_EXP = process.env.LOCAL_AUTH_JWT_EXP ?? "3600";

const docker = (...args) => execFileSync("docker", args, { stdio: ["ignore", "pipe", "pipe"] }).toString().trim();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

for (const name of [AUTH, DB]) {
  try {
    docker("rm", "-f", name);
  } catch {}
}

docker("run", "-d", "--name", DB, "--network", "host", "-e", "POSTGRES_PASSWORD=local-e2e-postgres", "-v", `${join(here, "init.sql")}:/docker-entrypoint-initdb.d/init.sql:ro`, "postgres:15-alpine", "-p", String(PG_PORT));
for (let i = 0; ; i++) {
  try {
    docker("exec", DB, "pg_isready", "-h", "127.0.0.1", "-p", String(PG_PORT), "-U", "postgres");
    // Init-scriptet kører, før serveren lytter på TCP — vent på at rollen findes.
    docker("exec", DB, "psql", "-h", "127.0.0.1", "-p", String(PG_PORT), "-U", "postgres", "-tAc", "select 1 from pg_roles where rolname='supabase_auth_admin'");
    break;
  } catch {
    if (i > 60) throw new Error("Postgres startede ikke.");
    await sleep(1000);
  }
}

docker(
  "run", "-d", "--name", AUTH, "--network", "host",
  "-e", `GOTRUE_API_HOST=127.0.0.1`, "-e", `PORT=${AUTH_PORT}`, "-e", `API_EXTERNAL_URL=http://127.0.0.1:${PROXY_PORT}/auth/v1`,
  "-e", "GOTRUE_DB_DRIVER=postgres", "-e", `DATABASE_URL=postgres://supabase_auth_admin:local-e2e-auth@127.0.0.1:${PG_PORT}/postgres`,
  "-e", `GOTRUE_SITE_URL=${SITE_URL}`, "-e", `GOTRUE_JWT_SECRET=${LOCAL_JWT_SECRET}`, "-e", `GOTRUE_JWT_EXP=${JWT_EXP}`,
  "-e", "GOTRUE_JWT_AUD=authenticated", "-e", "GOTRUE_JWT_ADMIN_ROLES=service_role", "-e", "GOTRUE_JWT_DEFAULT_GROUP_NAME=authenticated",
  // Samme sikre indstillinger som produktionen skal have: ingen selvregistrering.
  "-e", "GOTRUE_DISABLE_SIGNUP=true", "-e", "GOTRUE_EXTERNAL_EMAIL_ENABLED=true", "-e", "GOTRUE_MAILER_AUTOCONFIRM=true",
  "-e", "GOTRUE_SECURITY_REFRESH_TOKEN_ROTATION_ENABLED=true", "-e", "GOTRUE_RATE_LIMIT_EMAIL_SENT=100",
  AUTH_IMAGE, "auth",
);
for (let i = 0; ; i++) {
  try {
    const r = await fetch(`http://127.0.0.1:${AUTH_PORT}/health`);
    if (r.ok) break;
  } catch {}
  if (i > 90) {
    console.error(docker("logs", "--tail", "40", AUTH));
    throw new Error("Supabase Auth startede ikke.");
  }
  await sleep(1000);
}

// Samme URL-form som Supabase: <projekt>/auth/v1/* → Auth-serveren.
const server = http.createServer((req, res) => {
  if (!req.url?.startsWith("/auth/v1/")) {
    res.writeHead(404).end();
    return;
  }
  const upstream = http.request({ host: "127.0.0.1", port: AUTH_PORT, method: req.method, path: req.url.slice("/auth/v1".length), headers: { ...req.headers, host: `127.0.0.1:${AUTH_PORT}` } }, (up) => {
    res.writeHead(up.statusCode ?? 502, up.headers);
    up.pipe(res);
  });
  upstream.on("error", () => res.writeHead(502).end());
  req.pipe(upstream);
});
server.listen(PROXY_PORT, "127.0.0.1", () => console.log(`Lokal Supabase Auth klar på http://127.0.0.1:${PROXY_PORT}/auth/v1`));

const stop = () => {
  server.close();
  for (const name of [AUTH, DB]) {
    try {
      docker("rm", "-f", name);
    } catch {}
  }
  process.exit(0);
};
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
