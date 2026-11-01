import { cookies, headers } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { User } from "@supabase/supabase-js";
import { AppError } from "@agency/shared";
import { getAuthConfig, hardenCookie } from "./config";
import { hasPlatformAccess, roleOf, type AgencyRole } from "./roles";

/**
 * Server-side sessionskontrol for route handlers og server-komponenter.
 * `getUser()` validerer adgangstokenet hos Supabase Auth ved hvert kald (ikke
 * kun lokalt dekodet), så en tilbagekaldt bruger eller rolle får effekt straks.
 */
export async function createSessionClient() {
  const config = getAuthConfig();
  if (!config) return null;
  const store = await cookies();
  const https = (await headers()).get("x-forwarded-proto") === "https";
  return createServerClient(config.url, config.key, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          for (const c of list) store.set(c.name, c.value, hardenCookie(c.options, https));
        } catch {
          // Server-komponenter må ikke sætte cookies — middleware har allerede fornyet sessionen.
        }
      },
    },
  });
}

export type AuthState =
  | { status: "authorized"; user: Pick<User, "id" | "email">; role: AgencyRole }
  | { status: "unauthenticated" }
  | { status: "forbidden"; user: Pick<User, "id" | "email"> }
  | { status: "unconfigured" };

export async function getAuthState(): Promise<AuthState> {
  const client = await createSessionClient();
  if (!client) return { status: "unconfigured" };
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return { status: "unauthenticated" };
  const role = roleOf(user);
  if (!hasPlatformAccess(role)) return { status: "forbidden", user: { id: user.id, email: user.email } };
  return { status: "authorized", user: { id: user.id, email: user.email }, role: role! };
}

/** Kastes i alle beskyttede API-routes (via `route()`). Fejler lukket. */
export async function requireAdmin(): Promise<Extract<AuthState, { status: "authorized" }>> {
  const state = await getAuthState();
  if (state.status === "authorized") return state;
  if (state.status === "unconfigured") throw new AppError("integration_not_configured", "Adgangskontrol er ikke konfigureret på serveren.");
  if (state.status === "forbidden") throw new AppError("forbidden", "Din konto har ikke adgang til denne handling.");
  throw new AppError("unauthorized", "Du er ikke logget ind, eller din session er udløbet.");
}
