import type { Metadata } from "next";
import Link from "next/link";
import { ResearchReportView } from "@agency/research";
import { getReport } from "@agency/research/server";
import { findAccountByBrand, listAccounts } from "@agency/crm/server";
import { ReportCrmPanel } from "@/components/crm-links";
import { PageHeader } from "@agency/ui";
import { orNotFound } from "@/lib/page";

export const metadata: Metadata = { title: "Researchrapport" };
export const dynamic = "force-dynamic";

export default async function ReportPage({ params }: { params: Promise<{ reportId: string }> }) {
  const { reportId } = await params;
  const { report, brand, company } = await orNotFound(getReport(reportId));
  const [crmAccount, accounts] = await Promise.all([brand ? findAccountByBrand(brand.id) : Promise.resolve(null), listAccounts(report.mode)]);
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
      {brand && (
        <ReportCrmPanel
          reportId={report.id}
          account={crmAccount ? { id: crmAccount.id, name: crmAccount.name, status: crmAccount.status } : null}
          accounts={accounts.map((a) => ({ id: a.account.id, name: a.account.name }))}
          recommendations={report.recommendations.slice(0, 8).map((r) => ({ catalogItemId: r.catalogItemId, serviceName: r.serviceName, score: r.score.total, priority: r.priority, selected: r.selected }))}
        />
      )}
      <ResearchReportView report={report} brand={brand} company={company} />
    </>
  );
}
