import type { Metadata } from "next";
import Link from "next/link";
import { getTaskType, JOB_STATUS_LABELS, POLICY_LABELS, policiesFor } from "@agency/orchestrator";
import { engineAvailability, listJobs } from "@agency/orchestrator/server";
import { BrandResearch, DeepResearchPanel } from "@agency/research";
import { getBrandOverview } from "@agency/research/server";
import { ModeBadge, PageHeader } from "@agency/ui";
import { orNotFound } from "@/lib/page";

export const metadata: Metadata = { title: "Brand" };
export const dynamic = "force-dynamic";

export default async function BrandPage({ params }: { params: Promise<{ brandId: string }> }) {
  const { brandId } = await params;
  const o = await orNotFound(getBrandOverview(brandId));
  const brandTask = getTaskType("research.brand_analysis")!;
  const deepJobs = await listJobs({ brandId: o.brand.id, taskType: "research.deep_research", mode: o.brand.mode, limit: 5 });
  const claudeCode = engineAvailability("research.deep_research").claude_code;
  return (
    <>
      <PageHeader
        eyebrow="Research · Brand"
        title={o.brand.name}
        badges={<ModeBadge mode={o.brand.mode} />}
        description={
          <Link href="/research" className="text-accent hover:underline">
            ← Alle brands
          </Link>
        }
      />
      <BrandResearch
        brand={o.brand}
        websites={o.websites}
        relations={o.relations}
        latestJob={o.latestJob}
        reports={o.reports}
        policyOptions={policiesFor(brandTask).map((p) => ({ value: p, label: POLICY_LABELS[p] }))}
        aside={
          <DeepResearchPanel
            brandId={o.brand.id}
            mode={o.brand.mode}
            available={o.brand.mode === "live" && claudeCode.available}
            unavailableReason={claudeCode.reason}
            jobs={deepJobs.map((j) => ({
              id: j.id,
              status: j.status,
              statusLabel: JOB_STATUS_LABELS[j.status],
              createdAt: j.createdAt,
              sessionUrl: j.external?.claudeCodeSessionUrl ?? null,
              summary: j.result?.summary ?? null,
              error: j.error?.message ?? null,
              overdue: j.overdue,
              result: j.result?.data ?? null,
            }))}
          />
        }
      />
    </>
  );
}
