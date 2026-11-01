import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { classifyPath } from "@/lib/auth/access";
import { getAuthConfig, hardenCookie } from "@/lib/auth/config";
import { hasPlatformAccess, roleOf } from "@/lib/auth/roles";

/**
 * ADGANGSKONTROL (V4.1) — første forsvarslinje for HELE platformen.
 *
 *  1. CSRF: muterende API-kald skal komme fra samme oprindelse.
 *  2. Alt er beskyttet, undtagen login/logout og Claude Code-callbacks (egen engangsnøgle).
 *  3. Sessionen valideres hos Supabase Auth (`getUser`) og fornyes automatisk.
 *  4. Kun brugere med en aktiv rolle (i dag: admin) får adgang.
 *
 * Sider sendes til /login; API'er svarer 401/403/503 som JSON — aldrig HTML.
 * Route handlers og layoutet kontrollerer adgangen igen (forsvar i dybden).
 */
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isApi = pathname.startsWith("/api/");

  if (isApi && req.method !== "GET" && req.method !== "HEAD") {
    const origin = req.headers.get("origin");
    if (origin) {
      const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
      let originHost: string | null = null;
      try {
        originHost = new URL(origin).host;
      } catch {
        originHost = null;
      }
      if (!originHost || originHost !== host) return apiError(403, "forbidden", "Forespørgsler fra andre oprindelser er ikke tilladt.");
    }
  }

  const access = classifyPath(pathname, req.method);
  if (access === "public" || access === "machine") return NextResponse.next();

  const config = getAuthConfig();
  if (!config) {
    return isApi ? apiError(503, "auth_not_configured", "Adgangskontrol er ikke konfigureret på serveren.") : redirectToLogin(req, "config");
  }

  const https = req.nextUrl.protocol === "https:" || req.headers.get("x-forwarded-proto") === "https";
  let res = NextResponse.next({ request: req });
  const supabase = createServerClient(config.url, config.key, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (list) => {
        for (const c of list) req.cookies.set(c.name, c.value);
        res = NextResponse.next({ request: req });
        for (const c of list) res.cookies.set(c.name, c.value, hardenCookie(c.options, https));
      },
    },
  });

  let user = null;
  try {
    ({
      data: { user },
    } = await supabase.auth.getUser());
  } catch {
    user = null; // Auth utilgængelig → fejl lukket
  }

  if (!user) {
    const hadSession = req.cookies.getAll().some((c) => c.name.startsWith("sb-"));
    const out = isApi ? apiError(401, "unauthorized", hadSession ? "Din session er udløbet. Log ind igen." : "Du er ikke logget ind.") : redirectToLogin(req, hadSession ? "expired" : null);
    // Fjern forældede sessionscookies.
    for (const c of req.cookies.getAll()) if (c.name.startsWith("sb-")) out.cookies.set(c.name, "", { maxAge: 0, path: "/" });
    return out;
  }

  if (!hasPlatformAccess(roleOf(user))) {
    return isApi ? apiError(403, "forbidden", "Din konto har ikke adgang til AI Agency.") : redirectToLogin(req, "forbidden");
  }

  res.headers.set("cache-control", "private, no-store");
  return res;
}

function apiError(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status, headers: { "cache-control": "no-store" } });
}

function redirectToLogin(req: NextRequest, reason: "config" | "expired" | "forbidden" | null) {
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  const next = `${req.nextUrl.pathname}${req.nextUrl.search}`;
  if (next !== "/") url.searchParams.set("next", next);
  if (reason) url.searchParams.set("reason", reason);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt).*)"],
};
