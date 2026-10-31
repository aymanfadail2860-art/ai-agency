import { simulateStep } from "@agency/production/server";
import { json, route } from "@/lib/http";
import { ensureProductionWiring } from "@/lib/production";

export const dynamic = "force-dynamic";

/** Guidet demo: simulerer den aktuelle fases arbejde (kun demoprojekter i Demo Mode). */
export const POST = route<{ params: Promise<{ projectId: string }> }>(async (_req, { params }) => {
  ensureProductionWiring();
  return json(await simulateStep((await params).projectId));
});
