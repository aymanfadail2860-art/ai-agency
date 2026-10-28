import type { Metadata } from "next";
import { DashboardPreview } from "@agency/dashboard";
import { PageHeader, PendingBadge } from "@agency/ui";

export const metadata: Metadata = { title: "Dashboard" };

export default function Page() {
  return (
    <>
      <PageHeader eyebrow="Modul 5" title="Dashboard" badges={<PendingBadge />} description="Samler KPI'er, økonomi og driftsresultater fra alle moduler." />
      <DashboardPreview />
    </>
  );
}
