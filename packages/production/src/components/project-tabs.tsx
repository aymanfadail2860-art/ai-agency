"use client";
import * as React from "react";
import Link from "next/link";
import { JOB_STATUS_LABELS, engineLabel } from "@agency/orchestrator";
import { Alert, apiFetch, Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Label, Select, Spinner, Textarea } from "@agency/ui";
import { formatDateTime } from "@agency/shared";
import { Bot, Code2, FileText, Link2, Package, Plus, Send, ShieldAlert } from "lucide-react";
import {
  AGENT_ROLE_LABELS,
  COST_CATEGORY_LABELS,
  DELIVERABLE_STATUS_LABELS,
  PHASES,
  PRIORITY_LABELS,
  TASK_STATUS_LABELS,
  TEST_KIND_LABELS,
  phaseLabel,
  type AgentRole,
  type CostEntry,
  type Deliverable,
  type Phase,
  type Priority,
  type ProjectFile,
  type TaskStatus,
  type TestCase,
} from "../contracts";
import type { ProjectDetailProps } from "./project-detail";
import { PriorityBadge, SimulatedBadge, TaskStatusBadge, formatDate, formatKr } from "./shared";

type TabProps = { props: ProjectDetailProps; onChange: () => void };

function useAction(onChange: () => void) {
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const run = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    setError(null);
    try {
      await fn();
      onChange();
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(null);
    }
  };
  return { busy, error, run };
}

// ─── Tasks ──────────────────────────────────────────────────────────────────

