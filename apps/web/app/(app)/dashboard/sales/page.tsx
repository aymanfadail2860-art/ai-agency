import type { Metadata } from "next";
import { SalesView } from "@agency/dashboard";
import { DashboardShell } from "@/components/dashboard-shell";
import { loadDashboard } from "@/lib/dashboard-page";

export const metadata: Metadata = { title: "Dashboard · Salg — Sales Intelligence" };
export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { data, error } = await loadDashboard(searchParams);
  return (
    <DashboardShell title="Salg — Sales Intelligence" description="Leads, pipeline pr. fase, konvertering, vundne og tabte aftaler, aftaleværdi, forventet lukning og servicekategorier. Engangs- og månedlige beløb holdes adskilt." data={data} error={error}>
      <SalesView data={data} />
    </DashboardShell>
  );
}
