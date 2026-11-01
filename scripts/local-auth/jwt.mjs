// KUN LOKAL TEST: signerer JWT'er til den lokale Supabase Auth-server (scripts/local-auth).
// Hemmeligheden er offentlig og bruges aldrig i produktion.
import { createHmac } from "node:crypto";

export const LOCAL_JWT_SECRET = "local-e2e-only-supabase-auth-jwt-secret-0001";
export const LOCAL_AUTH_URL = "http://127.0.0.1:54321";

const b64 = (v) => Buffer.from(typeof v === "string" ? v : JSON.stringify(v)).toString("base64url");

export function signLocalJwt(role, ttlSeconds = 10 * 365 * 24 * 3600) {
  const now = Math.floor(Date.now() / 1000);
  const head = b64({ alg: "HS256", typ: "JWT" });
  const body = b64({ iss: "supabase-local-e2e", role, iat: now, exp: now + ttlSeconds });
  const sig = createHmac("sha256", LOCAL_JWT_SECRET).update(`${head}.${body}`).digest("base64url");
  return `${head}.${body}.${sig}`;
}
