import type { Metadata } from "next";
import { getSettings } from "@agency/core/server";
import { AgentOffice, DataBasisNote } from "@agency/aos";
import { getAgentStates, getCommandCenter } from "@agency/orchestrator/server";
import { ModeBadge, PageHeader } from "@agency/ui";

export const metadata: Metadata = { title: "AOS — Agent Office" };
export const dynamic = "force-dynamic";

export default async function OfficePage() {
  const { mode } = await getSettings();
  const [stats, agents] = await Promise.all([getCommandCenter(mode), getAgentStates(mode)]);
  return (
    <>
      <PageHeader eyebrow="AOS" title="Agent Office" badges={<ModeBadge mode={mode} />} description="Agenternes arbejdsstationer. Status og skærmlys afspejler registrerede opgaver — en agent uden opgave vises som ledig." />
      <div className="space-y-4">
        <AgentOffice initial={{ stats, agents }} />
        <DataBasisNote mode={mode} />
      </div>
    </>
  );
}
