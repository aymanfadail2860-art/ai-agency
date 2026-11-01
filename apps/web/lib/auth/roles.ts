/**
 * ROLLER (V4.1)
 * -------------
 * Rollen læses fra Supabase-brugerens `app_metadata.agency_role`. `app_metadata`
 * kan kun ændres med servernøglen eller i Supabase-dashboardet — aldrig af
 * brugeren selv (modsat `user_metadata`). En bruger uden rolle har ingen adgang,
 * selv med en gyldig session.
 *
 * Kun `admin` er aktiveret. De øvrige roller er et dokumenteret fremtidigt
 * design (docs/security.md) og giver bevidst INGEN adgang endnu, så en
 * halvfærdig rolle aldrig utilsigtet åbner platformen.
 */
export const AGENCY_ROLES = ["admin", "manager", "sales", "production", "viewer"] as const;
export type AgencyRole = (typeof AGENCY_ROLES)[number];

/** Roller med adgang til platformen i denne version. */
export const ACTIVE_ROLES: readonly AgencyRole[] = ["admin"];

export interface RoleCarrier {
  app_metadata?: Record<string, unknown> | null;
}

export function roleOf(user: RoleCarrier | null | undefined): AgencyRole | null {
  const raw = user?.app_metadata?.agency_role;
  return typeof raw === "string" && (AGENCY_ROLES as readonly string[]).includes(raw) ? (raw as AgencyRole) : null;
}

export function hasPlatformAccess(role: AgencyRole | null): boolean {
  return role !== null && ACTIVE_ROLES.includes(role);
}
