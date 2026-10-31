import { createCollectionStore } from "@agency/core/server";
import { AppError, newId, nowIso } from "@agency/shared";
import { ApprovalSchema, type Approval } from "../models";

/**
 * APPROVAL MANAGER — lagring. Beslutninger (som starter job eller aktiverer
 * agentversioner) håndteres i decisions.ts for at undgå cirkulære afhængigheder.
 */
const store = createCollectionStore("aos", "approvals", ApprovalSchema);

export async function createApproval(input: Omit<Approval, "id" | "status" | "decisionNote" | "requestedAt" | "decidedAt">): Promise<Approval> {
  return store.upsert(ApprovalSchema.parse({ ...input, id: newId("approval"), status: "pending", decisionNote: null, requestedAt: nowIso(), decidedAt: null }));
}

export async function listApprovals(filter: { status?: Approval["status"]; mode?: "demo" | "live" } = {}): Promise<Approval[]> {
  return (await store.list())
    .filter((a) => (!filter.status || a.status === filter.status) && (!filter.mode || a.mode === filter.mode))
    .sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
}

export async function getApproval(id: string): Promise<Approval> {
  const approval = await store.get(id);
  if (!approval) throw new AppError("not_found", "Godkendelsen blev ikke fundet.");
  return approval;
}

/** Registrerer beslutningen præcis én gang (optimistisk låsning i lagringen). */
export async function recordDecision(id: string, approved: boolean, note: string | null): Promise<Approval> {
  let changed = false;
  const updated = await store.update(id, (a) => {
    if (a.status !== "pending") return a;
    changed = true;
    return { ...a, status: approved ? "approved" : "rejected", decisionNote: note, decidedAt: nowIso() };
  });
  if (!updated) throw new AppError("not_found", "Godkendelsen blev ikke fundet.");
  if (!changed) throw new AppError("conflict", "Godkendelsen er allerede afgjort.");
  return updated;
}
