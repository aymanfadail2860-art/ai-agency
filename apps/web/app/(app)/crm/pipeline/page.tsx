import type { Metadata } from "next";
import { getSettings } from "@agency/core/server";
import { PipelineBoard } from "@agency/crm";
import { listAccounts, listOpportunities } from "@agency/crm/server";
import { getCatalog } from "@agency/quotes/server";
import { ModeBadge, PageHeader } from "@agency/ui";

export const metadata: Metadata = { title: "CRM · Pipeline" };
export const dynamic = "force-dynamic";

export default async function PipelinePage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { mode } = await getSettings();
  const sp = await searchParams;
  const [opportunities, accounts, catalog] = await Promise.all([listOpportunities(mode), listAccounts(mode), getCatalog()]);
  const status = ["open", "won", "lost", "all"].includes(sp.status ?? "") ? sp.status! : "open";
  return (
    <>
      <PageHeader eyebrow="CRM" title="Salgspipeline" badges={<ModeBadge mode={mode} />} description="Træk salgsmuligheder mellem stadierne. Implementering (engangs) og månedlig service holdes adskilt. Vundet og tabt kræver bekræftelse." />
      <PipelineBoard
        opportunities={opportunities}
        accounts={accounts.map((a) => ({ id: a.account.id, name: a.account.name }))}
        catalog={catalog.map((c) => ({ id: c.id, name: c.name, implementationPrice: c.implementationPrice, monthlyPrice: c.monthlyPrice }))}
        initialStatus={status}
      />
    </>
  );
}
