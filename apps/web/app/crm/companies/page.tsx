import type { Metadata } from "next";
import { getSettings } from "@agency/core/server";
import { CompanyList } from "@agency/crm";
import { listAccounts } from "@agency/crm/server";
import { ModeBadge, PageHeader } from "@agency/ui";
import { customersNotInCrm } from "@/lib/crm";

export const metadata: Metadata = { title: "CRM · Virksomheder" };
export const dynamic = "force-dynamic";

export default async function CompaniesPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string }> }) {
  const { mode } = await getSettings();
  const sp = await searchParams;
  const [accounts, notInCrm] = await Promise.all([listAccounts(mode), customersNotInCrm(mode)]);
  return (
    <>
      <PageHeader eyebrow="CRM" title="Virksomheder" badges={<ModeBadge mode={mode} />} description="Leads og kunder. Hver virksomhed er knyttet til platformens fælles kundeidentitet, så research, tilbud og projekter samles uden dubletter." />
      <CompanyList accounts={accounts.sort((a, b) => b.account.updatedAt.localeCompare(a.account.updatedAt))} initialQuery={sp.q ?? ""} initialStatus={sp.status ?? ""} notInCrm={notInCrm} />
    </>
  );
}
