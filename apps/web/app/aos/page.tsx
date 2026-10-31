import type { Metadata } from "next";
import { getSettings } from "@agency/core/server";
import { ActivityFeed, AgentOffice, CommandCenterTiles, DataBasisNote } from "@agency/aos";
import { getActivity, getAgentStates, getCommandCenter } from "@agency/orchestrator/server";
import { ModeBadge, PageHeader } from "@agency/ui";

export const metadata: Metadata = { title: "AOS — Command Center" };
export const dynamic = "force-dynamic";

export default async function CommandCenterPage() {
  const { mode } = await getSettings();
  const [stats, agents, activity] = await Promise.all([getCommandCenter(mode), getAgentStates(mode), getActivity(mode, 12)]);
  const names = Object.fromEntries(agents.map((a) => [a.agent.id, a.agent.name]));
  return (
    <>
      <PageHeader
        eyebrow="Modul 6 · AOS"
        title="Command Center"
        badges={<ModeBadge mode={mode} />}
        description="Kontrolcenter for AI Agency's agentorganisation: opgaver, motorer, godkendelser og omkostninger på tværs af alle moduler."
      />
      <div className="space-y-6">
        <CommandCenterTiles stats={stats} />
        <DataBasisNote mode={mode} />
        <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
          <AgentOffice initial={{ stats, agents }} compact />
          <ActivityFeed initial={activity} agentNames={names} limit={12} />
        </div>
      </div>
    </>
  );
}
