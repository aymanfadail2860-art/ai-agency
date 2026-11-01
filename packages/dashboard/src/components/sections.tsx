"use client";
import * as React from "react";
import Link from "next/link";
import { Alert, Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState } from "@agency/ui";
import { AlertTriangle, ArrowRight, CheckCircle2, CircleAlert, Info, ListChecks } from "lucide-react";
import type { ActionItem, ActionSeverity, DashboardData } from "../analytics/compute";
import { filterToQuery } from "../analytics/filters";
import { BarList, ChartCard, ColumnChart, LineChart, SegmentBar, compact, fmtCount, fmtKr, fmtKrMonth, fmtPct, fmtUsd } from "./charts";
import { Definitions, KpiTile } from "./frame";

const fmtDate = (d: string | null) => (d ? new Date(d.length === 10 ? `${d}T12:00:00Z` : d).toLocaleDateString("da-DK", { day: "numeric", month: "short", year: "numeric" }) : "–");
const fmtDateTime = (d: string) => new Date(d).toLocaleString("da-DK", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** Datagrundlaget forklares altid: demo, tomt eller uden rigtige AI-kørsler. */
export function DataBasis({ data }: { data: DashboardData }) {
  return (
    <div className="space-y-2" data-testid="data-basis">
      {data.mode === "demo" ? (
        <Alert variant="warning" title="DEMO — fiktive eksempeldata">
          Tallene beregnes af de rigtige regler, men på demodata (markeret DEMO i modulerne). Der vises ingen opdigtede live-tal.
          {data.basis.simulatedCosts > 0 && ` ${data.basis.simulatedCosts} omkostningspost(er) er simulerede.`}
        </Alert>
      ) : (
        <Alert variant="info" title="Live Mode">
          Kun rigtige registreringer fra modulerne indgår.
        </Alert>
      )}
    </div>
  );
}

export function EmptyDashboard({ mode }: { mode: "demo" | "live" }) {
  return (
    <EmptyState
      icon={<Info />}
      title="Ingen registrerede data endnu"
      description={mode === "demo" ? "Indlæs demo-porteføljen nederst på siden, eller start i Research og CRM — Dashboard viser automatisk konsekvenserne." : "Start i Research eller CRM. Dashboard samler data fra modulerne, så snart de findes."}
    />
  );
}

// ─── Executive Overview ─────────────────────────────────────────────────────

export function ExecutiveOverview({ data }: { data: DashboardData }) {
  const q = filterToQuery(data.filter);
  const top = data.actions.slice(0, 6);
  return (
    <div className="space-y-6" data-testid="executive-overview">
      <section className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,2fr)] [&>*]:min-w-0">
        <Card className="bg-gradient-to-br from-accent/[0.06] via-card to-card">
          <CardContent className="flex h-full flex-col justify-between gap-4 p-6">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Aftalt tilbagevendende omsætning (MRR)</p>
              <p className="mt-2 text-4xl font-semibold tracking-tight sm:text-5xl" data-testid="hero-mrr">
                {fmtKrMonth(data.finance.mrr)}
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                ARR {fmtKr(data.finance.arr)} · kontraktligt aftalt, ikke faktureret
              </p>
            </div>
            <dl className="grid grid-cols-2 gap-3 border-t border-border pt-4 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">Aftalt implementering · periode</dt>
                <dd className="font-semibold">{fmtKr(data.finance.agreedImplementation)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Vægtet pipeline (1. år)</dt>
                <dd className="font-semibold">{fmtKr(data.sales.weightedPipeline.firstYear)}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>
        <Card data-testid="attention-today">
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
            <div>
              <CardTitle className="text-base">Kræver opmærksomhed i dag</CardTitle>
              <CardDescription>{data.actions.length} handling(er) fra faste regler på tværs af modulerne</CardDescription>
            </div>
            <Link href={`/dashboard/actions${q}`} className="inline-flex items-center gap-1 text-sm font-medium text-accent hover:underline" data-testid="open-action-center">
              Action Center <ArrowRight className="h-4 w-4" />
            </Link>
          </CardHeader>
          <CardContent>{top.length ? <ActionList items={top} compact /> : <AllClear />}</CardContent>
        </Card>
      </section>

      <section aria-label="Nøgletal" className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4 [&>*]:min-w-0" data-testid="overview-kpis">
        {data.overview.kpis.map((k) => (
          <KpiTile key={k.key} kpi={k} />
        ))}
      </section>

      <section className="grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
        <ChartCard title="Aftalt MRR over tid" description="Beholdning ved udgangen af hvert interval — ikke en sum af måneder." testId="chart-mrr">
          <LineChart data={data.finance.series} series={[{ key: "mrr", label: "Aftalt MRR", slot: 1 }]} format={fmtKrMonth} caption="Aftalt MRR over tid" />
        </ChartCard>
        <ChartCard title="Pipeline pr. fase" description="Åbne salgsmuligheder i CRM — antal og engangsværdi." testId="chart-stage" action={<Link href="/crm/pipeline" className="text-xs text-accent hover:underline">Åbn pipeline</Link>}>
          <BarList
            rows={data.sales.byStage.filter((s) => s.key !== "won" && s.key !== "lost").map((s) => ({ key: s.key, label: s.label, sub: `${s.count} stk. · ${fmtKrMonth(s.monthly)}`, values: { implementation: s.implementation } }))}
            series={[{ key: "implementation", label: "Implementering", slot: 1 }]}
            format={fmtKr}
            caption="Pipeline pr. fase"
            emptyText="Ingen åbne salgsmuligheder."
          />
        </ChartCard>
      </section>

      <section className="grid gap-4 md:grid-cols-3 [&>*]:min-w-0">
        <MiniStat label="Projekter i gang" value={fmtCount(data.delivery.active)} sub={`${data.delivery.overdue} forsinket · ${data.delivery.pendingApprovals} afventer godkendelse`} href={`/dashboard/delivery${q}`} />
        <MiniStat label="AI-jobs i perioden" value={fmtCount(data.ai.registered)} sub={`${data.ai.succeeded} gennemført · ${data.ai.failed} fejlet · ${data.ai.blocked} blokeret`} href={`/dashboard/ai${q}`} />
        <MiniStat label="Konverteringsrate" value={fmtPct(data.sales.winRate)} sub={data.sales.winRate === null ? "Ingen lukkede aftaler i perioden" : `${data.sales.won.count} vundet · ${data.sales.lost.count} tabt`} href={`/dashboard/sales${q}`} />
      </section>
      <Definitions keys={["pipeline", "customers", "new-leads", "won-lost", "mrr", "projects", "ai-costs", "actions"]} />
    </div>
  );
}

