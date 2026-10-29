import { after } from "next/server";
import { StartResearchSchema, startResearch } from "@agency/research/server";
import { json, rateLimit, readJson, route } from "@/lib/http";

export const dynamic = "force-dynamic";
// Researchen kører i baggrunden via after(); giv funktionen tid til at blive færdig.
export const maxDuration = 60;

/** Starter en researchpipeline asynkront. Klienten poller GET /api/research/jobs/:id. */
export const POST = route(async (req) => {
  rateLimit(req, "research", { limit: 10, windowMs: 60_000 });
  const body = StartResearchSchema.parse(await readJson(req));
  return json(await startResearch(body.companyId, body.websiteUrl ?? null, { defer: after }), 202);
});
