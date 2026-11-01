/**
 * Supabase Auth-konfiguration (kun server-side). Den offentlige nøgle
 * (publishable/anon) er ikke hemmelig, men holdes alligevel ude af browseren:
 * al login- og sessionshåndtering sker på serveren med httpOnly-cookies.
 */
export interface AuthConfig {
  url: string;
  key: string;
}

export function getAuthConfig(): AuthConfig | null {
  const url = (process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL)?.trim().replace(/\/$/, "");
  const key = (process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)?.trim();
  return url && key ? { url, key } : null;
}

export interface CookieWrite {
  name: string;
  value: string;
  options?: Record<string, unknown>;
}

/**
 * Sessionscookies er altid httpOnly (ingen JavaScript-adgang), SameSite=Lax og
 * Secure på https. Lokalt (http://localhost) kan Secure ikke bruges.
 */
export function hardenCookie(options: Record<string, unknown> | undefined, https: boolean): Record<string, unknown> {
  return { ...(options ?? {}), httpOnly: true, sameSite: "lax", secure: https, path: "/" };
}
