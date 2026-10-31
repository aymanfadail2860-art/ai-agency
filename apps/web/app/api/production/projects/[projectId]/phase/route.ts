import { advancePhase } from "@agency/production/server";
import { json, route } from "@/lib/http";
import { ensureProductionWiring } from "@/lib/production";

export const dynamic = "force-dynamic";

/** Næste fase. Kritiske overgange (intern godkendelse, deployment) oprettes som godkendelse i AOS. */
export const POST = route<{ params: Promise<{ projectId: string }> }>(async (_req, { params }) => {
  ensureProductionWiring();
  return json(await advancePhase((await params).projectId));
});
