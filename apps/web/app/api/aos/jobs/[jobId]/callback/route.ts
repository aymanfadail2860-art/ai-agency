import { handleCallback } from "@agency/orchestrator/server";
import { json, rateLimit, readJson, route } from "@/lib/http";
import { ensureExecutors } from "@/lib/orchestrator";

export const dynamic = "force-dynamic";

/**
 * Tilbagemeldinger fra en Claude Code-session (protokol: routines/ai-agency-job.md).
 * Godkendes med jobbets engangsnøgle i `Authorization: Bearer …` — kun hash gemmes.
 * Indholdet behandles som data og valideres mod opgavetypens resultatskema.
 */
export const POST = route<{ params: Promise<{ jobId: string }> }>(async (req, { params }) => {
  ensureExecutors();
  const { jobId } = await params;
  await rateLimit(req, `callback:${jobId}`, { limit: 30, windowMs: 60_000 });
  return json(await handleCallback(jobId, req.headers.get("authorization"), await readJson(req)));
});
