import type { Metadata } from "next";
import { AiView } from "@agency/dashboard";
import { DashboardShell } from "@/components/dashboard-shell";
import { loadDashboard } from "@/lib/dashboard-page";

export const metadata: Metadata = { title: "Dashboard · AI og agenter — AI & Agent Intelligence" };
export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { data, error } = await loadDashboard(searchParams);
  return (
    <DashboardShell title="AI og agenter — AI & Agent Intelligence" description="Job Center og agentregistret i AOS: job pr. status, agent og motor, gennemførelsestid, API-omkostninger, Claude Code-kørsler (separat) og budgetstatus." data={data} error={error}>
      <AiView data={data} />
    </DashboardShell>
  );
}
