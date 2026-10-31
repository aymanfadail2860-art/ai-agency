import { after } from "next/server";
import { json, rateLimit, readJson, route } from "@/lib/http";
import { startDeepResearchJob } from "@/lib/orchestrator";

export const dynamic = "force-dynamic";

/** Starter dyb research via Claude Code-rutinen. Resultatet meldes tilbage til Job Center. */
export const POST = route<{ params: Promise<{ brandId: string }> }>(async (req, { params }) => {
  await rateLimit(req, "deep-research", { limit: 5, windowMs: 60_000 });
  const { brandId } = await params;
  return json(await startDeepResearchJob(brandId, await readJson(req), after), 202);
});
