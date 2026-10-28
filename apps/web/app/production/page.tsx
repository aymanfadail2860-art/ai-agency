import type { Metadata } from "next";
import { ProductionPreview } from "@agency/production";
import { PageHeader, PendingBadge } from "@agency/ui";

export const metadata: Metadata = { title: "Produktion & Levering" };

export default function Page() {
  return (
    <>
      <PageHeader eyebrow="Modul 3" title="Produktion & Levering" badges={<PendingBadge />} description="Selvstændigt modul for hele processen fra accepteret tilbud til færdigleveret og vedligeholdt AI-løsning. Modtager opgaver fra Tilbud, CRM og andre moduler via dokumenterede API-kontrakter." />
      <ProductionPreview />
    </>
  );
}
