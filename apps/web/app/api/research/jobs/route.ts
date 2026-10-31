import { after } from "next/server";
import { json, rateLimit, readJson, route } from "@/lib/http";
import { aiJobSummary, startBrandResearchJob } from "@/lib/orchestrator";

export const dynamic = "force-dynamic";
// Researchen kører i baggrunden via after(); giv funktionen tid til at blive færdig.
export const maxDuration = 60;

/**
 * Starter research for et brand via Job Center: routeren vælger motor (Claude API
 * eller regelbaseret), og jobbet vises i AOS. Svaret er research-jobbet (som før)
 * plus `aiJob` med motor og begrundelse. Klienten poller GET /api/research/jobs/:id.
 */
export const POST = route(async (req) => {
  await rateLimit(req, "research", { limit: 10, windowMs: 60_000 });
  const { researchJob, aiJob } = await startBrandResearchJob(await readJson(req), after);
  if (!researchJob) return json({ id: null, status: aiJob.status, aiJob: aiJobSummary(aiJob) }, 202);
  return json({ ...researchJob, aiJob: aiJobSummary(aiJob) }, 202);
});
