import { getIntegrationStatus } from "@agency/integrations";
import { json, route } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Viser hvilke integrationer der er konfigureret — aldrig selve nøglerne. */
export const GET = route(async () => json({ integrations: getIntegrationStatus() }));
