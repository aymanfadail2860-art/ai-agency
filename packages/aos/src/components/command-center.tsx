import * as React from "react";
import Link from "next/link";
import type { CommandCenterStats } from "@agency/orchestrator/server";
import { Card, CardContent } from "@agency/ui";
import { formatUsd } from "./status";

function Tile({ label, value, sub, href, testId }: { label: string; value: React.ReactNode; sub?: React.ReactNode; href?: string; testId: string }) {
  const body = (
    <Card className="h-full transition-colors hover:border-accent/50">
      <CardContent className="space-y-1 p-4">
        <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
        <p className="text-2xl font-semibold tabular-nums text-foreground" data-testid={testId}>
          {value}
        </p>
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  );
  return href ? (
    <Link href={href} className="block rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      {body}
    </Link>
  ) : (
    body
  );
}

/** Command Center: samlede nøgletal — alle beregnet af registrerede job og godkendelser. */
export function CommandCenterTiles({ stats }: { stats: CommandCenterStats }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5" data-testid="command-center">
      <Tile label="Agenter" value={stats.agents.total} sub={`${stats.agents.working} aktive · ${stats.agents.idle} ledige${stats.agents.disabled ? ` · ${stats.agents.disabled} deaktiveret` : ""}`} href="/aos/agents" testId="kpi-agents" />
      <Tile label="Igangværende opgaver" value={stats.jobs.open} sub={`${stats.jobs.running} kører lige nu`} href="/aos/jobs?status=running" testId="kpi-open-jobs" />
      <Tile label="Afsluttede opgaver" value={stats.jobs.succeeded} sub={`af ${stats.jobs.total} i alt`} href="/aos/jobs?status=succeeded" testId="kpi-succeeded" />
      <Tile label="Fejl" value={stats.jobs.failed} sub={stats.jobs.blocked ? `${stats.jobs.blocked} blokeret af routeren` : "Fejlede opgaver"} href="/aos/jobs?status=failed" testId="kpi-failed" />
      <Tile label="Godkendelser" value={stats.approvalsPending} sub="afventer din beslutning" href="/aos/approvals" testId="kpi-approvals" />
      <Tile label="API-omkostninger" value={formatUsd(stats.apiCostUsd)} sub="Claude API, registreret pr. job" href="/aos/performance" testId="kpi-api-cost" />
      <Tile label="Claude Code-kørsler" value={stats.subscriptionRuns} sub="på abonnement (ingen USD-pris)" href="/aos/performance" testId="kpi-subscription" />
      <Tile label="Aktive kundeprojekter" value={stats.activeCustomers} sub="brands med igangværende opgaver" testId="kpi-customers" />
    </div>
  );
}
