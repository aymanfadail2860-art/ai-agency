import type { Metadata } from "next";
import { CrmPreview } from "@agency/crm";
import { PageHeader, PendingBadge } from "@agency/ui";

export const metadata: Metadata = { title: "CRM" };

export default function Page() {
  return (
    <>
      <PageHeader eyebrow="Modul 4" title="CRM" badges={<PendingBadge />} description="Kundestyring, kontaktpersoner, salgspipeline og opfølgning — bygget på platformens fælles kundeidentitet." />
      <CrmPreview />
    </>
  );
}
