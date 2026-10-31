import type { Metadata } from "next";
import Link from "next/link";
import { getSettings } from "@agency/core/server";
import { agentRegistry } from "@agency/orchestrator/server";
import { ServiceFactoryCatalog } from "@agency/production";
import { listProjects, listServiceBases } from "@agency/production/server";
import { getCatalog } from "@agency/quotes/server";
import { PageHeader } from "@agency/ui";

export const metadata: Metadata = { title: "Service Factory" };
export const dynamic = "force-dynamic";

export default async function ServiceFactoryPage() {
  const { mode } = await getSettings();
  const [bases, catalog, agents, projects] = await Promise.all([listServiceBases(), getCatalog(), agentRegistry.list(), listProjects(mode)]);
  return (
    <>
      <PageHeader
        eyebrow="Produktion & Levering"
        title="Service Factory"
        description={
          <>
            Genbrugelige grundsystemer, der tilpasses den enkelte kunde i stedet for at starte fra nul.{" "}
            <Link href="/production" className="text-accent hover:underline">
              ← Produktionsoversigt
            </Link>
          </>
        }
      />
      <ServiceFactoryCatalog
        agentNames={Object.fromEntries(agents.map((a) => [a.id, a.name]))}
        bases={bases.map((b) => {
          const item = catalog.find((c) => c.id === b.catalogItemId);
          return { ...b, defaultPrice: item ? { implementation: item.implementationPrice, monthly: item.monthlyPrice } : null, projects: projects.filter((p) => p.project.serviceBaseKey === b.key).length };
        })}
      />
    </>
  );
}
