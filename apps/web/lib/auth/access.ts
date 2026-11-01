/**
 * ADGANGSKLASSIFIKATION
 * ---------------------
 * Alt er beskyttet, medmindre det står på en af de snævre lister herunder
 * ("deny by default"). Bruges af middleware og testes mod samtlige routes i
 * kodebasen (apps/web/test/auth-coverage.test.ts), så en ny route aldrig
 * bliver offentlig ved en fejl.
 */
export type PathAccess = "public" | "machine" | "api" | "page";

/** Sider uden login: kun selve login-siden. */
export const PUBLIC_PAGES = ["/login"] as const;

/** API'er uden session: login og logout (logout skal virke med en udløbet session). */
export const PUBLIC_API = ["/api/auth/login", "/api/auth/logout"] as const;

/**
 * Maskine-til-maskine: kun Claude Code-callbacks (POST). De godkendes ikke med
 * en browsersession, men med jobbets egen engangsnøgle (256 bit, kun SHA-256-hash
 * gemt, udløb, konstant-tids sammenligning) i `handleCallback`.
 */
const MACHINE_API: Array<{ pattern: RegExp; methods: readonly string[] }> = [{ pattern: /^\/api\/aos\/jobs\/[A-Za-z0-9_-]+\/callback$/, methods: ["POST"] }];

/** Next.js' egne statiske filer — indeholder ingen data. */
const STATIC = /^\/(_next\/static|_next\/image|favicon\.ico$|robots\.txt$)/;

export function classifyPath(pathname: string, method = "GET"): PathAccess {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  if (STATIC.test(path)) return "public";
  if ((PUBLIC_PAGES as readonly string[]).includes(path)) return "public";
  if ((PUBLIC_API as readonly string[]).includes(path)) return "public";
  if (MACHINE_API.some((m) => m.pattern.test(path) && m.methods.includes(method.toUpperCase()))) return "machine";
  return path === "/api" || path.startsWith("/api/") ? "api" : "page";
}

/** Kun relative stier på samme oprindelse (forhindrer open redirect efter login). */
export function safeNextPath(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\") || next.startsWith("/api/") || next.startsWith("/login")) return "/dashboard";
  try {
    const url = new URL(next, "http://intern.invalid");
    if (url.origin !== "http://intern.invalid") return "/dashboard";
    return `${url.pathname}${url.search}`;
  } catch {
    return "/dashboard";
  }
}
