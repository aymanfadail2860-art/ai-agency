import type { Metadata } from "next";
import { ExecutiveOverview } from "@agency/dashboard";
import { DashboardDemoPanel } from "@/components/dashboard-demo";
import { DashboardShell } from "@/components/dashboard-shell";
import { getDashboardDemoStatus } from "@/lib/dashboard-demo";
import { loadDashboard } from "@/lib/dashboard-page";

export const metadata: Metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

export default async function DashboardPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { mode, data, error } = await loadDashboard(searchParams);
  const demo = mode === "demo" ? await getDashboardDemoStatus() : null;
  return (
    <DashboardShell
      title="Dashboard"
      description="Hele bureauets drift i ét overblik: salg, pipeline, kunder, aftalt omsætning, levering, godkendelser, AI-agenter og omkostninger — og hvad der kræver handling i dag."
      data={data}
      error={error}
      after={demo && <DashboardDemoPanel status={demo} />}
    >
      <ExecutiveOverview data={data} />
    </DashboardShell>
  );
}
