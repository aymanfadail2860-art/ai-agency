import { NextResponse, type NextRequest } from "next/server";

/**
 * Grundlæggende CSRF-beskyttelse: muterende API-kald skal komme fra samme
 * oprindelse. (Brugerlogin og adgangsstyring er ikke en del af V1.)
 */
export function middleware(req: NextRequest) {
  if (req.method !== "GET" && req.method !== "HEAD" && req.nextUrl.pathname.startsWith("/api/")) {
    const origin = req.headers.get("origin");
    if (origin) {
      const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
      let originHost: string | null = null;
      try {
        originHost = new URL(origin).host;
      } catch {
        originHost = null;
      }
      if (!originHost || originHost !== host) {
        return NextResponse.json({ error: { code: "forbidden", message: "Forespørgsler fra andre oprindelser er ikke tilladt." } }, { status: 403 });
      }
    }
  }
  return NextResponse.next();
}

export const config = { matcher: "/api/:path*" };
