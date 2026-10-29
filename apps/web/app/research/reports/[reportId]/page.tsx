import type { Metadata } from "next";
import Link from "next/link";
import { ResearchReportView } from "@agency/research";
import { getReport } from "@agency/research/server";
import { PageHeader } from "@agency/ui";
import { orNotFound } from "@/lib/page";

export const metadata: Metadata = { title: "Researchrapport" };
export const dynamic = "force-dynamic";

export default async function ReportPage({ params }: { params: Promise<{ reportId: string }> }) {
  const { reportId } = await params;
  const { report, brand, company } = await orNotFound(getReport(reportId));
  const title = report.brandSnapshot?.name ?? brand?.name ?? company?.name ?? "Researchrapport";
  return (
    <>
      <PageHeader
        eyebrow="Kommerciel researchrapport"
        title={title}
        description={
          brand ? (
            <Link href={`/research/brands/${brand.id}`} className="text-accent hover:underline">
              ← Brand, juridiske enheder og ny research
            </Link>
          ) : (
            <Link href="/research" className="text-accent hover:underline">
              ← Research
            </Link>
          )
        }
      />
      <ResearchReportView report={report} brand={brand} company={company} />
    </>
  );
}
