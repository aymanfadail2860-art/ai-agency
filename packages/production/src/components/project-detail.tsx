"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { PublicAiJob } from "@agency/orchestrator";
import { Alert, apiFetch, Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Label, Select, Spinner, Tabs, Textarea } from "@agency/ui";
import { ArrowRight, Check, CheckCircle2, ExternalLink, FlaskConical, Lock, Play, RotateCcw, X } from "lucide-react";
import type { ProjectBundle, ProjectFinance } from "../server/service";
import { AGENT_ROLE_LABELS, DELIVERABLE_STATUS_LABELS, PHASES, PRIORITY_LABELS, PROJECT_STATUS_LABELS, phaseIndex, phaseLabel, type Phase, type Priority, type ProjectStatus } from "../contracts";
import { ActivityTab, AgentsTab, ArchitectureTab, FilesTab, FinanceTab, TasksTab, TestingTab } from "./project-tabs";
import { GateBadge, OverdueBadge, PhaseTrack, SimulatedBadge, formatDate, formatKr } from "./shared";

export interface AgentView {
  id: string;
  key: string;
  name: string;
  role: string;
  color: string;
  enabled: boolean;
  status: "working" | "waiting" | "idle" | "error" | "disabled";
  statusLabel: string;
}

export interface ProjectDetailProps {
  bundle: ProjectBundle;
  finance: ProjectFinance;
  jobs: PublicAiJob[];
  agents: AgentView[];
  serviceBase: { key: string; name: string; version: string } | null;
  pendingApproval: { id: string; title: string; reasons: string[] } | null;
  blockers: string[];
  mode: "demo" | "live";
  overdue: boolean;
}

/** Hvad der sker i hver fase — vises i den guidede demo og på oversigten. */
export const PHASE_GUIDE: Record<Phase, { what: string; agents: string; gate?: string }> = {
  created: { what: "Aftalen er overført fra det accepterede tilbud. Opstart bekræftes med kunden.", agents: "Atlas (projektleder) planlægger forløbet." },
  requirements: { what: "Kravworkshop, vidensbase og kravspecifikation med acceptkriterier.", agents: "Atlas indsamler krav og dokumenterer dem." },
  architecture: { what: "Teknisk arkitektur ud fra grundbasen, integrationsplan og testplan.", agents: "Forge designer løsningen, Link planlægger integrationer, Vega skriver testplanen." },
  development: { what: "Grundbasen tilpasses kunden: funktioner, vidensbase og administrationspanel.", agents: "Forge udvikler på en claude/-gren." },
  integrations: { what: "Telefoni, stemmeplatform, bookingsystem og SMS forbindes og testes.", agents: "Link opsætter og tester integrationerne." },
  qa: { what: "Testplanen gennemføres; fejl registreres, rettes og regressionstestes.", agents: "Vega tester, Forge retter fejl." },
  internal_approval: { what: "Leverancen gennemgås internt mod kravspecifikationen.", agents: "Atlas gennemgår.", gate: "Overgangen til kundegodkendelse kræver godkendelse i AOS." },
  customer_approval: { what: "Løsningen demonstreres, og kundens skriftlige godkendelse registreres.", agents: "Atlas præsenterer for kunden." },
  deployment: { what: "Produktionsopsætning, go-live og overvågning.", agents: "Forge deployer, Link sætter overvågning op.", gate: "Deployment kræver altid godkendelse i AOS — i demoen udføres ingen rigtig deployment." },
  delivered: { what: "Overlevering, dokumentation og adgang til kunden.", agents: "Atlas overleverer." },
  maintenance: { what: "Løbende drift efter vedligeholdelsesplanen.", agents: "Vega overvåger kvaliteten løbende." },
};

