import type { Metadata } from "next";
import Link from "next/link";
import { getSettings } from "@agency/core/server";
import { ProductionDashboardView, SERVICE_BASES } from "@agency/production";
import { getDashboard } from "@agency/production/server";
import { Button, ModeBadge, PageHeader } from "@agency/ui";
import { Boxes } from "lucide-react";

export const metadata: Metadata = { title: "Produktion & Levering" };
export const dynamic = "force-dynamic";

export default async function ProductionPage() {
  const { mode } = await getSettings();
  const dashboard = await getDashboard(mode);
  return (
    <>
      <PageHeader
        eyebrow="Modul 3"
        title="Produktion & Levering"
        badges={<ModeBadge mode={mode} />}
        description="Fra accepteret tilbud til leveret og vedligeholdt AI-løsning. Agenter, agentjob og godkendelser kommer fra AOS."
        actions={
          <Link href="/production/service-factory">
            <Button variant="outline" data-testid="open-service-factory">
              <Boxes /> Service Factory
            </Button>
          </Link>
        }
      />
      <ProductionDashboardView dashboard={dashboard} mode={mode} serviceNames={Object.fromEntries(SERVICE_BASES.map((b) => [b.key, b.name]))} />
    </>
  );
}
