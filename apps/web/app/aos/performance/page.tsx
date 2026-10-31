import type { Metadata } from "next";
import { getSettings } from "@agency/core/server";
import { DataBasisNote, PerformanceView } from "@agency/aos";
import { getPerformance } from "@agency/orchestrator/server";
import { ModeBadge, PageHeader } from "@agency/ui";

export const metadata: Metadata = { title: "AOS — Performance & Cost" };
export const dynamic = "force-dynamic";

export default async function PerformancePage() {
  const { mode } = await getSettings();
  return (
    <>
      <PageHeader eyebrow="AOS" title="Performance & Cost Intelligence" badges={<ModeBadge mode={mode} />} description="Opgaver, gennemførelsesgrad, fejlrate, behandlingstid, omkostninger og motorfordeling — kun fra registrerede data." />
      <div className="space-y-4">
        <DataBasisNote mode={mode} />
        <PerformanceView report={await getPerformance(mode)} />
      </div>
    </>
  );
}
