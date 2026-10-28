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
  const { report, company } = await orNotFound(getReport(reportId));
  return (
    <>
      <PageHeader
        eyebrow="Researchrapport"
        title={company.name}
        description={
          <Link href={`/research/companies/${company.id}`} className="text-accent hover:underline">
            ← Virksomhedsoplysninger og ny research
          </Link>
        }
      />
      <ResearchReportView report={report} company={company} />
    </>
  );
}