function GuidedDemo({ project, pendingApproval, onDone }: { project: ProjectBundle["project"]; pendingApproval: ProjectDetailProps["pendingApproval"]; onDone: () => void }) {
  const [busy, setBusy] = React.useState<string | null>(null);
  const [actions, setActions] = React.useState<string[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const step = phaseIndex(project.phase);
  const guide = PHASE_GUIDE[project.phase];
  const finished = project.phase === "maintenance";

  async function run(key: string, fn: () => Promise<void>) {
    setBusy(key);
    setError(null);
    try {
      await fn();
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card className="border-warning/50 bg-gradient-to-br from-warning/10 via-card to-card" data-testid="guided-demo">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2">
            <FlaskConical className="h-4 w-4 text-warning-foreground" /> Guidet demo
          </CardTitle>
          <Badge variant="demo" data-testid="guided-step">
            Trin {step + 1} af {PHASES.length}: {phaseLabel(project.phase)}
          </Badge>
        </div>
        <CardDescription>
          Følg projektet gennem produktionsfaserne. "Simulér fase" markerer fasens opgaver som udført med eksempeldata. Det er en simulering — ingen AI-agent har udført arbejdet, og der foretages ingen AI-kald eller eksterne ændringer.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 text-sm md:grid-cols-2">
          <div className="rounded-lg border border-border bg-card p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">I denne fase</p>
            <p className="mt-1">{guide.what}</p>
          </div>
          <div className="rounded-lg border border-border bg-card p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Agenter i Live Mode (senere)</p>
            <p className="mt-1">{guide.agents}</p>
          </div>
        </div>
        {project.pendingGate && pendingApproval ? (
          <div className="space-y-3 rounded-lg border border-warning/50 bg-warning/10 p-3 text-sm" data-testid="gate-panel">
            <p className="flex items-center gap-2 font-medium">
              <Lock className="h-4 w-4" /> Faseport: {pendingApproval.title}
            </p>
            <p className="text-muted-foreground">{pendingApproval.reasons.join(" ")} Godkendelsen ligger i AOS' Approval Manager og kan også afgøres her.</p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => run("approve", async () => void (await apiFetch(`/api/aos/approvals/${pendingApproval.id}`, { body: { decision: "approved", note: "Godkendt i demoforløbet" } })))} disabled={busy !== null} data-testid="gate-approve">
                {busy === "approve" ? <Spinner /> : <Check />} Godkend
              </Button>
              <Button size="sm" variant="outline" onClick={() => run("reject", async () => void (await apiFetch(`/api/aos/approvals/${pendingApproval.id}`, { body: { decision: "rejected", note: "Afvist i demoforløbet" } })))} disabled={busy !== null}>
                <X /> Afvis
              </Button>
              <Link href="/aos/approvals" className="inline-flex items-center gap-1 text-xs text-accent hover:underline">
                Se i AOS <ExternalLink className="h-3 w-3" />
              </Link>
            </div>
          </div>
        ) : finished ? (
          <Alert variant="success" title="Demoforløbet er gennemført">
            Projektet er leveret og i vedligeholdelse. Brug "Nulstil demo" på produktionsoversigten for at starte forfra.
          </Alert>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              onClick={() =>
                run("simulate", async () => {
                  const res = await apiFetch<{ actions: string[] }>(`/api/production/projects/${project.id}/simulate`, { body: {} });
                  setActions(res.actions);
                })
              }
              disabled={busy !== null}
              data-testid="simulate-phase"
            >
              {busy === "simulate" ? <Spinner /> : <Play />} Simulér fasen "{phaseLabel(project.phase)}"
            </Button>
            {guide.gate && <span className="text-xs text-muted-foreground">{guide.gate}</span>}
          </div>
        )}
        {actions.length > 0 && (
          <ul className="space-y-1 text-sm" data-testid="simulation-actions">
            {actions.map((a, i) => (
              <li key={i} className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" /> {a}
              </li>
            ))}
          </ul>
        )}
        {error && <Alert variant="error">{error}</Alert>}
      </CardContent>
    </Card>
  );
}

function OverviewTab({ props, onChange }: { props: ProjectDetailProps; onChange: () => void }) {
  const { project, tasks } = props.bundle;
  const [notes, setNotes] = React.useState(project.notes);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const required = tasks.filter((t) => t.required);
  const done = required.filter((t) => t.status === "done").length;
  const percent = required.length ? Math.round((done / required.length) * 100) : 0;
  const daysLeft = project.targetDate ? Math.round((new Date(`${project.targetDate}T12:00:00Z`).getTime() - Date.now()) / 86_400_000) : null;
  const deliveredCount = project.deliverables.filter((d) => d.status === "delivered" || d.status === "approved").length;

  async function patch(key: string, body: unknown) {
    setBusy(key);
    setError(null);
    try {
      await apiFetch(`/api/production/projects/${project.id}`, { method: "PATCH", body });
      onChange();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px] [&>*]:min-w-0" data-testid="tab-overview">
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            ["Fremdrift", `${percent}%`, `${done}/${required.length} påkrævede opgaver`],
            ["Fase", `${phaseIndex(project.phase) + 1}/11`, phaseLabel(project.phase)],
            ["Leverancer", `${deliveredCount}/${project.deliverables.length}`, "godkendt eller leveret"],
            ["Levering", daysLeft === null ? "–" : daysLeft >= 0 ? `${daysLeft} dage` : `${-daysLeft} dage over`, formatDate(project.targetDate)],
          ].map(([label, value, sub]) => (
            <Card key={label}>
              <CardContent className="space-y-1 p-4">
                <p className="text-xs uppercase tracking-[0.1em] text-muted-foreground">{label}</p>
                <p className={`text-xl font-semibold tabular-nums ${label === "Levering" && daysLeft !== null && daysLeft < 0 && project.status === "active" ? "text-destructive" : ""}`}>{value}</p>
                <p className="truncate text-xs text-muted-foreground">{sub}</p>
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} aria-label="Fremdrift">
          <div className="h-full rounded-full bg-accent transition-all duration-500" style={{ width: `${percent}%` }} />
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Beskrivelse</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <p className="whitespace-pre-line">{project.description}</p>
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Aftalte leverancer</p>
              <ul className="grid gap-2 sm:grid-cols-2">
                {project.deliverables.map((d) => (
                  <li key={d.id} className="flex items-start justify-between gap-2 rounded-lg border border-border p-2.5">
                    <span className="min-w-0">
                      <span className="block font-medium">{d.name}</span>
                      {d.description && <span className="block text-xs text-muted-foreground">{d.description}</span>}
                    </span>
                    <Badge variant={d.status === "delivered" || d.status === "approved" ? "success" : d.status === "planned" ? "muted" : "info"}>{DELIVERABLE_STATUS_LABELS[d.status]}</Badge>
                  </li>
                ))}
              </ul>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Vedligeholdelsesplan</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>{project.maintenance.plan}</p>
            <p className="text-muted-foreground">SLA: {project.maintenance.sla}</p>
            <ul className="ml-4 list-disc text-muted-foreground">
              {project.maintenance.recurringTasks.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Projekt</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <dl className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-2">
              <dt className="text-muted-foreground">Kunde</dt>
              <dd>
                {project.customer.brandId ? (
                  <Link href={`/research/brands/${project.customer.brandId}`} className="text-accent hover:underline">
                    {project.customer.name}
                  </Link>
                ) : (
                  project.customer.name
                )}
              </dd>
              <dt className="text-muted-foreground">Aftale</dt>
              <dd>
                {project.source.quoteId ? (
                  <Link href={`/quotes/${project.source.quoteId}`} className="text-accent hover:underline" data-testid="source-quote">
                    Tilbud {project.source.quoteNumber} (accepteret)
                  </Link>
                ) : project.source.kind === "demo" ? (
                  "Demo (fiktiv)"
                ) : (
                  "Oprettet manuelt"
                )}
              </dd>
              <dt className="text-muted-foreground">Servicebase</dt>
              <dd>{props.serviceBase ? <Link href={`/production/service-factory#${props.serviceBase.key}`} className="text-accent hover:underline">{props.serviceBase.name} v{props.serviceBase.version}</Link> : "Skræddersyet"}</dd>
              <dt className="text-muted-foreground">Start</dt>
              <dd>{formatDate(project.startDate)}</dd>
              <dt className="text-muted-foreground">Levering</dt>
              <dd>{formatDate(project.targetDate)}</dd>
              <dt className="text-muted-foreground">Økonomi</dt>
              <dd>
                {formatKr(project.pricing.implementationPrice)} + {formatKr(project.pricing.monthlyPrice)}/md.
              </dd>
            </dl>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label htmlFor="status">Status</Label>
                <Select id="status" value={project.status} onChange={(e) => patch("status", { status: e.target.value as ProjectStatus })} disabled={busy !== null}>
                  {(Object.keys(PROJECT_STATUS_LABELS) as ProjectStatus[]).map((s) => (
                    <option key={s} value={s}>
                      {PROJECT_STATUS_LABELS[s]}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="prio">Prioritet</Label>
                <Select id="prio" value={project.priority} onChange={(e) => patch("priority", { priority: e.target.value as Priority })} disabled={busy !== null}>
                  {(Object.keys(PRIORITY_LABELS) as Priority[]).map((p) => (
                    <option key={p} value={p}>
                      {PRIORITY_LABELS[p]}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Team (AOS)</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              {project.agents.map((a) => {
                const agent = props.agents.find((x) => x.id === a.agentId);
                return (
                  <li key={a.agentId} className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2">
                      <span className="flex h-6 w-6 items-center justify-center rounded-md text-[11px] font-bold text-white" style={{ background: agent?.color ?? "#64748b" }} aria-hidden>
                        {agent?.name.slice(0, 1)}
                      </span>
                      {agent?.name ?? a.agentId}
                    </span>
                    <span className="text-xs text-muted-foreground">{AGENT_ROLE_LABELS[a.role]}</span>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Interne noter</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Textarea aria-label="Interne noter" rows={4} maxLength={8000} value={notes} onChange={(e) => setNotes(e.target.value)} />
            <Button size="sm" variant="outline" onClick={() => patch("notes", { notes })} disabled={busy !== null || notes === project.notes} data-testid="save-notes">
              {busy === "notes" && <Spinner />} Gem noter
            </Button>
            {error && <Alert variant="error">{error}</Alert>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export function ProjectDetail(props: ProjectDetailProps) {
  const router = useRouter();
  const { project, tasks } = props.bundle;
  const [tab, setTab] = React.useState("overview");
  const [phaseFilter, setPhaseFilter] = React.useState<Phase | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [customer, setCustomer] = React.useState({ approvedBy: "", note: "" });
  const refresh = React.useCallback(() => router.refresh(), [router]);

  const counts = Object.fromEntries(
    PHASES.map((p) => {
      const own = tasks.filter((t) => t.phase === p.key);
      return [p.key, { done: own.filter((t) => t.status === "done").length, total: own.length }];
    }),
  );
  const next = PHASES[phaseIndex(project.phase) + 1];
  const showDemo = project.isDemo && props.mode === "demo" && project.mode === "demo";

  async function advance() {
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/production/projects/${project.id}/phase`, { body: {} });
      refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function approveCustomer(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/production/projects/${project.id}/customer-approval`, { body: customer });
      refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="space-y-4 p-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted-foreground">Aktuel fase:</span>
              <span className="font-semibold" data-testid="current-phase">
                {phaseLabel(project.phase)}
              </span>
              {project.pendingGate && <GateBadge />}
              {props.overdue && <OverdueBadge />}
            </div>
            {project.phase !== "maintenance" && !project.pendingGate && next && (
              <Button onClick={advance} disabled={busy || props.blockers.length > 0} data-testid="advance-phase" title={props.blockers.join(" ")}>
                {busy ? <Spinner /> : <ArrowRight />} Videre til {next.label}
              </Button>
            )}
          </div>
          <PhaseTrack
            project={project}
            selected={phaseFilter}
            taskCounts={counts}
            onSelect={(p) => {
              setPhaseFilter(p === phaseFilter ? null : p);
              setTab("tasks");
            }}
          />
          {props.blockers.length > 0 && !project.pendingGate && project.phase !== "maintenance" && (
            <p className="text-xs text-muted-foreground" data-testid="phase-blockers">
              Før næste fase: {props.blockers.join(" ")}
            </p>
          )}
          {project.pendingGate && !showDemo && props.pendingApproval && (
            <Alert variant="warning" title="Afventer godkendelse i AOS">
              {props.pendingApproval.title}.{" "}
              <Link href="/aos/approvals" className="text-accent hover:underline">
                Gå til godkendelser
              </Link>
            </Alert>
          )}
          {project.phase === "customer_approval" && !project.customerApproval && !showDemo && (
            <form onSubmit={approveCustomer} className="flex flex-col gap-2 rounded-lg border border-border p-3 sm:flex-row sm:items-end" data-testid="customer-approval-form">
              <div className="flex-1 space-y-1">
                <Label htmlFor="approved-by">Godkendt af (hos kunden)</Label>
                <Input id="approved-by" required minLength={2} maxLength={200} value={customer.approvedBy} onChange={(e) => setCustomer({ ...customer, approvedBy: e.target.value })} />
              </div>
              <div className="flex-1 space-y-1">
                <Label htmlFor="approval-note">Note</Label>
                <Input id="approval-note" maxLength={1000} value={customer.note} onChange={(e) => setCustomer({ ...customer, note: e.target.value })} />
              </div>
              <Button type="submit" disabled={busy}>
                <Check /> Registrér kundens godkendelse
              </Button>
            </form>
          )}
          {project.customerApproval && (
            <p className="text-xs text-muted-foreground">
              Kundegodkendt af {project.customerApproval.approvedBy} · {new Date(project.customerApproval.at).toLocaleDateString("da-DK")}
            </p>
          )}
          {error && <Alert variant="error">{error}</Alert>}
        </CardContent>
      </Card>

      {showDemo && <GuidedDemo project={project} pendingApproval={props.pendingApproval} onDone={refresh} />}

      <Tabs
        value={tab}
        onValueChange={setTab}
        items={[
          { value: "overview", label: "Overview" },
          { value: "tasks", label: "Tasks", count: tasks.filter((t) => t.status !== "done").length },
          { value: "agents", label: "Agents", count: project.agents.length },
          { value: "architecture", label: "Architecture" },
          { value: "files", label: "Files & Deliverables", count: props.bundle.files.length },
          { value: "testing", label: "Testing & QA", count: props.bundle.tests.length },
          { value: "activity", label: "Activity" },
          { value: "finance", label: "Finance" },
        ]}
      />
      {tab === "overview" && <OverviewTab props={props} onChange={refresh} />}
      {tab === "tasks" && <TasksTab props={props} phaseFilter={phaseFilter} onPhaseFilter={setPhaseFilter} onChange={refresh} />}
      {tab === "agents" && <AgentsTab props={props} onChange={refresh} />}
      {tab === "architecture" && <ArchitectureTab props={props} onChange={refresh} />}
      {tab === "files" && <FilesTab props={props} onChange={refresh} />}
      {tab === "testing" && <TestingTab props={props} onChange={refresh} />}
      {tab === "activity" && <ActivityTab props={props} />}
      {tab === "finance" && <FinanceTab props={props} onChange={refresh} />}
      {project.isDemo && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <SimulatedBadge label="Demoprojekt" /> Kunde, aftale og resultater er fiktive. Simuleret arbejde vises med mærket "Demo-simulering". <RotateCcw className="h-3 w-3" /> Nulstil fra produktionsoversigten.
        </p>
      )}
    </div>
  );
}
