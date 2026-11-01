import { notFound, redirect } from "next/navigation";
import { legacyBrandIdForCompany } from "@agency/research/server";

export const dynamic = "force-dynamic";

/** V1-adresse: virksomheder er i V2 knyttet til et brand. */
export default async function LegacyCompanyPage({ params }: { params: Promise<{ companyId: string }> }) {
  const brandId = await legacyBrandIdForCompany((await params).companyId);
  if (!brandId) notFound();
  redirect(`/research/brands/${brandId}`);
}
