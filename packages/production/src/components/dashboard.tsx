"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Alert, apiFetch, Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState, Input, Select, Spinner } from "@agency/ui";
import { formatDateTime } from "@agency/shared";
import { CalendarClock, FlaskConical, FolderKanban, LayoutGrid, List, Plus, RotateCcw, Search, Sparkles } from "lucide-react";
import type { ProductionDashboard } from "../server/service";
import { PHASE_GROUP, phaseLabel, type Priority } from "../contracts";
import { GateBadge, OverdueBadge, PhaseTrack, PriorityBadge, ProjectStatusBadge, SimulatedBadge, formatDate, formatKr } from "./shared";

type GroupFilter = "" | "planning" | "development" | "testing" | "approval" | "delivered" | "overdue";

const KPIS: Array<{ key: GroupFilter | "active"; label: string; sub: string }> = [
  { key: "active", label: "Aktive projekter", sub: "i gang eller på pause" },
  { key: "planning", label: "Planlægning", sub: "oprettet, krav, arkitektur" },
  { key: "development", label: "Udvikling", sub: "udvikling og integrationer" },
  { key: "testing", label: "Test", sub: "kvalitetssikring" },
  { key: "approval", label: "Afventer godkendelse", sub: "intern og kunde" },
  { key: "delivered", label: "Leveret", sub: "leveret og i drift" },
  { key: "overdue", label: "Forsinkede", sub: "over deadline" },
];

