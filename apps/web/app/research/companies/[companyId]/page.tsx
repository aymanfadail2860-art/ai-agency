import type { Metadata } from "next";
import Link from "next/link";
import { CompanyResearch } from "@agency/research";
import { getCompanyOverview } from "@agency/research/server";
import { ModeBadge, PageHeader } from "@agency/ui";
import { orNotFound } from "@/lib/page";

export const metadata: Metadata = { title: "Virksomhed" };
export const dynamic = "force-dynamic";

export default async function CompanyPage({ params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params;
  const overview = await orNotFound(getCompanyOverview(companyId));
  return (
    <>
      <PageHeader
        eyebrow="Research"
        title={overview.company.name}
        badges={<ModeBadge mode={overview.company.mode} />}
        description={
          <Link href="/research" className="text-accent hover:underline">
            ← Alle virksomheder
          </Link>
        }
      />
      <CompanyResearch company={overview.company} latestJob={overview.latestJob} reports={overview.reports} />
    </>
  );
}
