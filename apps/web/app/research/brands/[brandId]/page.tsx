import type { Metadata } from "next";
import Link from "next/link";
import { BrandResearch } from "@agency/research";
import { getBrandOverview } from "@agency/research/server";
import { ModeBadge, PageHeader } from "@agency/ui";
import { orNotFound } from "@/lib/page";

export const metadata: Metadata = { title: "Brand" };
export const dynamic = "force-dynamic";

export default async function BrandPage({ params }: { params: Promise<{ brandId: string }> }) {
  const { brandId } = await params;
  const o = await orNotFound(getBrandOverview(brandId));
  return (
    <>
      <PageHeader
        eyebrow="Research · Brand"
        title={o.brand.name}
        badges={<ModeBadge mode={o.brand.mode} />}
        description={
          <Link href="/research" className="text-accent hover:underline">
            ← Alle brands
          </Link>
        }
      />
      <BrandResearch brand={o.brand} websites={o.websites} relations={o.relations} latestJob={o.latestJob} reports={o.reports} />
    </>
  );
}