export function ProductionDashboardView({ dashboard, mode, serviceNames }: { dashboard: ProductionDashboard; mode: "demo" | "live"; serviceNames: Record<string, string> }) {
  const router = useRouter();
  const [query, setQuery] = React.useState("");
  const [group, setGroup] = React.useState<GroupFilter>("");
  const [priority, setPriority] = React.useState<"" | Priority>("");
  const [view, setView] = React.useState<"cards" | "table">("cards");
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const hasDemo = dashboard.projects.some((p) => p.project.isDemo);

  const q = query.trim().toLowerCase();
  const visible = dashboard.projects.filter(({ project, overdue }) => {
    if (q && !`${project.name} ${project.customer.name} ${serviceNames[project.serviceBaseKey] ?? ""}`.toLowerCase().includes(q)) return false;
    if (priority && project.priority !== priority) return false;
    if (group === "overdue") return overdue;
    if (group === "approval") return PHASE_GROUP[project.phase] === "approval" || Boolean(project.pendingGate);
    if (group) return PHASE_GROUP[project.phase] === group;
    return true;
  });

  async function demo(reset: boolean) {
    setBusy(reset ? "reset" : "seed");
    setError(null);
    try {
      const res = await apiFetch<{ restaurantNordId: string }>("/api/production/demo", { body: { reset } });
      if (!reset) router.push(`/production/projects/${res.restaurantNordId}`);
      else router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-7" data-testid="production-kpis">
        {KPIS.map((k) => {
          const value = k.key === "active" ? dashboard.counts.active : dashboard.counts[k.key as Exclude<GroupFilter, "">];
          const active = k.key !== "active" && group === k.key;
          return (
            <button
              key={k.key}
              type="button"
              onClick={() => setGroup(k.key === "active" || active ? "" : (k.key as GroupFilter))}
              className={`rounded-xl border bg-card p-4 text-left shadow-card transition-all hover:-translate-y-0.5 hover:border-accent/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${active ? "border-accent ring-1 ring-accent/30" : "border-border"}`}
              aria-pressed={active}
              data-testid={`kpi-${k.key}`}
            >
              <p className="text-xs font-medium uppercase tracking-[0.1em] text-muted-foreground">{k.label}</p>
              <p className={`mt-1 text-2xl font-semibold tabular-nums ${k.key === "overdue" && value > 0 ? "text-destructive" : "text-foreground"}`}>{value}</p>
              <p className="text-[11px] text-muted-foreground">{k.sub}</p>
            </button>
          );
        })}
      </div>

      {mode === "demo" && (
        <Card className="border-warning/40 bg-warning/5" data-testid="demo-controls">
          <CardContent className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-start gap-3 text-sm">
              <FlaskConical className="mt-0.5 h-5 w-5 shrink-0 text-warning-foreground" />
              <div>
                <p className="font-medium">Demo Mode — fiktive kunder og eksempeldata</p>
                <p className="text-muted-foreground">
                  Demoporteføljen viser hele forløbet fra accepteret tilbud til drift. Simuleret agentarbejde er tydeligt markeret; der udføres ingen AI-kald eller eksterne ændringer.
                </p>
              </div>
            </div>
            <div className="flex shrink-0 gap-2">
              {!hasDemo ? (
                <Button onClick={() => demo(false)} disabled={busy !== null} data-testid="load-demo">
                  {busy === "seed" ? <Spinner /> : <Sparkles />} Indlæs demo: Restaurant Nord
                </Button>
              ) : (
                <Button variant="outline" onClick={() => demo(true)} disabled={busy !== null} data-testid="reset-demo">
                  {busy === "reset" ? <Spinner /> : <RotateCcw />} Nulstil demo
                </Button>
              )}
            </div>
          </CardContent>
          {error && (
            <div className="px-4 pb-4">
              <Alert variant="error">{error}</Alert>
            </div>
          )}
        </Card>
      )}

      <div className="grid gap-6 xl:grid-cols-[1fr_340px] [&>*]:min-w-0">
        <Card>
          <CardHeader className="gap-3">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <CardTitle>Kundeprojekter ({visible.length})</CardTitle>
              <div className="flex items-center gap-2">
                <Link href="/production/new">
                  <Button size="sm" data-testid="new-project">
                    <Plus /> Nyt projekt
                  </Button>
                </Link>
                <div className="flex rounded-lg border border-border p-0.5" role="group" aria-label="Visning">
                  <button type="button" onClick={() => setView("cards")} aria-pressed={view === "cards"} className={`rounded-md p-1.5 ${view === "cards" ? "bg-muted" : ""}`} aria-label="Kort">
                    <LayoutGrid className="h-4 w-4" />
                  </button>
                  <button type="button" onClick={() => setView("table")} aria-pressed={view === "table"} className={`rounded-md p-1.5 ${view === "table" ? "bg-muted" : ""}`} aria-label="Tabel">
                    <List className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-[2fr_1fr_1fr]">
              <div className="relative min-w-0">
                <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input className="pl-8" placeholder="Søg i projekter, kunder og services" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Søg" data-testid="project-search" />
              </div>
              <Select aria-label="Fase" value={group} onChange={(e) => setGroup(e.target.value as GroupFilter)} data-testid="filter-group">
                <option value="">Alle faser</option>
                <option value="planning">Planlægning</option>
                <option value="development">Udvikling</option>
                <option value="testing">Test</option>
                <option value="approval">Afventer godkendelse</option>
                <option value="delivered">Leveret</option>
                <option value="overdue">Forsinkede</option>
              </Select>
              <Select aria-label="Prioritet" value={priority} onChange={(e) => setPriority(e.target.value as "" | Priority)}>
                <option value="">Alle prioriteter</option>
                <option value="critical">Kritisk</option>
                <option value="high">Høj</option>
                <option value="normal">Normal</option>
                <option value="low">Lav</option>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            {visible.length === 0 ? (
              <EmptyState
                icon={<FolderKanban />}
                title={dashboard.projects.length ? "Ingen projekter matcher filtrene" : "Ingen produktionsprojekter endnu"}
                description={dashboard.projects.length ? "Ret søgning eller filtre." : "Opret et projekt, overfør et accepteret tilbud eller indlæs demoen."}
              />
            ) : view === "cards" ? (
              <div className="grid gap-3 md:grid-cols-2 [&>*]:min-w-0" data-testid="project-cards">
                {visible.map(({ project, progress, overdue, nextDeadline }) => (
                  <Link key={project.id} href={`/production/projects/${project.id}`} className="group block rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-ring" data-testid="project-card">
                    <div className="h-full space-y-3 rounded-xl border border-border bg-card p-4 transition-all group-hover:-translate-y-0.5 group-hover:border-accent/50 group-hover:shadow-md">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate font-semibold">{project.name}</p>
                          <p className="truncate text-sm text-muted-foreground">
                            {project.customer.name} · {serviceNames[project.serviceBaseKey] ?? "Skræddersyet"}
                          </p>
                        </div>
                        <PriorityBadge priority={project.priority} />
                      </div>
                      <PhaseTrack project={project} compact />
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge variant="outline">{phaseLabel(project.phase)}</Badge>
                        {project.pendingGate && <GateBadge />}
                        {overdue && <OverdueBadge />}
                        {project.isDemo && <SimulatedBadge label="Demo" />}
                      </div>
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span className="tabular-nums">
                          {progress.percent}% · {progress.done}/{progress.total} opgaver
                        </span>
                        <span>{nextDeadline ? `Næste: ${formatDate(nextDeadline.date)}` : `Levering: ${formatDate(project.targetDate)}`}</span>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm" data-testid="project-table">
                  <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <tr className="border-b border-border">
                      <th className="py-2 pr-3 font-medium">Projekt</th>
                      <th className="py-2 pr-3 font-medium">Fase</th>
                      <th className="py-2 pr-3 font-medium">Status</th>
                      <th className="py-2 pr-3 text-right font-medium">Fremdrift</th>
                      <th className="py-2 pr-3 text-right font-medium">Implementering</th>
                      <th className="py-2 font-medium">Levering</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map(({ project, progress, overdue }) => (
                      <tr key={project.id} className="border-b border-border/60 last:border-0 hover:bg-muted/40">
                        <td className="py-2.5 pr-3">
                          <Link className="font-medium text-accent hover:underline" href={`/production/projects/${project.id}`}>
                            {project.name}
                          </Link>
                          <p className="text-xs text-muted-foreground">{project.customer.name}</p>
                        </td>
                        <td className="py-2.5 pr-3">{phaseLabel(project.phase)}</td>
                        <td className="py-2.5 pr-3">
                          <div className="flex flex-wrap gap-1">
                            <ProjectStatusBadge status={project.status} />
                            {overdue && <OverdueBadge />}
                          </div>
                        </td>
                        <td className="py-2.5 pr-3 text-right tabular-nums">{progress.percent}%</td>
                        <td className="py-2.5 pr-3 text-right tabular-nums">{formatKr(project.pricing.implementationPrice)}</td>
                        <td className="whitespace-nowrap py-2.5">{formatDate(project.targetDate)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CalendarClock className="h-4 w-4 text-accent" /> Kommende deadlines
              </CardTitle>
            </CardHeader>
            <CardContent>
              {dashboard.deadlines.length === 0 ? (
                <p className="text-sm text-muted-foreground">Ingen deadlines de næste 3 uger.</p>
              ) : (
                <ul className="space-y-2.5 text-sm" data-testid="deadlines">
                  {dashboard.deadlines.map((d, i) => (
                    <li key={i} className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <Link href={`/production/projects/${d.projectId}`} className="block truncate font-medium hover:underline">
                          {d.title}
                        </Link>
                        <p className="truncate text-xs text-muted-foreground">{d.projectName}</p>
                      </div>
                      <span className={`shrink-0 text-xs tabular-nums ${d.overdue ? "font-semibold text-destructive" : "text-muted-foreground"}`}>{formatDate(d.date)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Tilknyttede agenter</CardTitle>
              <CardDescription>Fra AOS · planlagte ressourcer på aktive projekter</CardDescription>
            </CardHeader>
            <CardContent>
              {dashboard.agents.length === 0 ? (
                <p className="text-sm text-muted-foreground">Ingen agenter tilknyttet aktive projekter.</p>
              ) : (
                <ul className="space-y-2 text-sm" data-testid="production-agents">
                  {dashboard.agents.map((a) => (
                    <li key={a.agentId} className="flex items-center justify-between gap-2">
                      <Link href={`/aos/agents/${a.agentId}`} className="flex items-center gap-2 hover:underline">
                        <span className="flex h-6 w-6 items-center justify-center rounded-md text-[11px] font-bold text-white" style={{ background: a.color }} aria-hidden>
                          {a.name.slice(0, 1)}
                        </span>
                        {a.name}
                      </Link>
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {a.projects} projekter · {a.openTasks} åbne opgaver
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Seneste aktivitet</CardTitle>
            </CardHeader>
            <CardContent>
              {dashboard.activity.length === 0 ? (
                <p className="text-sm text-muted-foreground">Ingen aktivitet endnu.</p>
              ) : (
                <ul className="space-y-3 text-sm" data-testid="production-activity">
                  {dashboard.activity.map((e) => (
                    <li key={e.id} className="space-y-0.5">
                      <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                        <time dateTime={e.at}>{formatDateTime(e.at)}</time>
                        {e.simulated && <SimulatedBadge />}
                      </div>
                      <p className="leading-snug">{e.message}</p>
                      <Link href={`/production/projects/${e.projectId}`} className="text-xs text-accent hover:underline">
                        {e.projectName}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
