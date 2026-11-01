import type { Metadata } from "next";
import Link from "next/link";
import { getSettings } from "@agency/core/server";
import { agentRegistry } from "@agency/orchestrator/server";
import { ProjectForm } from "@agency/production";
import { findProjectByQuote, listServiceBases } from "@agency/production/server";
import { quoteRecipient } from "@agency/quotes";
import { getCatalog, listQuotes } from "@agency/quotes/server";
import { listBrandOverviews } from "@agency/research/server";
import { ModeBadge, PageHeader } from "@agency/ui";

export const metadata: Metadata = { title: "Nyt produktionsprojekt" };
export const dynamic = "force-dynamic";

export default async function NewProjectPage({ searchParams }: { searchParams: Promise<{ base?: string }> }) {
  const { mode } = await getSettings();
  const [bases, catalog, brands, agents, quotes, sp] = await Promise.all([listServiceBases(), getCatalog(), listBrandOverviews(mode), agentRegistry.list(), listQuotes(mode), searchParams]);
  const accepted = await Promise.all(
    quotes
      .filter((q) => q.quote.status === "accepted")
      .map(async (q) => ({
        quoteId: q.quote.id,
        number: q.quote.number,
        customer: quoteRecipient(q.quote).displayName,
        implementation: q.totals.implementation.exclVat,
        monthly: q.totals.monthly.exclVat,
        projectId: (await findProjectByQuote(q.quote.id))?.id ?? null,
      })),
  );
  return (
    <>
      <PageHeader
        eyebrow="Produktion & Levering"
        title="Nyt produktionsprojekt"
        badges={<ModeBadge mode={mode} />}
        description={
          <Link href="/production" className="text-accent hover:underline">
            ← Produktionsoversigt
          </Link>
        }
      />
      <ProjectForm
        initialBaseKey={sp.base}
        bases={bases.map((b) => {
          const item = catalog.find((c) => c.id === b.catalogItemId);
          return { ...b, defaultPrice: item ? { implementation: item.implementationPrice, monthly: item.monthlyPrice } : null };
        })}
        customers={brands.map((b) => ({ brandId: b.brand.id, name: b.brand.name }))}
        agents={agents.map((a) => ({ id: a.id, key: a.key, name: a.name, role: a.role, color: a.color, enabled: a.enabled }))}
        acceptedQuotes={accepted}
        draftQuotes={quotes.filter((q) => q.quote.status === "draft" || q.quote.status === "sent").map((q) => ({ quoteId: q.quote.id, number: q.quote.number, customer: quoteRecipient(q.quote).displayName }))}
      />
    </>
  );
}
