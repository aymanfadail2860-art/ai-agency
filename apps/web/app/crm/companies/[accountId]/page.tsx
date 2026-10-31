import type { Metadata } from "next";
import Link from "next/link";
import { CompanyDetail } from "@agency/crm";
import { getCatalog } from "@agency/quotes/server";
import { ModeBadge, PageHeader } from "@agency/ui";
import { getAccount360 } from "@/lib/crm";
import { orNotFound } from "@/lib/page";

export const metadata: Metadata = { title: "CRM · Kundeprofil" };
export const dynamic = "force-dynamic";

export default async function CompanyPage({ params, searchParams }: { params: Promise<{ accountId: string }>; searchParams: Promise<{ tab?: string; existing?: string }> }) {
  const { accountId } = await params;
  const sp = await searchParams;
  const [data, catalog] = await Promise.all([orNotFound(getAccount360(accountId)), getCatalog()]);
  return (
    <>
      <PageHeader
        eyebrow="CRM · 360-graders kundeprofil"
        title={data.account.name}
        badges={<ModeBadge mode={data.account.mode} />}
        description={
          <Link href="/crm/companies" className="text-accent hover:underline">
            ← Alle virksomheder
          </Link>
        }
      />
      <CompanyDetail
        data={data}
        catalog={catalog.map((c) => ({ id: c.id, name: c.name, implementationPrice: c.implementationPrice, monthlyPrice: c.monthlyPrice }))}
        initialTab={sp.tab}
        existing={sp.existing === "1"}
      />
    </>
  );
}
