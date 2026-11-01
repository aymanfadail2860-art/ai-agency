import { json, route } from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * `dashboard.metric-datapoint@1` (push fra modulerne) blev ikke nødvendig: Dashboard
 * læser modulernes data direkte og beregner nøgletallene deterministisk.
 * Brug GET /api/dashboard. Push af datapunkter er ikke implementeret (501).
 */
function notImplemented() {
  return json({ error: { code: "not_implemented", message: "Dashboard modtager ikke datapunkter. Nøgletallene beregnes fra modulerne — brug GET /api/dashboard." }, contract: "dashboard.metric-datapoint@1", documentation: "docs/dashboard.md" }, 501);
}

export const GET = route(async () => notImplemented());
export const POST = route(async () => notImplemented());
