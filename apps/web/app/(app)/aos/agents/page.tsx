import type { Metadata } from "next";
import { getSettings } from "@agency/core/server";
import { AgentLibrary } from "@agency/aos";
import { getAgentStates } from "@agency/orchestrator/server";
import { PageHeader } from "@agency/ui";

export const metadata: Metadata = { title: "AOS — Agent Library" };
export const dynamic = "force-dynamic";

export default async function AgentsPage() {
  const agents = await getAgentStates((await getSettings()).mode);
  return (
    <>
      <PageHeader
        eyebrow="AOS"
        title="Agent Library"
        description="Agenternes definitioner er versionsstyrede. Grundversionerne ligger i GitHub; ændringer bliver nye versioner, der først aktiveres efter godkendelse."
      />
      <AgentLibrary agents={agents} />
    </>
  );
}
