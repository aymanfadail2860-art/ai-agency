import { after } from "next/server";
import { z } from "zod";
import { decideApproval } from "@agency/orchestrator/server";
import { json, readJson, route } from "@/lib/http";
import { ensureExecutors } from "@/lib/orchestrator";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Godkend eller afvis. Et godkendt job startes straks på den motor, routeren valgte. */
export const POST = route<{ params: Promise<{ approvalId: string }> }>(async (req, { params }) => {
  ensureExecutors();
  const body = z.object({ decision: z.enum(["approved", "rejected"]), note: z.string().trim().max(500).optional() }).parse(await readJson(req));
  return json(await decideApproval((await params).approvalId, body.decision === "approved", body.note || null, { defer: after }));
});
