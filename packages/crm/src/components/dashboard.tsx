"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Alert, apiFetch, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Select, Spinner } from "@agency/ui";
import { Building2, CalendarClock, CheckCircle2, Circle, FlaskConical, Kanban, ListTodo, Play, RotateCcw, Search } from "lucide-react";
import type { CrmDashboard } from "../server/service";
import { DEMO_STEPS, type Activity, type CrmDemoState } from "../contracts";
import { ActivityRow, formatKr, isOverdue } from "./shared";

interface Kpi {
  key: string;
  label: string;
  value: React.ReactNode;
  sub: string;
  href: string;
  tone?: "danger";
}

export function CrmDashboardView({
  dashboard,
  openQuotes,
  upcoming,
  overdue,
  period,
  demo,
}: {
  dashboard: CrmDashboard;
  openQuotes: number;
  upcoming: Array<Activity & { accountName: string }>;
  overdue: Array<Activity & { accountName: string }>;
  period: string;
  demo: CrmDemoState | null;
}) {
  const router = useRouter();
  const [query, setQuery] = React.useState("");
  const c = dashboard.counts;
  const periodLabel = dashboard.periodDays ? `seneste ${dashboard.periodDays} dage` : "hele perioden";
  const kpis: Kpi[] = [
    { key: "new-leads", label: "Nye leads", value: c.newLeads, sub: periodLabel, href: "/crm/companies?status=new_lead" },
    { key: "active-leads", label: "Aktive leads", value: c.activeLeads, sub: "nye, under bearbejdning, kvalificerede", href: "/crm/companies?status=leads" },
    { key: "qualified", label: "Kvalificerede leads", value: c.qualifiedLeads, sub: "klar til salgsmulighed", href: "/crm/companies?status=qualified" },
    { key: "meetings", label: "Planlagte møder", value: c.plannedMeetings, sub: "fremtidige møder", href: "/crm/activities?view=planned&kind=meeting" },
    { key: "open-quotes", label: "Åbne tilbud", value: openQuotes, sub: "udkast og sendte", href: "/quotes" },
    { key: "pipeline", label: "Pipelineværdi", value: formatKr(dashboard.pipeline.implementation), sub: `+ ${formatKr(dashboard.pipeline.monthly)}/md. · ${c.openOpportunities} åbne`, href: "/crm/pipeline" },
    { key: "won", label: "Vundne aftaler", value: c.wonDeals, sub: `${formatKr(dashboard.won.implementation)} + ${formatKr(dashboard.won.monthly)}/md.`, href: "/crm/pipeline?status=won" },
    { key: "lost", label: "Tabte aftaler", value: c.lostDeals, sub: periodLabel, href: "/crm/pipeline?status=lost" },
    { key: "customers", label: "Aktive kunder", value: c.activeCustomers, sub: "status: aktiv kunde", href: "/crm/companies?status=customer" },
    { key: "follow-ups", label: "Kommende opfølgninger", value: c.upcomingFollowUps, sub: "næste 7 dage", href: "/crm/activities?view=upcoming" },
    { key: "overdue", label: "Forsinkede aktiviteter", value: c.overdueActivities, sub: "planlagt, men overskredet", href: "/crm/activities?view=overdue", tone: "danger" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <form
          className="relative w-full md:max-w-md"
          onSubmit={(e) => {
            e.preventDefault();
            router.push(`/crm/companies?q=${encodeURIComponent(query)}`);
          }}
        >
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-8" placeholder="Søg virksomhed, kontakt eller tag" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Søg i CRM" data-testid="crm-search" />
        </form>
        <div className="flex flex-wrap items-center gap-2">
          <Select aria-label="Periode" className="w-44" value={period} onChange={(e) => router.push(`/crm?period=${e.target.value}`)} data-testid="crm-period">
            <option value="7">Seneste 7 dage</option>
            <option value="30">Seneste 30 dage</option>
            <option value="90">Seneste 90 dage</option>
            <option value="all">Hele perioden</option>
          </Select>
          <Link href="/crm/companies">
            <Button variant="outline">
              <Building2 /> Virksomheder
            </Button>
          </Link>
          <Link href="/crm/pipeline">
            <Button variant="outline" data-testid="open-pipeline">
              <Kanban /> Pipeline
            </Button>
          </Link>
          <Link href="/crm/activities">
            <Button variant="outline">
              <ListTodo /> Aktiviteter
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6 [&>*]:min-w-0" data-testid="crm-kpis">
        {kpis.map((k) => (
          <Link key={k.key} href={k.href} data-testid={`crm-kpi-${k.key}`} className="group block rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <div className="h-full rounded-xl border border-border bg-card p-4 shadow-card transition-all group-hover:-translate-y-0.5 group-hover:border-accent/50">
              <p className="text-xs font-medium uppercase tracking-[0.1em] text-muted-foreground">{k.label}</p>
              <p className={`mt-1 truncate text-2xl font-semibold tabular-nums ${k.tone === "danger" && Number(k.value) > 0 ? "text-destructive" : ""}`}>{k.value}</p>
              <p className="truncate text-[11px] text-muted-foreground">{k.sub}</p>
            </div>
          </Link>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2" data-testid="pipeline-values">
        <Card>
          <CardContent className="space-y-1 p-4">
            <p className="text-xs font-medium uppercase tracking-[0.1em] text-muted-foreground">Åben pipeline — engangsomsætning</p>
            <p className="text-xl font-semibold tabular-nums">{formatKr(dashboard.pipeline.implementation)}</p>
            <p className="text-xs text-muted-foreground">Vægtet efter sandsynlighed: {formatKr(dashboard.pipeline.weightedImplementation)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-1 p-4">
            <p className="text-xs font-medium uppercase tracking-[0.1em] text-muted-foreground">Åben pipeline — tilbagevendende (MRR)</p>
            <p className="text-xl font-semibold tabular-nums">{formatKr(dashboard.pipeline.monthly)}/md.</p>
            <p className="text-xs text-muted-foreground">Vægtet efter sandsynlighed: {formatKr(dashboard.pipeline.weightedMonthly)}/md.</p>
          </CardContent>
        </Card>
      </div>

      {dashboard.mode === "demo" && <GuidedCrmDemo state={demo} />}

      <div className="grid gap-6 lg:grid-cols-3 [&>*]:min-w-0">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarClock className="h-4 w-4 text-accent" /> Kommende opfølgninger
            </CardTitle>
          </CardHeader>
          <CardContent>
            {upcoming.length === 0 ? (
              <p className="text-sm text-muted-foreground">Intet planlagt de næste 7 dage.</p>
            ) : (
              <ul className="divide-y divide-border/60" data-testid="crm-upcoming">
                {upcoming.slice(0, 8).map((a) => (
                  <ActivityRow key={a.id} activity={a} accountName={a.accountName} onChange={() => router.refresh()} />
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Forsinkede aktiviteter</CardTitle>
          </CardHeader>
          <CardContent>
            {overdue.filter(isOverdue).length === 0 ? (
              <p className="text-sm text-muted-foreground">Ingen forsinkede aktiviteter.</p>
            ) : (
              <ul className="divide-y divide-border/60" data-testid="crm-overdue">
                {overdue.slice(0, 8).map((a) => (
                  <ActivityRow key={a.id} activity={a} accountName={a.accountName} onChange={() => router.refresh()} />
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Seneste salgsaktiviteter</CardTitle>
            <CardDescription>Udførte aktiviteter · {periodLabel}</CardDescription>
          </CardHeader>
          <CardContent>
            {dashboard.recentActivities.length === 0 ? (
              <p className="text-sm text-muted-foreground">Ingen registrerede aktiviteter i perioden.</p>
            ) : (
              <ul className="divide-y divide-border/60" data-testid="crm-recent">
                {dashboard.recentActivities.map((a) => (
                  <ActivityRow key={a.id} activity={a} accountName={a.accountName} onChange={() => router.refresh()} />
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/** Guidet demo: én salgsproces fra lead til mersalg. Hvert trin bruger platformens rigtige funktioner på demodata. */
export function GuidedCrmDemo({ state }: { state: CrmDemoState | null }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const step = state?.step ?? 0;
  const done = step >= DEMO_STEPS.length;

  async function run(action: "step" | "reset") {
    setBusy(action);
    setError(null);
    try {
      const res = await apiFetch<{ message: string }>("/api/crm/demo", { body: { action } });
      setMessage(res.message);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card className="border-warning/50 bg-gradient-to-br from-warning/10 via-card to-card" data-testid="crm-demo">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2">
            <FlaskConical className="h-4 w-4 text-warning-foreground" /> Guidet CRM-demo: Bryggeriet Nordlys
          </CardTitle>
          <span className="text-xs font-medium text-muted-foreground" data-testid="crm-demo-progress">
            {Math.min(step, DEMO_STEPS.length)} af {DEMO_STEPS.length} trin
          </span>
        </div>
        <CardDescription>Fra lead til aktiv kunde og mersalg — med de rigtige funktioner på fiktive eksempeldata. Der sendes ingen e-mails, foretages ingen opkald og startes ingen betalte AI-opgaver.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {DEMO_STEPS.map((s, i) => (
            <li key={s.key} className={`flex items-start gap-2 rounded-lg border p-2.5 text-sm ${i < step ? "border-success/30 bg-success/5" : i === step ? "border-accent bg-accent/5" : "border-border bg-card"}`} data-demo-step={s.key} data-demo-done={i < step}>
              {i < step ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" /> : <Circle className={`mt-0.5 h-4 w-4 shrink-0 ${i === step ? "text-accent" : "text-muted-foreground"}`} />}
              <span>
                <span className="font-medium">
                  {i + 1}. {s.title}
                </span>
                <span className="block text-xs text-muted-foreground">{s.detail}</span>
              </span>
            </li>
          ))}
        </ol>
        <div className="flex flex-wrap items-center gap-2">
          {!done && (
            <Button onClick={() => run("step")} disabled={busy !== null} data-testid="crm-demo-next">
              {busy === "step" ? <Spinner /> : <Play />} {step === 0 ? "Start demoen" : `Næste trin: ${DEMO_STEPS[step]!.title}`}
            </Button>
          )}
          <Button variant="outline" onClick={() => run("reset")} disabled={busy !== null || step === 0} data-testid="crm-demo-reset">
            {busy === "reset" ? <Spinner /> : <RotateCcw />} Nulstil demo
          </Button>
          {state?.accountId && step > 0 && (
            <Link href={`/crm/companies/${state.accountId}`} className="text-sm text-accent hover:underline" data-testid="crm-demo-account">
              Åbn kundeprofilen →
            </Link>
          )}
        </div>
        {message && (
          <p className="text-sm" role="status" data-testid="crm-demo-message">
            {message}
          </p>
        )}
        {error && <Alert variant="error">{error}</Alert>}
      </CardContent>
    </Card>
  );
}
