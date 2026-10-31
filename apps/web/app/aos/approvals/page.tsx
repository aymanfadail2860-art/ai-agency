import type { Metadata } from "next";
import { getSettings } from "@agency/core/server";
import { ApprovalList } from "@agency/aos";
import { listApprovals } from "@agency/orchestrator/server";
import { ModeBadge, PageHeader } from "@agency/ui";

export const metadata: Metadata = { title: "AOS — Godkendelser" };
export const dynamic = "force-dynamic";

export default async function ApprovalsPage() {
  const { mode } = await getSettings();
  return (
    <>
      <PageHeader eyebrow="AOS" title="Godkendelser" badges={<ModeBadge mode={mode} />} description="Kritiske handlinger udføres først, når du har godkendt dem her." />
      <ApprovalList approvals={await listApprovals({ mode })} />
    </>
  );
}