function MiniStat({ label, value, sub, href }: { label: string; value: string; sub: string; href: string }) {
  return (
    <Link href={href} className="group block rounded-xl border border-border bg-card p-4 shadow-card transition-colors hover:border-accent/40">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{sub}</p>
    </Link>
  );
}

// ─── Sales Intelligence ────────────────────────────────────────────────────

export function SalesView({ data }: { data: DashboardData }) {
  const s = data.sales;
  return (
    <div className="space-y-6" data-testid="sales-view">
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4 [&>*]:min-w-0">
        <Stat label="Åben pipeline (1. år)" value={fmtKr(s.openPipeline.firstYear)} sub={`${fmtKr(s.openPipeline.implementation)} + ${fmtKrMonth(s.openPipeline.monthly)}`} testId="sales-open" />
        <Stat label="Vægtet pipeline" value={fmtKr(s.weightedPipeline.implementation)} sub={`+ ${fmtKrMonth(s.weightedPipeline.monthly)} (sandsynlighed)`} />
        <Stat label="Konverteringsrate" value={fmtPct(s.winRate)} sub={s.winRate === null ? "Ingen lukkede i perioden" : `${s.won.count} vundet / ${s.won.count + s.lost.count} lukket`} testId="sales-winrate" />
        <Stat label="Gns. aftaleværdi" value={s.averageDeal ? fmtKr(s.averageDeal.implementation) : "–"} sub={s.averageDeal ? `+ ${fmtKrMonth(s.averageDeal.monthly)} · ${s.averageDeal.count} aftale(r)` : "Ingen aftaler i perioden"} />
        <Stat label="Nye leads" value={fmtCount(s.newLeads)} sub={`${fmtPct(s.leadToCustomerRate)} er nu kunder`} />
        <Stat label="Vundne aftaler" value={fmtCount(s.won.count)} sub={`${fmtKr(s.won.implementation)} + ${fmtKrMonth(s.won.monthly)}`} />
        <Stat label="Tabte aftaler" value={fmtCount(s.lost.count)} sub={`${fmtKr(s.lost.implementation)} + ${fmtKrMonth(s.lost.monthly)}`} />
        <Stat label="Tilbud uden CRM-salgsmulighed" value={fmtCount(s.quotesWithoutOpportunity)} sub="indgår ikke i pipelinen" />
      </section>
      <section className="grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
        <ChartCard title="Nye leads over tid" description="Virksomheder oprettet i CRM pr. interval." testId="chart-leads">
          <ColumnChart data={s.series} series={[{ key: "leads", label: "Nye leads", slot: 1 }]} format={fmtCount} caption="Nye leads over tid" />
        </ChartCard>
        <ChartCard title="Vundne og tabte aftaler" description="Salgsmuligheder lukket pr. interval." testId="chart-won-lost">
          <ColumnChart
            data={s.series}
            series={[
              { key: "won", label: "Vundet", slot: 1 },
              { key: "lost", label: "Tabt", slot: 2 },
            ]}
            format={fmtCount}
            caption="Vundne og tabte aftaler over tid"
          />
        </ChartCard>
        <ChartCard title="Pipeline-funnel" description="Nuværende fordeling på faser: antal og værdi. Vundet og tabt er lukket i perioden." testId="chart-funnel">
          <BarList
            rows={s.byStage.map((st) => ({ key: st.key, label: st.label, sub: `${st.count} stk. · ${fmtKrMonth(st.monthly)}`, values: { implementation: st.implementation }, href: st.key === "won" || st.key === "lost" ? `/crm/pipeline?status=${st.key}` : "/crm/pipeline" }))}
            series={[{ key: "implementation", label: "Implementering", slot: 1 }]}
            format={fmtKr}
            caption="Pipeline pr. fase"
            emptyText="Ingen salgsmuligheder."
          />
        </ChartCard>
        <ChartCard title="Forventet lukning (vægtet)" description="Åbne salgsmuligheder pr. forventet lukkemåned, vægtet med sandsynlighed." testId="chart-close">
          <ColumnChart data={s.expectedClose.map((m) => ({ key: m.key, label: m.label, values: { weightedImplementation: m.weightedImplementation, weightedMonthly: m.weightedMonthly } }))} series={[{ key: "weightedImplementation", label: "Vægtet implementering", slot: 1 }]} format={fmtKr} caption="Forventet lukning pr. måned" />
        </ChartCard>
        <ChartCard title="Pipelineudvikling — engangsbeløb" description="Åben pipeline ved udgangen af hvert interval." testId="chart-pipeline-impl">
          <LineChart data={s.series} series={[{ key: "pipelineImplementation", label: "Åben pipeline, implementering", slot: 1 }]} format={fmtKr} caption="Pipelineudvikling, implementering" />
        </ChartCard>
        <ChartCard title="Pipelineudvikling — månedlige beløb" description="Samme opgørelse for den tilbagevendende del (egen akse)." testId="chart-pipeline-monthly">
          <LineChart data={s.series} series={[{ key: "pipelineMonthly", label: "Åben pipeline, månedlig", slot: 2 }]} format={fmtKrMonth} caption="Pipelineudvikling, månedlig" />
        </ChartCard>
      </section>
      <section className="grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
        <ChartCard title="Salg pr. servicekategori" description="Åben pipeline og aftaler indgået i perioden (implementering)." testId="chart-category">
          <BarList
            rows={s.byCategory.map((c) => ({ key: c.key, label: c.label, sub: `${c.deals} aftale(r) · ${fmtKrMonth(c.agreedMonthly)} aftalt`, values: { pipeline: c.pipelineImplementation, agreed: c.agreedImplementation } }))}
            series={[
              { key: "pipeline", label: "Åben pipeline", slot: 1 },
              { key: "agreed", label: "Aftalt i perioden", slot: 2 },
            ]}
            format={fmtKr}
            caption="Salg pr. servicekategori"
            emptyText="Ingen salg med servicekategori endnu."
          />
        </ChartCard>
        <Card data-testid="forecast">
          <CardHeader>
            <CardTitle className="text-base">Forventet omsætning — næste 12 måneder</CardTitle>
            <CardDescription>To separate estimater. Intet af det er faktureret.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="flex items-baseline justify-between gap-3 border-b border-border pb-3">
              <span>
                Kontraheret tilbagevendende
                <span className="block text-xs text-muted-foreground">Aftalt MRR × 12</span>
              </span>
              <span className="text-lg font-semibold">{fmtKr(s.forecast.contractedRecurring12m)}</span>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <span>
                Vægtet pipeline (første års værdi)
                <span className="block text-xs text-muted-foreground">Σ sandsynlighed × (implementering + 12 × månedlig)</span>
              </span>
              <span className="text-lg font-semibold">{fmtKr(s.forecast.weightedPipelineFirstYear)}</span>
            </div>
          </CardContent>
        </Card>
      </section>
      <Definitions keys={["pipeline", "weighted", "new-leads", "won-lost", "win-rate", "average-deal", "category", "pipeline-series", "forecast"]} />
    </div>
  );
}

