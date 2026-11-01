import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getSettings } from "@agency/core/server";
import { AgentDetail } from "@agency/aos";
import { agentRegistry, getAgentStates } from "@agency/orchestrator/server";
import { AGENT_ROLE_LABELS, phaseLabel } from "@agency/production";
import { assignmentsForAgent } from "@agency/production/server";
import { PageHeader } from "@agency/ui";

export const metadata: Metadata = { title: "AOS — Agent" };
export const dynamic = "force-dynamic";

export default async function AgentPage({ params }: { params: Promise<{ agentId: string }> }) {
  const { agentId } = await params;
  const { mode } = await getSettings();
  const state = (await getAgentStates(mode)).find((s) => s.agent.id === agentId);
  if (!state) notFound();
  const [versions, assignments] = await Promise.all([agentRegistry.versions(agentId), assignmentsForAgent(agentId, mode)]);
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
      <AgentDetail
        state={state}
        versions={versions}
        assignments={assignments.map((a) => ({ ...a, roleLabel: AGENT_ROLE_LABELS[a.role as keyof typeof AGENT_ROLE_LABELS] ?? a.role, phaseLabel: phaseLabel(a.phase) }))}
      />
    </>
  );
}
