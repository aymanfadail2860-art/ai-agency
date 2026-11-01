import type { Metadata } from "next";
import { IntegrationList } from "@agency/aos";
import { listIntegrations } from "@agency/orchestrator/server";
import { PageHeader } from "@agency/ui";

export const metadata: Metadata = { title: "AOS — Integrationer" };
export const dynamic = "force-dynamic";

export default function IntegrationsPage() {
  return (
    <>
      <PageHeader
        eyebrow="AOS"
        title="Integration Manager"
        description="Alle eksterne integrationer gennem én kontrolleret struktur. Nøgler sættes som Sensitive miljøvariabler i Vercel og vises aldrig her."
      />
      <IntegrationList integrations={listIntegrations()} />
    </>
  );
}
