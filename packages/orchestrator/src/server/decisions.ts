import { publishEvent } from "@agency/core/server";
import type { Approval } from "../models";
import { agentRegistry } from "./agents";
import { recordDecision } from "./approvals";
import { onJobApprovalDecided, type Defer } from "./jobs";

/** Afgør en godkendelse og udfører konsekvensen (start job / aktivér version). */
export async function decideApproval(id: string, approved: boolean, note: string | null, options: { defer?: Defer } = {}): Promise<Approval> {
  const approval = await recordDecision(id, approved, note);
  if (approval.subject.aiJobId) await onJobApprovalDecided(approval.subject.aiJobId, approved, note, options);
  if (approval.subject.agentVersionId) await agentRegistry.decideVersion(approval.subject.agentVersionId, approved);
  await publishEvent({ type: "approval.decided", source: "aos", mode: approval.mode, subject: { aiJobId: approval.subject.aiJobId }, payload: { approvalId: id, approved, category: approval.category } });
  return approval;
}
