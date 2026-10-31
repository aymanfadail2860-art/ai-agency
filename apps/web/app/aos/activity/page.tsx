import type { Metadata } from "next";
import { getSettings } from "@agency/core/server";
import { ActivityFeed, DataBasisNote } from "@agency/aos";
import { agentRegistry, getActivity } from "@agency/orchestrator/server";
import { ModeBadge, PageHeader } from "@agency/ui";

export const metadata: Metadata = { title: "AOS — Live Activity" };
export const dynamic = "force-dynamic";

export default async function ActivityPage() {
  const { mode } = await getSettings();
  const [items, agents] = await Promise.all([getActivity(mode, 150), agentRegistry.list()]);
  return (
    <>
      <PageHeader
        eyebrow="AOS"
        title="Live Activity"
        badges={<ModeBadge mode={mode} />}
        description="Registrerede hændelser: opgavestart, arbejdstrin, værktøjskald (når motoren rapporterer dem), fejl, godkendelser og resultater. Modellernes interne ræsonnement vises ikke."
      />
      <div className="space-y-4">
        <ActivityFeed initial={items} agentNames={Object.fromEntries(agents.map((a) => [a.id, a.name]))} />
        <DataBasisNote mode={mode} />
      </div>
    </>
  );
}
