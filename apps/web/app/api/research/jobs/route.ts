import { after } from "next/server";
import { StartResearchSchema, startResearch } from "@agency/research/server";
import { json, rateLimit, readJson, route } from "@/lib/http";

export const dynamic = "force-dynamic";
// Researchen kører i baggrunden via after(); giv funktionen tid til at blive færdig.
export const maxDuration = 60;

/** Starter en researchpipeline for et brand asynkront. Klienten poller GET /api/research/jobs/:id. */
export const POST = route(async (req) => {
  await rateLimit(req, "research", { limit: 10, windowMs: 60_000 });
  return json(await startResearch(StartResearchSchema.parse(await readJson(req)), { defer: after }), 202);
});