function Stat({ label, value, sub, testId }: { label: string; value: string; sub?: string; testId?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-card" data-testid={testId}>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold tracking-tight">{value}</p>
      {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

// ─── Financial Intelligence ────────────────────────────────────────────────

export function FinanceView({ data }: { data: DashboardData }) {
  const f = data.finance;
  return (
    <div className="space-y-6" data-testid="finance-view">
      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6 [&>*]:min-w-0">
        <Stat label="Aftalt implementering" value={fmtKr(f.agreedImplementation)} sub={`${f.agreedCount} aftale(r) i perioden`} testId="fin-agreed" />
        <Stat label="Aftalt MRR" value={fmtKrMonth(f.mrr)} sub="beholdning pr. nu" testId="fin-mrr" />
        <Stat label="ARR" value={fmtKr(f.arr)} sub="MRR × 12" testId="fin-arr" />
        <Stat label="Projektomkostninger" value={fmtKr(f.projectCosts)} sub={`${f.projectCostEntries} post(er)${f.simulatedCostEntries ? ` · ${f.simulatedCostEntries} simuleret` : ""}`} />
        <Stat label="AI API-omkostninger" value={fmtUsd(f.aiCostUsd)} sub="registreret i Job Center (USD)" />
        <Stat label="Claude Code-kørsler" value={fmtCount(f.subscriptionRuns)} sub="abonnement — ingen USD-pris" />
      </section>

      <Card data-testid="finance-levels">
        <CardHeader>
          <CardTitle className="text-base">Fra pipeline til betaling — fem niveauer</CardTitle>
          <CardDescription>Niveauerne holdes adskilt. Faktura- og betalingsdata findes ikke endnu og vises derfor ikke som tal.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[34rem] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="py-2 pr-3 font-medium">Niveau</th>
                <th className="py-2 pr-3 text-right font-medium">Implementering</th>
                <th className="py-2 pr-3 text-right font-medium">Månedlig</th>
                <th className="py-2 font-medium">Grundlag</th>
              </tr>
            </thead>
            <tbody>
              {f.levels.map((l, i) => (
                <tr key={l.key} className="border-b border-border/70 last:border-0" data-testid={`level-${l.key}`} data-available={l.available}>
                  <td className="py-2.5 pr-3 font-medium">
                    {i + 1}. {l.label}
                  </td>
                  <td className="py-2.5 pr-3 text-right tabular-nums">{l.available ? fmtKr(l.implementation!) : <Badge variant="muted">Ikke tilgængelig</Badge>}</td>
                  <td className="py-2.5 pr-3 text-right tabular-nums">{l.available ? fmtKrMonth(l.monthly!) : <Badge variant="muted">Ikke tilgængelig</Badge>}</td>
                  <td className="py-2.5 text-xs text-muted-foreground">{l.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <section className="grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
        <ChartCard title="Aftalt implementeringsomsætning" description="Engangsbeløb fra aftaler indgået pr. interval." testId="chart-agreed">
          <ColumnChart data={f.series} series={[{ key: "agreedImplementation", label: "Aftalt implementering", slot: 1 }]} format={fmtKr} caption="Aftalt implementeringsomsætning over tid" />
        </ChartCard>
        <ChartCard title="MRR-udvikling" description="Aftalt MRR ved udgangen af hvert interval (beholdning)." testId="chart-finance-mrr">
          <LineChart data={f.series} series={[{ key: "mrr", label: "Aftalt MRR", slot: 1 }]} format={fmtKrMonth} caption="MRR-udvikling" />
        </ChartCard>
      </section>

      <section className="grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
        <Card data-testid="contribution">
          <CardHeader>
            <CardTitle className="text-base">Estimeret dækningsbidrag</CardTitle>
            <CardDescription>Kun projekter med registrerede omkostninger. AI-omkostninger i USD indgår ikke (ingen valutaomregning).</CardDescription>
          </CardHeader>
          <CardContent>
            {f.contribution ? (
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-xs text-muted-foreground">Første års værdi ({f.contribution.projects} projekt(er))</dt>
                  <dd className="font-semibold">{fmtKr(f.contribution.firstYearValue)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Registrerede omkostninger</dt>
                  <dd className="font-semibold">{fmtKr(f.contribution.registeredCosts)}</dd>
                </div>
                <div className="col-span-2 border-t border-border pt-3">
                  <dt className="text-xs text-muted-foreground">Estimeret dækningsbidrag (første år)</dt>
                  <dd className="text-2xl font-semibold" data-testid="contribution-value">
                    {fmtKr(f.contribution.estimate)}
                  </dd>
                </div>
              </dl>
            ) : (
              <p className="text-sm text-muted-foreground" data-testid="contribution-unavailable">
                Utilstrækkeligt datagrundlag: der er ikke registreret omkostninger på nogen projekter endnu.
              </p>
            )}
          </CardContent>
        </Card>
        <ChartCard title="Omkostninger pr. AI-motor" description="API-omkostning (USD) i perioden. Claude Code vises som kørsler." testId="chart-engine-cost">
          <BarList rows={f.perEngine.map((e) => ({ key: e.key, label: e.label, sub: `${e.jobs} job · ${e.subscriptionRuns} abonnementskørsler`, values: { jobs: e.jobs } }))} series={[{ key: "jobs", label: "Job", slot: 1 }]} format={(n) => `${fmtCount(n)} job`} caption="Job pr. AI-motor" emptyText="Ingen AI-job i perioden." />
          <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
            {f.perEngine.map((e) => (
              <li key={e.key} className="flex justify-between">
                <span>{e.label}</span>
                <span className="tabular-nums text-foreground">{fmtUsd(e.apiCostUsd)}</span>
              </li>
            ))}
          </ul>
        </ChartCard>
      </section>

      <section className="grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
        <Card data-testid="cost-per-customer">
          <CardHeader>
            <CardTitle className="text-base">Omkostninger pr. kunde</CardTitle>
            <CardDescription>Projektomkostninger (DKK) og AI (USD/kørsler) i perioden.</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            {f.perCustomer.length ? (
              <table className="w-full min-w-[26rem] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="py-1.5 pr-3 font-medium">Kunde</th>
                    <th className="py-1.5 pr-3 text-right font-medium">Projekt</th>
                    <th className="py-1.5 pr-3 text-right font-medium">AI API</th>
                    <th className="py-1.5 text-right font-medium">CC-kørsler</th>
                  </tr>
                </thead>
                <tbody>
                  {f.perCustomer.map((c) => (
                    <tr key={c.key} className="border-b border-border/60 last:border-0">
                      <td className="py-1.5 pr-3">{c.name}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums">{fmtKr(c.projectCosts)}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums">{fmtUsd(c.aiCostUsd)}</td>
                      <td className="py-1.5 text-right tabular-nums">{c.subscriptionRuns}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-sm text-muted-foreground">Ingen registrerede omkostninger i perioden.</p>
            )}
          </CardContent>
        </Card>
        <Card data-testid="cost-per-project">
          <CardHeader>
            <CardTitle className="text-base">Omkostninger pr. projekt</CardTitle>
            <CardDescription>Alle registreringer (hele perioden) mod aftalt første års værdi.</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            {f.perProject.length ? (
              <table className="w-full min-w-[30rem] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="py-1.5 pr-3 font-medium">Projekt</th>
                    <th className="py-1.5 pr-3 text-right font-medium">1. års værdi</th>
                    <th className="py-1.5 pr-3 text-right font-medium">Omkostninger</th>
                    <th className="py-1.5 text-right font-medium">Bidrag (est.)</th>
                  </tr>
                </thead>
                <tbody>
                  {f.perProject.slice(0, 12).map((p) => (
                    <tr key={p.id} className="border-b border-border/60 last:border-0">
                      <td className="py-1.5 pr-3">
                        <Link href={`/production/projects/${p.id}?tab=finance`} className="hover:text-accent hover:underline">
                          {p.name}
                        </Link>
                        <span className="block text-xs text-muted-foreground">
                          {p.customerName}
                          {p.isDemo ? " · demo" : ""}
                        </span>
                      </td>
                      <td className="py-1.5 pr-3 text-right tabular-nums">{fmtKr(p.firstYearValue)}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums">{p.costEntries ? fmtKr(p.registeredCosts) : "–"}</td>
                      <td className="py-1.5 text-right tabular-nums">{p.contributionEstimate === null ? <span className="text-muted-foreground">–</span> : fmtKr(p.contributionEstimate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-sm text-muted-foreground">Ingen projekter.</p>
            )}
          </CardContent>
        </Card>
      </section>
      <Definitions keys={["agreements", "mrr", "mrr-series", "invoiced", "project-costs", "ai-costs", "contribution"]} />
    </div>
  );
}

// ─── Delivery Intelligence ─────────────────────────────────────────────────

export function DeliveryView({ data }: { data: DashboardData }) {
  const d = data.delivery;
  return (
    <div className="space-y-6" data-testid="delivery-view">
      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6 [&>*]:min-w-0">
        <Stat label="Aktive projekter" value={fmtCount(d.active)} sub={`${d.total} i visningen`} testId="del-active" />
        <Stat label="Forsinkede" value={fmtCount(d.overdue)} sub="Produktions regel" testId="del-overdue" />
        <Stat label="Afventer godkendelse" value={fmtCount(d.pendingApprovals)} sub="faseporte i AOS" />
        <Stat label="Leveret i perioden" value={fmtCount(d.deliveredInPeriod)} sub={`${d.inMaintenance} i drift`} />
        <Stat label="Gns. gennemførelsestid" value={d.avgCompletionDays === null ? "–" : `${d.avgCompletionDays.toLocaleString("da-DK")} dage`} sub="start → leveret" />
        <Stat label="Leveret til tiden" value={fmtPct(d.onTimeRate)} sub={d.onTimeRate === null ? "Ingen leverancer i perioden" : "af leverancer med dato"} />
      </section>
      <section className="grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
        <ChartCard title="Projekter pr. fase" description="Ikke-annullerede projekter i visningen." testId="chart-phase" action={<Link href="/production" className="text-xs text-accent hover:underline">Åbn Produktion</Link>}>
          <BarList rows={d.byPhase.filter((p) => p.count > 0).map((p) => ({ key: p.key, label: p.label, values: { count: p.count } }))} series={[{ key: "count", label: "Projekter", slot: 1 }]} format={(n) => `${fmtCount(n)} projekt${n === 1 ? "" : "er"}`} caption="Projekter pr. fase" emptyText="Ingen projekter i visningen." />
        </ChartCard>
        <ChartCard title="Leveringsperformance" description="Leverede projekter pr. interval — til tiden eller forsinket." testId="chart-delivery">
          <ColumnChart
            data={d.series}
            series={[
              { key: "onTime", label: "Til tiden", slot: 1 },
              { key: "late", label: "Forsinket eller uden dato", slot: 2 },
            ]}
            stacked
            format={fmtCount}
            caption="Leveringsperformance over tid"
          />
        </ChartCard>
      </section>
      <section className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] [&>*]:min-w-0">
        <Card data-testid="delivery-projects">
          <CardHeader>
            <CardTitle className="text-base">Projekter og arbejdsbelastning</CardTitle>
            <CardDescription>Forsinkede først, derefter flest åbne opgaver.</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            {d.projects.length ? (
              <table className="w-full min-w-[36rem] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="py-1.5 pr-3 font-medium">Projekt</th>
                    <th className="py-1.5 pr-3 font-medium">Fase</th>
                    <th className="py-1.5 pr-3 font-medium">Levering</th>
                    <th className="py-1.5 pr-3 text-right font-medium">Åbne opg.</th>
                    <th className="py-1.5 text-right font-medium">Agenter</th>
                  </tr>
                </thead>
                <tbody>
                  {d.projects.map((p) => (
                    <tr key={p.id} className="border-b border-border/60 last:border-0" data-testid="delivery-row">
                      <td className="py-2 pr-3">
                        <Link href={`/production/projects/${p.id}`} className="font-medium hover:text-accent hover:underline">
                          {p.name}
                        </Link>
                        <span className="block text-xs text-muted-foreground">
                          {p.customerName}
                          {p.isDemo ? " · demo" : ""}
                        </span>
                      </td>
                      <td className="py-2 pr-3">
                        <span className="flex flex-wrap gap-1">
                          <Badge variant="outline">{p.phase}</Badge>
                          {p.pendingApproval && <Badge variant="warning">Godkendelse</Badge>}
                        </span>
                      </td>
                      <td className="py-2 pr-3">{p.overdue ? <Badge variant="destructive"><AlertTriangle /> Forsinket</Badge> : fmtDate(p.targetDate)}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">
                        {p.openTasks}
                        {p.blockedTasks > 0 && <span className="block text-xs text-destructive">{p.blockedTasks} blokeret</span>}
                      </td>
                      <td className="py-2 text-right tabular-nums">{p.agents}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-sm text-muted-foreground">Ingen projekter matcher filtrene.</p>
            )}
          </CardContent>
        </Card>
        <div className="space-y-4">
          <Card data-testid="deadlines">
            <CardHeader>
              <CardTitle className="text-base">Kommende deadlines</CardTitle>
              <CardDescription>Påkrævede opgaver (21 dage) og leveringsdatoer (30 dage).</CardDescription>
            </CardHeader>
            <CardContent>
              {d.deadlines.length ? (
                <ul className="space-y-2 text-sm">
                  {d.deadlines.map((x, i) => (
                    <li key={`${x.projectId}-${x.title}-${i}`} className="flex items-start justify-between gap-2">
                      <Link href={`/production/projects/${x.projectId}${x.kind === "task" ? "?tab=tasks" : ""}`} className="min-w-0 hover:text-accent">
                        <span className="block truncate">{x.title}</span>
                        <span className="block truncate text-xs text-muted-foreground">{x.projectName}</span>
                      </Link>
                      <span className={`shrink-0 text-xs ${x.overdue ? "font-medium text-destructive" : "text-muted-foreground"}`}>{fmtDate(x.date)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">Ingen kommende deadlines.</p>
              )}
            </CardContent>
          </Card>
          <Card data-testid="agent-assignments">
            <CardHeader>
              <CardTitle className="text-base">Agenttilknytninger</CardTitle>
              <CardDescription>AOS-agenter på aktive projekter.</CardDescription>
            </CardHeader>
            <CardContent>
              {d.agents.length ? (
                <ul className="space-y-2 text-sm">
                  {d.agents.map((a) => (
                    <li key={a.id} className="flex items-center justify-between gap-2">
                      <Link href={`/aos/agents/${a.id}`} className="flex min-w-0 items-center gap-2 hover:text-accent">
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: a.color }} aria-hidden />
                        <span className="truncate">{a.name}</span>
                      </Link>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {a.projects} projekt(er) · {a.openTasks} opg.
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">Ingen agenter er tilknyttet aktive projekter.</p>
              )}
            </CardContent>
          </Card>
        </div>
      </section>
      <Definitions keys={["projects", "delivery"]} />
    </div>
  );
}

// ─── AI & Agent Intelligence ───────────────────────────────────────────────

export function AiView({ data }: { data: DashboardData }) {
  const a = data.ai;
  const b = a.budget;
  return (
    <div className="space-y-6" data-testid="ai-view">
      {a.realAiRuns === 0 && (
        <Alert variant="info" title="Ingen rigtige AI-kørsler endnu" >
          Der er ikke gennemført job på Claude API eller Claude Code. Registrerede job er kørt med intern software (demodata) eller blokeret af routeren, fordi opgavetypen ikke er implementeret eller motoren ikke er konfigureret. Der vises intet opdigtet tokenforbrug.
        </Alert>
      )}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6 [&>*]:min-w-0">
        <Stat label="Registrerede job" value={fmtCount(a.registered)} sub={data.period.label.toLowerCase()} testId="ai-registered" />
        <Stat label="Aktive job" value={fmtCount(a.active)} sub="pr. nu" />
        <Stat label="Gennemførte / fejlede" value={`${a.succeeded} / ${a.failed}`} sub={`${a.blocked} blokeret · ${a.cancelled} annulleret`} />
        <Stat label="Gns. gennemførelsestid" value={a.avgDurationSec === null ? "–" : `${a.avgDurationSec.toLocaleString("da-DK")} s`} sub="start → slut" />
        <Stat label="API-omkostninger" value={fmtUsd(a.apiCostUsd)} sub={`${compact(a.tokens.input)} / ${compact(a.tokens.output)} tokens (ind/ud)`} testId="ai-cost" />
        <Stat label="Claude Code-kørsler" value={fmtCount(a.subscriptionRuns)} sub="abonnement — separat fra API" testId="ai-runs" />
      </section>
      <section className="grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
        <ChartCard title="AI-jobstatus" description="Job oprettet i perioden." testId="chart-job-status">
          <SegmentBar
            caption="Jobstatus"
            parts={[
              { key: "succeeded", label: "Gennemført", value: a.succeeded, slot: 1 },
              { key: "failed", label: "Fejlet", value: a.failed, slot: 2 },
              { key: "other", label: "Blokeret og øvrige", value: a.registered - a.succeeded - a.failed, slot: 3 },
            ]}
          />
          <div className="mt-4">
            <ColumnChart
              data={a.series}
              series={[
                { key: "succeeded", label: "Gennemført", slot: 1 },
                { key: "failed", label: "Fejlet", slot: 2 },
                { key: "other", label: "Øvrige (blokeret, i kø …)", slot: 3 },
              ]}
              stacked
              format={fmtCount}
              height={170}
              caption="AI-job pr. interval"
            />
          </div>
        </ChartCard>
        <Card data-testid="budget">
          <CardHeader>
            <CardTitle className="text-base">Budgetstatus i dag</CardTitle>
            <CardDescription>Dagligt loft fra konfigurationen. Abonnement og API holdes adskilt.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <Meter label="Claude API" used={b.aiSpentTodayUsd} limit={b.aiDailyBudgetUsd} format={fmtUsd} configured={b.apiConfigured} note="ANTHROPIC_API_KEY" />
            <Meter label="Claude Code-rutiner" used={b.claudeCodeRunsToday} limit={b.claudeCodeDailyLimit} format={(n) => `${n} kørsler`} configured={b.claudeCodeConfigured} note="rutine-token + AGENCY_PUBLIC_URL" />
          </CardContent>
        </Card>
      </section>
      <section className="grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
        <ChartCard title="Job pr. agent" description="Registrerede job i perioden pr. AOS-agent." testId="chart-agents">
          <BarList rows={a.perAgent.filter((x) => x.jobs > 0).map((x) => ({ key: x.id, label: x.name, sub: `${x.succeeded} gennemført · ${x.failed} fejlet · ${x.blocked} blokeret`, values: { jobs: x.jobs }, href: `/aos/agents/${x.id}` }))} series={[{ key: "jobs", label: "Job", slot: 1 }]} format={(n) => `${fmtCount(n)} job`} caption="Job pr. agent" emptyText="Ingen job i perioden." />
        </ChartCard>
        <ChartCard title="Job pr. motor" description="Intern software, Claude API og Claude Code (abonnement)." testId="chart-engines">
          <BarList rows={a.perEngine.map((e) => ({ key: e.key, label: e.label, sub: `${e.succeeded} gennemført · ${fmtUsd(e.apiCostUsd)} · ${e.subscriptionRuns} kørsler`, values: { jobs: e.jobs } }))} series={[{ key: "jobs", label: "Job", slot: 1 }]} format={(n) => `${fmtCount(n)} job`} caption="Job pr. motor" emptyText="Ingen job i perioden." />
        </ChartCard>
      </section>
      <Card data-testid="recent-activity">
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Seneste agentaktivitet</CardTitle>
          <Link href="/aos/activity" className="text-xs text-accent hover:underline">
            Live Activity
          </Link>
        </CardHeader>
        <CardContent>
          {a.recentActivity.length ? (
            <ul className="divide-y divide-border text-sm">
              {a.recentActivity.map((e, i) => (
                <li key={`${e.jobId}-${i}`} className="flex flex-col gap-0.5 py-2 sm:flex-row sm:items-center sm:justify-between">
                  <Link href={`/aos/jobs/${e.jobId}`} className="min-w-0 hover:text-accent">
                    <span className="block truncate">{e.message}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {e.agentName ?? "Ingen agent"} · {e.jobTitle}
                    </span>
                  </Link>
                  <span className="shrink-0 text-xs text-muted-foreground">{fmtDateTime(e.at)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Ingen registreret agentaktivitet.</p>
          )}
        </CardContent>
      </Card>
      <Definitions keys={["jobs", "ai-costs"]} />
    </div>
  );
}

function Meter({ label, used, limit, format, configured, note }: { label: string; used: number; limit: number; format: (n: number) => string; configured: boolean; note: string }) {
  const pct = limit > 0 ? Math.min(1, used / limit) : 0;
  const tone = pct >= 0.9 ? "bg-destructive" : pct >= 0.7 ? "bg-warning" : "bg-accent";
  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium">{label}</span>
        {configured ? <Badge variant="success">Konfigureret</Badge> : <Badge variant="muted">Ikke konfigureret</Badge>}
      </div>
      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-accent/15" role="meter" aria-valuemin={0} aria-valuemax={limit} aria-valuenow={used} aria-label={label}>
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${pct * 100}%` }} />
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {format(used)} af {format(limit)} i dag{!configured && ` · kræver ${note}`}
      </p>
    </div>
  );
}

// ─── Action Center ─────────────────────────────────────────────────────────

const SEVERITY: Record<ActionSeverity, { label: string; variant: "destructive" | "warning" | "info" | "muted"; icon: React.ComponentType<{ className?: string }> }> = {
  critical: { label: "Kritisk", variant: "destructive", icon: CircleAlert },
  high: { label: "Høj", variant: "destructive", icon: AlertTriangle },
  medium: { label: "Middel", variant: "warning", icon: AlertTriangle },
  low: { label: "Info", variant: "info", icon: Info },
};
const MODULE_LABEL: Record<ActionItem["module"], string> = { crm: "CRM", quotes: "Tilbud", production: "Produktion", aos: "AOS" };

function AllClear() {
  return (
    <p className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
      <CheckCircle2 className="h-4 w-4 text-success" /> Intet kræver handling lige nu.
    </p>
  );
}

export function ActionList({ items, compact: small = false }: { items: ActionItem[]; compact?: boolean }) {
  return (
    <ul className="divide-y divide-border" data-testid="action-list">
      {items.map((a) => {
        const sev = SEVERITY[a.severity];
        return (
          <li key={a.id} data-testid="action-item" data-rule={a.rule} data-severity={a.severity}>
            <Link href={a.href} className="group flex items-start gap-3 py-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <sev.icon className={`mt-0.5 h-4 w-4 shrink-0 ${a.severity === "low" ? "text-accent" : a.severity === "medium" ? "text-warning-foreground" : "text-destructive"}`} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium group-hover:text-accent">{a.title}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {[a.customerName, a.detail].filter(Boolean).join(" · ")}
                </span>
              </span>
              <span className="flex shrink-0 flex-col items-end gap-1">
                <Badge variant={sev.variant}>{sev.label}</Badge>
                {!small && <span className="text-[11px] text-muted-foreground">{MODULE_LABEL[a.module]}</span>}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

const RULE_LABELS: Record<string, string> = {
  overdue_followup: "Forsinkede CRM-opfølgninger",
  opportunity_without_next_activity: "Salgsmuligheder uden næste aktivitet",
  close_date_passed: "Forventet lukning passeret",
  project_overdue: "Forsinkede projekter",
  project_without_lead: "Projekter uden projektleder",
  blocked_tasks: "Blokerede opgaver",
  delivery_upcoming: "Kommende leverancer",
  approval_pending: "Afventende godkendelser",
  job_failed: "Fejlede AI-jobs",
  quote_awaiting_answer: "Tilbud uden svar",
  quote_without_opportunity: "Tilbud uden salgsmulighed",
};

export function ActionCenter({ data }: { data: DashboardData }) {
  const [rule, setRule] = React.useState<string>("");
  const counts = new Map<string, number>();
  for (const a of data.actions) counts.set(a.rule, (counts.get(a.rule) ?? 0) + 1);
  const visible = data.actions.filter((a) => !rule || a.rule === rule);
  return (
    <div className="space-y-6" data-testid="action-center">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrér på regel">
        <button type="button" onClick={() => setRule("")} className={`rounded-full border px-3 py-1 text-xs ${rule === "" ? "border-accent bg-accent/10 text-foreground" : "border-border text-muted-foreground"}`} aria-pressed={rule === ""}>
          Alle <span className="tabular-nums">{data.actions.length}</span>
        </button>
        {Object.entries(RULE_LABELS)
          .filter(([k]) => counts.has(k))
          .map(([k, label]) => (
            <button key={k} type="button" onClick={() => setRule(k)} data-testid={`rule-${k}`} className={`rounded-full border px-3 py-1 text-xs ${rule === k ? "border-accent bg-accent/10 text-foreground" : "border-border text-muted-foreground"}`} aria-pressed={rule === k}>
              {label} <span className="tabular-nums">{counts.get(k)}</span>
            </button>
          ))}
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ListChecks className="h-4 w-4 text-accent" /> {visible.length} handling(er)
          </CardTitle>
          <CardDescription>Sorteret efter alvor og dato. Hver handling åbner den relevante kunde, opgave, godkendelse eller projekt.</CardDescription>
        </CardHeader>
        <CardContent>{visible.length ? <ActionList items={visible} /> : <AllClear />}</CardContent>
      </Card>
      <Definitions keys={["actions"]} />
    </div>
  );
}

