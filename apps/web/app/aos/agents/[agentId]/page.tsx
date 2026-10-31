import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getSettings } from "@agency/core/server";
import { AgentDetail } from "@agency/aos";
import { agentRegistry, getAgentStates } from "@agency/orchestrator/server";
import { PageHeader } from "@agency/ui";

export const metadata: Metadata = { title: "AOS — Agent" };
export const dynamic = "force-dynamic";

export default async function AgentPage({ params }: { params: Promise<{ agentId: string }> }) {
  const { agentId } = await params;
  const state = (await getAgentStates((await getSettings()).mode)).find((s) => s.agent.id === agentId);
  if (!state) notFound();
  const versions = await agentRegistry.versions(agentId);
  return (
    <>
      <PageHeader
        eyebrow={`AOS · ${state.agent.role}`}
        title={state.agent.name}
        description={
          <Link href="/aos/agents" className="text-accent hover:underline">
            ← Agent Library
          </Link>
        }
      />
      <AgentDetail state={state} versions={versions} />
    </>
  );
}
