import { after } from "next/server";
import { sendTaskToJobCenter } from "@agency/production/server";
import { json, rateLimit, route } from "@/lib/http";
import { ensureExecutors } from "@/lib/orchestrator";

export const dynamic = "force-dynamic";

/** Sender opgaven til AOS' fælles Job Center; routeren afgør motor (eller blokerer med begrundelse). */
export const POST = route<{ params: Promise<{ projectId: string; taskId: string }> }>(async (req, { params }) => {
  ensureExecutors();
  await rateLimit(req, "production-job", { limit: 10, windowMs: 60_000 });
  const { projectId, taskId } = await params;
  return json(await sendTaskToJobCenter(projectId, taskId, after), 202);
});
