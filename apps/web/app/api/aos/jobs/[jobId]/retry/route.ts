import { after } from "next/server";
import { z } from "zod";
import { retryJob } from "@agency/orchestrator/server";
import { json, readJson, route } from "@/lib/http";
import { ensureExecutors } from "@/lib/orchestrator";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const POST = route<{ params: Promise<{ jobId: string }> }>(async (req, { params }) => {
  ensureExecutors();
  const body = z.object({ confirmPossibleDuplicate: z.boolean().default(false) }).parse(await readJson(req));
  return json(await retryJob((await params).jobId, { confirmPossibleDuplicate: body.confirmPossibleDuplicate, defer: after }));
});
