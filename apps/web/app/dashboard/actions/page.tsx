import type { Metadata } from "next";
import { ActionCenter } from "@agency/dashboard";
import { DashboardShell } from "@/components/dashboard-shell";
import { loadDashboard } from "@/lib/dashboard-page";

export const metadata: Metadata = { title: "Dashboard · Action Center" };
export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { data, error } = await loadDashboard(searchParams);
  return (
    <DashboardShell title="Action Center" description="Alt, der kræver handling, fundet med faste regler på registrerede data: opfølgninger, salgsmuligheder, projekter, godkendelser, AI-job og tilbud." data={data} error={error}>
      <ActionCenter data={data} />
    </DashboardShell>
  );
}