export function TasksTab({ props, phaseFilter, onPhaseFilter, onChange }: TabProps & { phaseFilter: Phase | null; onPhaseFilter: (p: Phase | null) => void }) {
  const { project, tasks } = props.bundle;
  const { busy, error, run } = useAction(onChange);
  const [statusFilter, setStatusFilter] = React.useState<"" | "open" | TaskStatus>("");
  const [draft, setDraft] = React.useState({ title: "", phase: project.phase as Phase, assigneeAgentId: "", priority: "normal" as Priority, dueDate: "" });
  const jobs = new Map(props.jobs.map((j) => [j.id, j]));
  const team = project.agents.map((a) => props.agents.find((x) => x.id === a.agentId)).filter(Boolean) as ProjectDetailProps["agents"];
  const visible = tasks.filter((t) => (!phaseFilter || t.phase === phaseFilter) && (!statusFilter || (statusFilter === "open" ? t.status !== "done" : t.status === statusFilter)));
  const base = `/api/production/projects/${project.id}/tasks`;

  return (
    <div className="space-y-4" data-testid="tab-tasks">
      <Card>
        <CardHeader className="gap-3">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <CardTitle>Opgaver ({visible.length})</CardTitle>
            <div className="flex flex-wrap gap-2">
              <Select aria-label="Fase" className="w-48" value={phaseFilter ?? ""} onChange={(e) => onPhaseFilter((e.target.value || null) as Phase | null)} data-testid="task-phase-filter">
                <option value="">Alle faser</option>
                {PHASES.map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.label}
                  </option>
                ))}
              </Select>
              <Select aria-label="Status" className="w-44" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}>
                <option value="">Alle statusser</option>
                <option value="open">Ikke udført</option>
                {(Object.keys(TASK_STATUS_LABELS) as TaskStatus[]).map((s) => (
                  <option key={s} value={s}>
                    {TASK_STATUS_LABELS[s]}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <CardDescription>
            "Send til Job Center" opretter en agentopgave i AOS' fælles Job Center, hvor routeren vælger motor. Agentopgaver i produktion er endnu ikke implementeret, så routeren blokerer dem med en begrundelse — de vises i både Produktion og AOS.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full text-sm" data-testid="task-table">
            <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr className="border-b border-border">
                <th className="px-4 py-2.5 font-medium">Opgave</th>
                <th className="px-3 py-2.5 font-medium">Ansvarlig</th>
                <th className="px-3 py-2.5 font-medium">Prioritet</th>
                <th className="px-3 py-2.5 font-medium">Status</th>
                <th className="px-3 py-2.5 font-medium">Deadline</th>
                <th className="px-3 py-2.5 font-medium">Job Center</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((t) => {
                const job = t.aiJobId ? jobs.get(t.aiJobId) : null;
                const late = t.status !== "done" && t.dueDate && t.dueDate < new Date().toISOString().slice(0, 10);
                return (
                  <tr key={t.id} className="border-b border-border/60 align-top last:border-0" data-testid="task-row" data-task-status={t.status}>
                    <td className="px-4 py-3">
                      <p className="font-medium">{t.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {phaseLabel(t.phase)}
                        {!t.required && " · valgfri"}
                      </p>
                      {t.simulated && <SimulatedBadge />}
                    </td>
                    <td className="px-3 py-3">
                      <Select
                        aria-label={`Ansvarlig for ${t.title}`}
                        className="h-8 w-32 text-xs"
                        value={t.assignee?.id ?? ""}
                        onChange={(e) => run(`a-${t.id}`, () => apiFetch(`${base}/${t.id}`, { method: "PATCH", body: { assigneeAgentId: e.target.value || null } }))}
                        disabled={busy !== null}
                      >
                        <option value="">Ingen</option>
                        {team.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name}
                          </option>
                        ))}
                      </Select>
                    </td>
                    <td className="px-3 py-3">
                      <PriorityBadge priority={t.priority} />
                    </td>
                    <td className="px-3 py-3">
                      <Select
                        aria-label={`Status for ${t.title}`}
                        className="h-8 w-32 text-xs"
                        value={t.status}
                        onChange={(e) => run(`s-${t.id}`, () => apiFetch(`${base}/${t.id}`, { method: "PATCH", body: { status: e.target.value } }))}
                        disabled={busy !== null}
                        data-testid="task-status"
                      >
                        {(Object.keys(TASK_STATUS_LABELS) as TaskStatus[]).map((s) => (
                          <option key={s} value={s}>
                            {TASK_STATUS_LABELS[s]}
                          </option>
                        ))}
                      </Select>
                    </td>
                    <td className={`whitespace-nowrap px-3 py-3 text-xs tabular-nums ${late ? "font-semibold text-destructive" : "text-muted-foreground"}`}>{formatDate(t.dueDate)}</td>
                    <td className="px-3 py-3">
                      {job ? (
                        <Link href={`/aos/jobs/${job.id}`} className="text-xs text-accent hover:underline" data-testid="task-job-link">
                          {JOB_STATUS_LABELS[job.status]} · AOS
                        </Link>
                      ) : t.status !== "done" && t.assignee?.kind === "agent" ? (
                        <Button size="sm" variant="outline" onClick={() => run(`j-${t.id}`, () => apiFetch(`${base}/${t.id}/job`, { body: {} }))} disabled={busy !== null} data-testid="send-to-job-center">
                          {busy === `j-${t.id}` ? <Spinner /> : <Send />} Job Center
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground">–</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>
      {error && <Alert variant="error">{error}</Alert>}
      <Card>
        <CardHeader>
          <CardTitle>Ny opgave</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="grid gap-3 md:grid-cols-[2fr_1fr_1fr_1fr_1fr_auto] md:items-end"
            onSubmit={async (e) => {
              e.preventDefault();
              const ok = await run("new", () => apiFetch(base, { body: { ...draft, assigneeAgentId: draft.assigneeAgentId || null, dueDate: draft.dueDate || null } }));
              if (ok) setDraft({ ...draft, title: "", dueDate: "" });
            }}
            data-testid="new-task-form"
          >
            <div className="space-y-1">
              <Label htmlFor="task-title">Titel</Label>
              <Input id="task-title" required maxLength={200} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="task-phase">Fase</Label>
              <Select id="task-phase" value={draft.phase} onChange={(e) => setDraft({ ...draft, phase: e.target.value as Phase })}>
                {PHASES.map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.short}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="task-agent">Ansvarlig</Label>
              <Select id="task-agent" value={draft.assigneeAgentId} onChange={(e) => setDraft({ ...draft, assigneeAgentId: e.target.value })}>
                <option value="">Ingen</option>
                {team.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="task-prio">Prioritet</Label>
              <Select id="task-prio" value={draft.priority} onChange={(e) => setDraft({ ...draft, priority: e.target.value as Priority })}>
                {(Object.keys(PRIORITY_LABELS) as Priority[]).map((p) => (
                  <option key={p} value={p}>
                    {PRIORITY_LABELS[p]}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="task-due">Deadline</Label>
              <Input id="task-due" type="date" value={draft.dueDate} onChange={(e) => setDraft({ ...draft, dueDate: e.target.value })} />
            </div>
            <Button type="submit" disabled={busy !== null}>
              {busy === "new" ? <Spinner /> : <Plus />} Tilføj
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Agents ─────────────────────────────────────────────────────────────────

export function AgentsTab({ props, onChange }: TabProps) {
  const { project, tasks } = props.bundle;
  const { busy, error, run } = useAction(onChange);
  const [team, setTeam] = React.useState<Record<string, AgentRole | "">>(() => Object.fromEntries(project.agents.map((a) => [a.agentId, a.role])));
  const dirty = JSON.stringify(Object.entries(team).filter(([, r]) => r).sort()) !== JSON.stringify(project.agents.map((a) => [a.agentId, a.role]).sort());

  return (
    <div className="space-y-6" data-testid="tab-agents">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {project.agents.map((a) => {
          const agent = props.agents.find((x) => x.id === a.agentId);
          const own = tasks.filter((t) => t.assignee?.id === a.agentId);
          return (
            <Card key={a.agentId} data-testid="project-agent">
              <CardContent className="space-y-3 p-4">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl font-bold text-white" style={{ background: agent?.color ?? "#64748b" }} aria-hidden>
                    {agent?.name.slice(0, 1)}
                  </span>
                  <div>
                    <p className="font-semibold">{agent?.name ?? a.agentId}</p>
                    <p className="text-xs text-muted-foreground">{AGENT_ROLE_LABELS[a.role]} i projektet</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Badge variant={agent?.status === "working" ? "info" : agent?.status === "disabled" ? "muted" : "outline"}>AOS: {agent?.statusLabel ?? "ukendt"}</Badge>
                  <Badge variant="secondary">
                    {own.filter((t) => t.status === "done").length}/{own.length} opgaver
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">{agent?.role}</p>
                <Link href={`/aos/agents/${a.agentId}`} className="text-xs text-accent hover:underline">
                  Åbn i AOS →
                </Link>
              </CardContent>
            </Card>
          );
        })}
      </div>
      <Alert variant="info" title="Planlagte ressourcer">
        Agenterne kommer fra AOS' Agent Manager. Status ovenfor er agentens reelle status i AOS. Simuleret arbejde i demoen vises ikke som agentaktivitet i AOS — kun opgaver sendt til Job Center gør det.
      </Alert>
      <div className="grid gap-6 lg:grid-cols-2 [&>*]:min-w-0">
        <Card>
          <CardHeader>
            <CardTitle>Tilknyt agenter</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {props.agents.map((a) => (
              <div key={a.id} className="flex items-center gap-3">
                <input type="checkbox" id={`team-${a.key}`} checked={Boolean(team[a.id])} disabled={!a.enabled} onChange={(e) => setTeam({ ...team, [a.id]: e.target.checked ? "developer" : "" })} />
                <label htmlFor={`team-${a.key}`} className="flex-1 text-sm">
                  <span className="font-medium">{a.name}</span> <span className="text-muted-foreground">· {a.role}</span>
                </label>
                {team[a.id] && (
                  <Select aria-label={`Rolle for ${a.name}`} className="h-8 w-36 text-xs" value={team[a.id]} onChange={(e) => setTeam({ ...team, [a.id]: e.target.value as AgentRole })}>
                    {(Object.keys(AGENT_ROLE_LABELS) as AgentRole[]).map((r) => (
                      <option key={r} value={r}>
                        {AGENT_ROLE_LABELS[r]}
                      </option>
                    ))}
                  </Select>
                )}
              </div>
            ))}
            <Button
              size="sm"
              disabled={busy !== null || !dirty}
              onClick={() => run("team", () => apiFetch(`/api/production/projects/${project.id}/agents`, { method: "PUT", body: { agents: Object.entries(team).filter(([, r]) => r).map(([agentId, role]) => ({ agentId, role })) } }))}
              data-testid="save-team"
            >
              {busy === "team" && <Spinner />} Gem team
            </Button>
            {error && <Alert variant="error">{error}</Alert>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Agentjob i Job Center</CardTitle>
            <CardDescription>Samme job vises i AOS → Job Center.</CardDescription>
          </CardHeader>
          <CardContent>
            {props.jobs.length === 0 ? (
              <p className="text-sm text-muted-foreground">Ingen opgaver er sendt til Job Center endnu.</p>
            ) : (
              <ul className="space-y-2 text-sm" data-testid="project-jobs">
                {props.jobs.map((j) => (
                  <li key={j.id} className="flex items-start justify-between gap-2">
                    <Link href={`/aos/jobs/${j.id}`} className="min-w-0 truncate text-accent hover:underline">
                      {j.title}
                    </Link>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {JOB_STATUS_LABELS[j.status]} · {engineLabel(j.engine)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ─── Architecture ───────────────────────────────────────────────────────────

const INTEGRATION_STATUS: Record<string, { label: string; variant: "muted" | "info" | "success" | "demo" }> = {
  planned: { label: "Planlagt", variant: "muted" },
  in_progress: { label: "I gang", variant: "info" },
  connected: { label: "Forbundet", variant: "success" },
  simulated: { label: "Simuleret (demo)", variant: "demo" },
};

export function ArchitectureTab({ props, onChange }: TabProps) {
  const { project } = props.bundle;
  const a = project.architecture;
  const { busy, error, run } = useAction(onChange);
  const [editing, setEditing] = React.useState(false);
  const [summary, setSummary] = React.useState(a.summary);
  const [stack, setStack] = React.useState(a.stack.join(", "));
  const [risks, setRisks] = React.useState(a.risks.join("\n"));

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px] [&>*]:min-w-0" data-testid="tab-architecture">
      <div className="space-y-6">
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-3">
            <div>
              <CardTitle>Teknisk specifikation</CardTitle>
              <CardDescription>Systemdesign ud fra servicebasen {props.serviceBase ? `${props.serviceBase.name} v${props.serviceBase.version}` : ""}.</CardDescription>
            </div>
            {!editing && (
              <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
                Redigér
              </Button>
            )}
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            {editing ? (
              <form
                className="space-y-3"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const ok = await run("arch", () =>
                    apiFetch(`/api/production/projects/${project.id}`, {
                      method: "PATCH",
                      body: { architecture: { ...a, summary, stack: stack.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 30), risks: risks.split("\n").map((s) => s.trim()).filter(Boolean).slice(0, 20) } },
                    }),
                  );
                  if (ok) setEditing(false);
                }}
              >
                <div className="space-y-1">
                  <Label htmlFor="arch-summary">Systemdesign</Label>
                  <Textarea id="arch-summary" rows={5} maxLength={4000} value={summary} onChange={(e) => setSummary(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="arch-stack">Teknologistak (kommasepareret)</Label>
                  <Input id="arch-stack" value={stack} onChange={(e) => setStack(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="arch-risks">Risici (én pr. linje)</Label>
                  <Textarea id="arch-risks" rows={3} value={risks} onChange={(e) => setRisks(e.target.value)} />
                </div>
                <div className="flex gap-2">
                  <Button type="submit" size="sm" disabled={busy !== null}>
                    {busy === "arch" && <Spinner />} Gem specifikation
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => setEditing(false)}>
                    Annullér
                  </Button>
                </div>
              </form>
            ) : (
              <>
                <p className="whitespace-pre-line leading-relaxed">{a.summary}</p>
                <div className="flex flex-wrap gap-1.5">
                  {a.stack.map((s) => (
                    <Badge key={s} variant="secondary">
                      {s}
                    </Badge>
                  ))}
                </div>
              </>
            )}
            {error && <Alert variant="error">{error}</Alert>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Komponenter</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            {a.components.map((c) => (
              <div key={c.name} className="rounded-lg border border-border p-3 text-sm">
                <p className="font-medium">{c.name}</p>
                <p className="text-muted-foreground">{c.description}</p>
              </div>
            ))}
          </CardContent>
        </Card>
        {a.dataFlows.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Dataflows</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="space-y-2 text-sm">
                {a.dataFlows.map((f, i) => (
                  <li key={i} className="rounded-md bg-muted/60 px-3 py-2 font-mono text-xs">
                    {f}
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        )}
      </div>
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Integrationer</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {a.integrations.length === 0 && <p className="text-muted-foreground">Ingen integrationer.</p>}
            {a.integrations.map((i) => (
              <div key={i.name} className="space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{i.name}</span>
                  <Badge variant={INTEGRATION_STATUS[i.status]!.variant}>{INTEGRATION_STATUS[i.status]!.label}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">{i.purpose}</p>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-warning-foreground" /> Risici
            </CardTitle>
          </CardHeader>
          <CardContent>
            {a.risks.length === 0 ? (
              <p className="text-sm text-muted-foreground">Ingen registrerede risici.</p>
            ) : (
              <ul className="ml-4 list-disc space-y-1 text-sm">
                {a.risks.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ─── Files & Deliverables ───────────────────────────────────────────────────

const FILE_ICON: Record<ProjectFile["kind"], React.ComponentType<{ className?: string }>> = { document: FileText, code: Code2, report: FileText, deliverable: Package, link: Link2 };

export function FilesTab({ props, onChange }: TabProps) {
  const { project, files } = props.bundle;
  const { busy, error, run } = useAction(onChange);
  const [draft, setDraft] = React.useState({ kind: "document" as ProjectFile["kind"], title: "", url: "", ref: "", description: "" });

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px] [&>*]:min-w-0" data-testid="tab-files">
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Leverancer</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {project.deliverables.map((d) => (
              <div key={d.id} className="flex flex-col gap-2 rounded-lg border border-border p-3 sm:flex-row sm:items-center sm:justify-between" data-testid="deliverable">
                <div className="min-w-0">
                  <p className="font-medium">{d.name}</p>
                  {d.description && <p className="text-xs text-muted-foreground">{d.description}</p>}
                </div>
                <Select
                  aria-label={`Status for ${d.name}`}
                  className="h-8 w-40 text-xs"
                  value={d.status}
                  disabled={busy !== null}
                  onChange={(e) => run(`d-${d.id}`, () => apiFetch(`/api/production/projects/${project.id}`, { method: "PATCH", body: { deliverables: [{ id: d.id, status: e.target.value }] } }))}
                >
                  {(Object.keys(DELIVERABLE_STATUS_LABELS) as Deliverable["status"][]).map((s) => (
                    <option key={s} value={s}>
                      {DELIVERABLE_STATUS_LABELS[s]}
                    </option>
                  ))}
                </Select>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Dokumenter, kode og rapporter ({files.length})</CardTitle>
            <CardDescription>Referencer til filer og repositories. Platformen har endnu ingen direkte GitHub-adgang; kodereferencer er links/stier.</CardDescription>
          </CardHeader>
          <CardContent>
            {files.length === 0 ? (
              <p className="text-sm text-muted-foreground">Ingen filer endnu.</p>
            ) : (
              <ul className="divide-y divide-border/60" data-testid="file-list">
                {files.map((f) => {
                  const Icon = FILE_ICON[f.kind];
                  return (
                    <li key={f.id} className="flex gap-3 py-3 text-sm">
                      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                      <div className="min-w-0 flex-1 space-y-0.5">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {f.url ? (
                            <a href={f.url} target="_blank" rel="noopener noreferrer" className="font-medium text-accent hover:underline">
                              {f.title}
                            </a>
                          ) : (
                            <span className="font-medium">{f.title}</span>
                          )}
                          {f.simulated && <SimulatedBadge />}
                        </div>
                        {f.description && <p className="text-muted-foreground">{f.description}</p>}
                        {f.ref && <p className="break-all font-mono text-xs text-muted-foreground">{f.ref}</p>}
                        <p className="text-xs text-muted-foreground">
                          {phaseLabel(f.phase)} · {f.createdBy} · {formatDateTime(f.createdAt)}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
      <Card className="h-fit">
        <CardHeader>
          <CardTitle>Tilføj fil eller reference</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-3"
            onSubmit={async (e) => {
              e.preventDefault();
              const ok = await run("file", () => apiFetch(`/api/production/projects/${project.id}/files`, { body: { ...draft, url: draft.url || null, ref: draft.ref || null, phase: project.phase } }));
              if (ok) setDraft({ ...draft, title: "", url: "", ref: "", description: "" });
            }}
            data-testid="add-file-form"
          >
            <div className="space-y-1">
              <Label htmlFor="file-kind">Type</Label>
              <Select id="file-kind" value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value as ProjectFile["kind"] })}>
                <option value="document">Dokument</option>
                <option value="code">Kodereference</option>
                <option value="report">Rapport</option>
                <option value="deliverable">Leverance</option>
                <option value="link">Link</option>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="file-title">Titel</Label>
              <Input id="file-title" required maxLength={200} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="file-url">URL (valgfri)</Label>
              <Input id="file-url" type="url" placeholder="https://…" value={draft.url} onChange={(e) => setDraft({ ...draft, url: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="file-ref">Reference (fx repository/sti)</Label>
              <Input id="file-ref" maxLength={300} value={draft.ref} onChange={(e) => setDraft({ ...draft, ref: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="file-desc">Beskrivelse</Label>
              <Textarea id="file-desc" rows={2} maxLength={1000} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
            </div>
            <Button type="submit" size="sm" disabled={busy !== null}>
              {busy === "file" ? <Spinner /> : <Plus />} Tilføj
            </Button>
            {error && <Alert variant="error">{error}</Alert>}
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Testing & QA ───────────────────────────────────────────────────────────

const TEST_STATUS: Record<TestCase["status"], { label: string; variant: "muted" | "success" | "destructive" | "warning" }> = {
  not_run: { label: "Ikke kørt", variant: "muted" },
  passed: { label: "Bestået", variant: "success" },
  failed: { label: "Fejlet", variant: "destructive" },
  blocked: { label: "Blokeret", variant: "warning" },
};

function RecordTestRow({ test, projectId, run, busy }: { test: TestCase; projectId: string; run: ReturnType<typeof useAction>["run"]; busy: string | null }) {
  const [open, setOpen] = React.useState(false);
  const [status, setStatus] = React.useState<TestCase["status"]>(test.status === "not_run" ? "passed" : test.status);
  const [note, setNote] = React.useState("");
  const [defect, setDefect] = React.useState("");
  if (!open) {
    return (
      <Button size="sm" variant="outline" onClick={() => setOpen(true)} data-testid="record-test">
        Registrér
      </Button>
    );
  }
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        const ok = await run(`t-${test.id}`, () =>
          apiFetch(`/api/production/projects/${projectId}/tests/${test.id}`, {
            method: "PATCH",
            body: { status, resultNote: note, defect: status === "failed" && defect ? { title: defect, severity: "medium", resolved: false } : status === "passed" && test.defect ? { ...test.defect, resolved: true } : test.defect },
          }),
        );
        if (ok) setOpen(false);
      }}
    >
      <Select aria-label="Resultat" className="h-8 text-xs" value={status} onChange={(e) => setStatus(e.target.value as TestCase["status"])} data-testid="test-result">
        <option value="passed">Bestået</option>
        <option value="failed">Fejlet</option>
        <option value="blocked">Blokeret</option>
      </Select>
      <Input aria-label="Note" className="h-8 text-xs" placeholder="Note" maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />
      {status === "failed" && <Input aria-label="Fejlbeskrivelse" className="h-8 text-xs" placeholder="Fejlbeskrivelse" maxLength={200} value={defect} onChange={(e) => setDefect(e.target.value)} />}
      <Button type="submit" size="sm" disabled={busy !== null} data-testid="save-test">
        Gem
      </Button>
    </form>
  );
}

export function TestingTab({ props, onChange }: TabProps) {
  const { project, tests } = props.bundle;
  const { busy, error, run } = useAction(onChange);
  const [draft, setDraft] = React.useState({ title: "", area: "", kind: "functional" as TestCase["kind"], expected: "" });
  const count = (s: TestCase["status"]) => tests.filter((t) => t.status === s).length;
  const openDefects = tests.filter((t) => t.defect && !t.defect.resolved).length;

  return (
    <div className="space-y-6" data-testid="tab-testing">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {[
          ["Testcases", tests.length],
          ["Bestået", count("passed")],
          ["Fejlet", count("failed")],
          ["Ikke kørt", count("not_run")],
          ["Åbne fejl", openDefects],
        ].map(([label, value]) => (
          <Card key={label as string}>
            <CardContent className="p-4">
              <p className="text-xs uppercase tracking-[0.1em] text-muted-foreground">{label}</p>
              <p className="text-xl font-semibold tabular-nums">{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Testplan</CardTitle>
          <CardDescription>Resultater registreres af QA (i Live Mode senere også af Vega via Job Center). Godkendelser af leverancen sker via faseportene i AOS.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full text-sm" data-testid="test-table">
            <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr className="border-b border-border">
                <th className="px-4 py-2.5 font-medium">Testcase</th>
                <th className="px-3 py-2.5 font-medium">Type</th>
                <th className="px-3 py-2.5 font-medium">Resultat</th>
                <th className="px-3 py-2.5 font-medium">Fejl</th>
                <th className="px-3 py-2.5 font-medium" />
              </tr>
            </thead>
            <tbody>
              {tests.map((t) => (
                <tr key={t.id} className="border-b border-border/60 align-top last:border-0" data-testid="test-row" data-test-status={t.status}>
                  <td className="px-4 py-3">
                    <p className="font-medium">{t.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {t.area} · forventet: {t.expected}
                    </p>
                    {t.resultNote && <p className="text-xs">{t.resultNote}</p>}
                    {t.simulated && <SimulatedBadge />}
                  </td>
                  <td className="px-3 py-3 text-xs text-muted-foreground">{TEST_KIND_LABELS[t.kind]}</td>
                  <td className="px-3 py-3">
                    <Badge variant={TEST_STATUS[t.status].variant}>{TEST_STATUS[t.status].label}</Badge>
                    {t.lastRunAt && <p className="mt-1 text-[11px] text-muted-foreground">{formatDateTime(t.lastRunAt)}</p>}
                  </td>
                  <td className="px-3 py-3 text-xs">{t.defect ? <span className={t.defect.resolved ? "text-muted-foreground line-through" : "text-destructive"}>{t.defect.title}</span> : "–"}</td>
                  <td className="px-3 py-3">
                    <RecordTestRow test={t} projectId={project.id} run={run} busy={busy} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
      {error && <Alert variant="error">{error}</Alert>}
      <Card>
        <CardHeader>
          <CardTitle>Ny testcase</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="grid gap-3 md:grid-cols-[2fr_1fr_1fr_2fr_auto] md:items-end"
            onSubmit={async (e) => {
              e.preventDefault();
              const ok = await run("test", () => apiFetch(`/api/production/projects/${project.id}/tests`, { body: { ...draft, area: draft.area || "Generelt" } }));
              if (ok) setDraft({ title: "", area: "", kind: "functional", expected: "" });
            }}
          >
            <div className="space-y-1">
              <Label htmlFor="test-title">Titel</Label>
              <Input id="test-title" required maxLength={200} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="test-area">Område</Label>
              <Input id="test-area" maxLength={80} value={draft.area} onChange={(e) => setDraft({ ...draft, area: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="test-kind">Type</Label>
              <Select id="test-kind" value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value as TestCase["kind"] })}>
                {(Object.keys(TEST_KIND_LABELS) as TestCase["kind"][]).map((k) => (
                  <option key={k} value={k}>
                    {TEST_KIND_LABELS[k]}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="test-expected">Forventet resultat</Label>
              <Input id="test-expected" maxLength={1000} value={draft.expected} onChange={(e) => setDraft({ ...draft, expected: e.target.value })} />
            </div>
            <Button type="submit" disabled={busy !== null}>
              {busy === "test" ? <Spinner /> : <Plus />} Tilføj
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Activity ───────────────────────────────────────────────────────────────

export function ActivityTab({ props }: { props: ProjectDetailProps }) {
  const { events } = props.bundle;
  return (
    <Card data-testid="tab-activity">
      <CardHeader>
        <CardTitle>Projektets tidslinje</CardTitle>
        <CardDescription>Registrerede hændelser. Demo-simuleringer er markeret og er ikke udført af AI-agenter.</CardDescription>
      </CardHeader>
      <CardContent>
        <ol className="relative space-y-4 border-l border-border pl-5" data-testid="project-events">
          {events.map((e) => (
            <li key={e.id} className="relative">
              <span className={`absolute -left-[25px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-card ${e.simulated ? "bg-warning" : e.actor.kind === "user" ? "bg-accent" : "bg-muted-foreground"}`} aria-hidden />
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <time dateTime={e.at}>{formatDateTime(e.at)}</time>
                <span className="inline-flex items-center gap-1">
                  {e.actor.kind === "agent" && <Bot className="h-3 w-3" />} {e.actor.name}
                </span>
                {e.simulated && <SimulatedBadge />}
              </div>
              <p className="mt-0.5 text-sm">{e.message}</p>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}

// ─── Finance ────────────────────────────────────────────────────────────────

export function FinanceTab({ props, onChange }: TabProps) {
  const { project, costs } = props.bundle;
  const f = props.finance;
  const { busy, error, run } = useAction(onChange);
  const [draft, setDraft] = React.useState({ category: "hours" as CostEntry["category"], description: "", amount: "" });

  return (
    <div className="space-y-6" data-testid="tab-finance">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          ["Implementering", formatKr(f.implementationPrice), "ekskl. moms"],
          ["Månedlig service", formatKr(f.monthlyPrice), "ekskl. moms"],
          ["Første år", formatKr(f.firstYearRevenue), "implementering + 12 × måned"],
          ["Dækningsbidrag år 1", formatKr(f.marginFirstYear), "efter registrerede omkostninger"],
        ].map(([label, value, sub]) => (
          <Card key={label}>
            <CardContent className="space-y-1 p-4">
              <p className="text-xs uppercase tracking-[0.1em] text-muted-foreground">{label}</p>
              <p className="text-lg font-semibold tabular-nums" data-testid={`finance-${label}`}>
                {value}
              </p>
              <p className="text-xs text-muted-foreground">{sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-2 [&>*]:min-w-0">
        <Card>
          <CardHeader>
            <CardTitle>Registrerede omkostninger ({formatKr(f.registeredCosts)})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {costs.length === 0 ? (
              <p className="text-sm text-muted-foreground">Ingen omkostninger registreret.</p>
            ) : (
              <ul className="divide-y divide-border/60 text-sm">
                {costs.map((c) => (
                  <li key={c.id} className="flex justify-between gap-3 py-2">
                    <span>
                      {c.description} <span className="text-xs text-muted-foreground">· {COST_CATEGORY_LABELS[c.category]}</span>
                    </span>
                    <span className="tabular-nums">{formatKr(c.amount)}</span>
                  </li>
                ))}
              </ul>
            )}
            <form
              className="grid gap-2 sm:grid-cols-[1fr_2fr_1fr_auto] sm:items-end"
              onSubmit={async (e) => {
                e.preventDefault();
                const ok = await run("cost", () => apiFetch(`/api/production/projects/${project.id}/costs`, { body: { ...draft, amount: Number(draft.amount) } }));
                if (ok) setDraft({ ...draft, description: "", amount: "" });
              }}
              data-testid="add-cost-form"
            >
              <div className="space-y-1">
                <Label htmlFor="cost-cat">Kategori</Label>
                <Select id="cost-cat" value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value as CostEntry["category"] })}>
                  {(Object.keys(COST_CATEGORY_LABELS) as CostEntry["category"][]).map((k) => (
                    <option key={k} value={k}>
                      {COST_CATEGORY_LABELS[k]}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="cost-desc">Beskrivelse</Label>
                <Input id="cost-desc" required maxLength={300} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="cost-amount">Beløb (kr.)</Label>
                <Input id="cost-amount" required type="number" min={0} step={1} value={draft.amount} onChange={(e) => setDraft({ ...draft, amount: e.target.value })} />
              </div>
              <Button type="submit" disabled={busy !== null}>
                {busy === "cost" ? <Spinner /> : <Plus />} Tilføj
              </Button>
            </form>
            {error && <Alert variant="error">{error}</Alert>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>AI-omkostninger fra Job Center</CardTitle>
            <CardDescription>Registreret pr. job i AOS' Cost Manager. API-forbrug i USD; Claude Code som antal kørsler på abonnement.</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-y-2 text-sm">
              <dt className="text-muted-foreground">Agentjob</dt>
              <dd className="tabular-nums">{f.aiJobs.count}</dd>
              <dt className="text-muted-foreground">Claude API</dt>
              <dd className="tabular-nums">{f.aiJobs.apiCostUsd.toLocaleString("da-DK", { minimumFractionDigits: 2 })} USD</dd>
              <dt className="text-muted-foreground">Tokens (ind/ud)</dt>
              <dd className="tabular-nums">
                {f.aiJobs.inputTokens.toLocaleString("da-DK")} / {f.aiJobs.outputTokens.toLocaleString("da-DK")}
              </dd>
              <dt className="text-muted-foreground">Claude Code-kørsler</dt>
              <dd className="tabular-nums">{f.aiJobs.subscriptionRuns}</dd>
            </dl>
            {project.source.quoteId && (
              <p className="mt-4 text-sm">
                Priserne stammer fra{" "}
                <Link href={`/quotes/${project.source.quoteId}`} className="text-accent hover:underline">
                  tilbud {project.source.quoteNumber}
                </Link>
                .
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
