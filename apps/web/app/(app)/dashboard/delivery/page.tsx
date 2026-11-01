import type { Metadata } from "next";
import { DeliveryView } from "@agency/dashboard";
import { DashboardShell } from "@/components/dashboard-shell";
import { loadDashboard } from "@/lib/dashboard-page";

export const metadata: Metadata = { title: "Dashboard · Levering — Delivery Intelligence" };
export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { data, error } = await loadDashboard(searchParams);
  return (
    <DashboardShell title="Levering — Delivery Intelligence" description="Projekter pr. fase, forsinkelser, deadlines, godkendelser, gennemførelsestid, leveringsperformance, arbejdsbelastning og agenttilknytninger — direkte fra Produktion & Levering." data={data} error={error}>
      <DeliveryView data={data} />
    </DashboardShell>
  );
}
