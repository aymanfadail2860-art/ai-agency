import type { Metadata } from "next";
import Link from "next/link";
import { JobDetail } from "@agency/aos";
import { getTaskType } from "@agency/orchestrator";
import { agentRegistry, getJob } from "@agency/orchestrator/server";
import { ModeBadge, PageHeader } from "@agency/ui";
import { orNotFound } from "@/lib/page";

export const metadata: Metadata = { title: "AOS — Opgave" };
export const dynamic = "force-dynamic";

export default async function JobPage({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  const job = await orNotFound(getJob(jobId));
  const agent = job.agentId ? await agentRegistry.get(job.agentId) : null;
  return (
    <>
      <PageHeader
        eyebrow={`AOS · ${getTaskType(job.taskType)?.label ?? job.taskType}`}
        title={job.title}
        badges={<ModeBadge mode={job.mode} />}
        description={
          <Link href="/aos/jobs" className="text-accent hover:underline">
            ← Job Center
          </Link>
        }
      />
      <JobDetail job={job} agentName={agent?.name ?? null} />
    </>
  );
}
