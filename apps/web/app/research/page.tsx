import type { Metadata } from "next";
import { getSettings } from "@agency/core/server";
import { getCvrProvider } from "@agency/integrations";
import { ResearchHome } from "@agency/research";
import { listBrandOverviews, listDemoExamples } from "@agency/research/server";
import { ActiveBadge, ModeBadge, PageHeader } from "@agency/ui";

export const metadata: Metadata = { title: "Research" };
export const dynamic = "force-dynamic";

export default async function ResearchPage() {
  const { mode } = await getSettings();
  const provider = getCvrProvider();
  const brands = await listBrandOverviews(mode);
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
        description="Brand-first research: start med en hjemmeside eller et CVR-nummer. AI undersøger offentlige kilder og anbefaler konkrete services med kildehenvisninger og gennemsigtig scoring."
      />
      <ResearchHome mode={mode} cvrConfigured={provider.isConfigured()} cvrProviderName={provider.name} demoExamples={listDemoExamples()} brands={brands} />
    </>
  );
}
