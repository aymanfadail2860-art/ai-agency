import { cookies } from "next/headers";
import { json, publicRoute } from "@/lib/http";
import { createSessionClient } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/**
 * Logout: tilbagekalder sessionen hos Supabase Auth (refresh-token ugyldiggøres,
 * og adgangstokenet afvises af `getUser`) og sletter sessionscookies. Virker
 * også med en udløbet session.
 */
export const POST = publicRoute(async () => {
  const client = await createSessionClient();
  if (client) await client.auth.signOut({ scope: "local" }).catch(() => undefined);
  const store = await cookies();
  for (const c of store.getAll()) if (c.name.startsWith("sb-")) store.set(c.name, "", { maxAge: 0, path: "/" });
  return json({ ok: true });
});
