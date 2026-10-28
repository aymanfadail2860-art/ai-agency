import type { Metadata } from "next";
import { getSettings } from "@agency/core/server";
import { getCvrProvider } from "@agency/integrations";
import { ResearchHome } from "@agency/research";
import { listCompanyOverviews, listDemoCompanies } from "@agency/research/server";
import { ActiveBadge, ModeBadge, PageHeader } from "@agency/ui";

export const metadata: Metadata = { title: "Research" };
export const dynamic = "force-dynamic";

export default async function ResearchPage() {
  const { mode } = await getSettings();
  const provider = getCvrProvider();
  const overviews = await listCompanyOverviews(mode);
  return (
    <>
      <PageHeader
        eyebrow="Modul 1"
        title="AI Company Research"
        badges={
          <>
            <ActiveBadge />
            <ModeBadge mode={mode} />
          </>
        }
        description="Slå en virksomhed op, lad AI undersøge offentlige kilder, og få konkrete serviceanbefalinger med kildehenvisninger og gennemsigtig scoring."
      />
      <ResearchHome
        mode={mode}
        cvrConfigured={provider.isConfigured()}
        cvrProviderName={provider.name}
        demoCompanies={listDemoCompanies()}
        companies={overviews.map((o) => ({ company: o.company, latestReport: o.latestReport, latestJob: o.latestJob }))}
      />
    </>
  );
}
