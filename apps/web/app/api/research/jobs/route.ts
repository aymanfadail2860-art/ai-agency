import { StartResearchSchema, startResearch } from "@agency/research/server";
import { json, rateLimit, readJson, route } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Starter en researchpipeline asynkront. Klienten poller GET /api/research/jobs/:id. */
export const POST = route(async (req) => {
  rateLimit(req, "research", { limit: 10, windowMs: 60_000 });
  const body = StartResearchSchema.parse(await readJson(req));
  return json(await startResearch(body.companyId, body.websiteUrl ?? null), 202);
});
