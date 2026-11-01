import type { Metadata } from "next";
import { FinanceView } from "@agency/dashboard";
import { DashboardShell } from "@/components/dashboard-shell";
import { loadDashboard } from "@/lib/dashboard-page";

export const metadata: Metadata = { title: "Dashboard · Økonomi — Financial Intelligence" };
export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { data, error } = await loadDashboard(searchParams);
  return (
    <DashboardShell title="Økonomi — Financial Intelligence" description="Aftalt implementering, MRR og ARR, omkostninger pr. kunde, projekt og AI-motor samt estimeret dækningsbidrag. Pipeline, vundet, aftalt, faktureret og betalt holdes adskilt." data={data} error={error}>
      <FinanceView data={data} />
    </DashboardShell>
  );
}
