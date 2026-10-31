import type { Metadata } from "next";
import { getSettings } from "@agency/core/server";
import { DataBasisNote, JobTable } from "@agency/aos";
import { agentRegistry, listJobs } from "@agency/orchestrator/server";
import { ModeBadge, PageHeader } from "@agency/ui";

export const metadata: Metadata = { title: "AOS — Job Center" };
export const dynamic = "force-dynamic";

export default async function JobsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { mode } = await getSettings();
  const [jobs, agents, sp] = await Promise.all([listJobs({ mode }), agentRegistry.list(), searchParams]);
  return (
    <>
      <PageHeader eyebrow="AOS" title="Job Center" badges={<ModeBadge mode={mode} />} description="Alle AI- og automatiseringsopgaver på tværs af modulerne: motor, agent, status, resultat, fejl og omkostning." />
      <div className="space-y-4">
        <JobTable jobs={jobs} agentNames={Object.fromEntries(agents.map((a) => [a.id, a.name]))} initialStatus={sp.status ?? ""} />
        <DataBasisNote mode={mode} />
      </div>
    </>
  );
}
