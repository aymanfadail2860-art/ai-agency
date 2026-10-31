import { publishEvent } from "@agency/core/server";
import type { Approval } from "../models";
import { agentRegistry } from "./agents";
import { recordDecision } from "./approvals";
import { onJobApprovalDecided, type Defer } from "./jobs";

type ApprovalRef = NonNullable<Approval["subject"]["ref"]>;
export type ApprovalHandler = (ref: ApprovalRef, approval: Approval, approved: boolean, note: string | null) => Promise<void>;
const handlers = new Map<string, ApprovalHandler>();

/** Moduler registrerer, hvad en godkendelse af deres handlinger udløser (fx en faseport). */
export function registerApprovalHandler(module: string, action: string, handler: ApprovalHandler): void {
  handlers.set(`${module}:${action}`, handler);
}

/** Afgør en godkendelse og udfører konsekvensen (start job / aktivér version). */
export async function decideApproval(id: string, approved: boolean, note: string | null, options: { defer?: Defer } = {}): Promise<Approval> {
  const approval = await recordDecision(id, approved, note);
  if (approval.subject.aiJobId) await onJobApprovalDecided(approval.subject.aiJobId, approved, note, options);
  if (approval.subject.agentVersionId) await agentRegistry.decideVersion(approval.subject.agentVersionId, approved);
  const ref = approval.subject.ref;
  if (ref) {
    const handler = handlers.get(`${ref.module}:${ref.action}`);
    if (handler) await handler(ref, approval, approved, note);
  }
  await publishEvent({ type: "approval.decided", source: "aos", mode: approval.mode, subject: { aiJobId: approval.subject.aiJobId }, payload: { approvalId: id, approved, category: approval.category } });
  return approval;
}
