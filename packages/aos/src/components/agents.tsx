"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { TASK_TYPES, TOOL_CATALOG, engineLabel, type AgentVersion, type EngineKind } from "@agency/orchestrator";
import type { AgentState } from "@agency/orchestrator/server";
import { Alert, apiFetch, Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Label, Spinner, Textarea } from "@agency/ui";
import { formatDateTime } from "@agency/shared";
import { AgentStatusBadge } from "./status";

export function AgentLibrary({ agents }: { agents: AgentState[] }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4" data-testid="agent-library">
      {agents.map(({ agent, status, openJobs }) => (
        <Link key={agent.id} href={`/aos/agents/${agent.id}`} className="group block rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-ring" data-testid={`agent-card-${agent.key}`}>
          <Card className="h-full transition-colors group-hover:border-accent/50">
            <CardHeader className="space-y-2">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl text-sm font-bold text-white" style={{ background: agent.color }} aria-hidden>
                  {agent.name.slice(0, 1)}
                </span>
                <div>
                  <CardTitle className="text-base">{agent.name}</CardTitle>
                  <p className="text-xs text-muted-foreground">{agent.role}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <AgentStatusBadge status={status} />
                <Badge variant="outline">v{agent.version.version}</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p className="text-muted-foreground">{agent.version.description}</p>
              <p className="text-xs text-muted-foreground">
                {agent.version.allowedTools.length} værktøjer · {agent.version.engines.map((e) => engineLabel(e)).join(", ")}
                {openJobs > 0 && ` · ${openJobs} åbne opgaver`}
              </p>
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}

const VERSION_STATUS: Record<AgentVersion["status"], { label: string; variant: "success" | "warning" | "muted" | "destructive" }> = {
  active: { label: "Aktiv", variant: "success" },
  pending_approval: { label: "Afventer godkendelse", variant: "warning" },
  superseded: { label: "Erstattet", variant: "muted" },
  rejected: { label: "Afvist", variant: "destructive" },
};

export interface AgentAssignment {
  projectId: string;
  name: string;
  customer: string;
  roleLabel: string;
  phaseLabel: string;
  isDemo: boolean;
  openTasks: number;
}

export function AgentDetail({ state, versions, assignments = [] }: { state: AgentState; versions: AgentVersion[]; assignments?: AgentAssignment[] }) {
  const router = useRouter();
  const { agent } = state;
  const v = agent.version;
  const [editing, setEditing] = React.useState(false);
  const [form, setForm] = React.useState({
    description: v.description,
    specialty: v.specialty,
    instructions: v.instructions,
    allowedTools: v.allowedTools,
    engines: v.engines as EngineKind[],
    taskTypes: v.taskTypes,
    changeNote: "",
  });
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const pending = versions.find((x) => x.status === "pending_approval");

  async function run(key: string, fn: () => Promise<void>) {
    setBusy(key);
    setError(null);
    setNotice(null);
    try {
      await fn();
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const toggle = <T extends string>(list: T[], value: T) => (list.includes(value) ? list.filter((x) => x !== value) : [...list, value]);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Aktiv version (v{v.version})</CardTitle>
            <CardDescription>
              Kilde: {v.source === "repository" ? "repositoriet (GitHub)" : "platformen"} · {formatDateTime(v.createdAt)}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Speciale</p>
              <p>{v.specialty}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Instruktioner</p>
              <p className="whitespace-pre-wrap rounded-lg border border-border bg-muted/40 p-3 font-mono text-xs leading-relaxed" data-testid="agent-instructions">
                {v.instructions}
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tilladte værktøjer</p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {v.allowedTools.length === 0 && <span className="text-muted-foreground">Ingen</span>}
                {v.allowedTools.map((t) => {
                  const tool = TOOL_CATALOG.find((x) => x.key === t);
                  return (
                    <Badge key={t} variant={tool?.risk === "high" ? "warning" : "secondary"} title={tool?.label}>
                      {tool?.label ?? t}
                    </Badge>
                  );
                })}
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Motorer og opgavetyper</p>
              <p>
                {v.engines.map((e) => engineLabel(e)).join(", ")}
                {v.taskTypes.length > 0 && ` · ${v.taskTypes.map((t) => TASK_TYPES.find((d) => d.key === t)?.label ?? t).join(", ")}`}
              </p>
            </div>
          </CardContent>
        </Card>

        {editing && (
          <Card data-testid="agent-version-form">
            <CardHeader>
              <CardTitle>Ny version</CardTitle>
              <CardDescription>Ændringer gemmes som en ny, uforanderlig version. Den aktiveres først, når den er godkendt under Godkendelser.</CardDescription>
            </CardHeader>
            <CardContent>
              <form
                className="space-y-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  run("propose", async () => {
                    const res = await apiFetch<{ version: AgentVersion }>(`/api/aos/agents/${agent.id}/versions`, { body: form });
                    setEditing(false);
                    setNotice(`Version ${res.version.version} er oprettet og afventer godkendelse.`);
                  });
                }}
              >
                <div className="space-y-1.5">
                  <Label htmlFor="desc">Beskrivelse</Label>
                  <Input id="desc" value={form.description} maxLength={600} onChange={(e) => setForm({ ...form, description: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="spec">Speciale</Label>
                  <Input id="spec" value={form.specialty} maxLength={300} onChange={(e) => setForm({ ...form, specialty: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="instr">Instruktioner</Label>
                  <Textarea id="instr" rows={7} value={form.instructions} maxLength={8000} onChange={(e) => setForm({ ...form, instructions: e.target.value })} />
                </div>
                <fieldset className="space-y-1.5">
                  <legend className="text-sm font-medium">Værktøjer</legend>
                  <div className="grid gap-1.5 sm:grid-cols-2">
                    {TOOL_CATALOG.map((t) => (
                      <label key={t.key} className="flex items-start gap-2 text-xs">
                        <input type="checkbox" className="mt-0.5" checked={form.allowedTools.includes(t.key)} onChange={() => setForm({ ...form, allowedTools: toggle(form.allowedTools, t.key) })} />
                        <span>
                          {t.label}
                          {t.risk === "high" && <span className="text-warning-foreground"> · høj risiko</span>}
                        </span>
                      </label>
                    ))}
                  </div>
                </fieldset>
                <fieldset className="space-y-1.5">
                  <legend className="text-sm font-medium">Motorer</legend>
                  <div className="flex flex-wrap gap-3">
                    {(["internal", "claude_api", "claude_code"] as EngineKind[]).map((e) => (
                      <label key={e} className="flex items-center gap-2 text-xs">
                        <input type="checkbox" checked={form.engines.includes(e)} onChange={() => setForm({ ...form, engines: toggle(form.engines, e) })} /> {engineLabel(e)}
                      </label>
                    ))}
                  </div>
                </fieldset>
                <div className="space-y-1.5">
                  <Label htmlFor="note">Hvad ændres og hvorfor?</Label>
                  <Input id="note" value={form.changeNote} maxLength={500} onChange={(e) => setForm({ ...form, changeNote: e.target.value })} placeholder="Fx: Skarpere fokus på kundeservice" required />
                </div>
                <div className="flex gap-2">
                  <Button type="submit" disabled={busy !== null} data-testid="agent-version-submit">
                    {busy === "propose" && <Spinner />} Opret version til godkendelse
                  </Button>
                  <Button type="button" variant="outline" onClick={() => setEditing(false)}>
                    Annullér
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <AgentStatusBadge status={state.status} />
            {state.currentJob && (
              <p>
                Arbejder på{" "}
                <Link className="text-accent hover:underline" href={`/aos/jobs/${state.currentJob.id}`}>
                  {state.currentJob.title}
                </Link>
              </p>
            )}
            {notice && <Alert variant="success">{notice}</Alert>}
            {error && <Alert variant="error" title="Handlingen mislykkedes">{error}</Alert>}
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={busy !== null}
                data-testid="agent-toggle"
                onClick={() => run("toggle", async () => void (await apiFetch(`/api/aos/agents/${agent.id}`, { method: "PATCH", body: { enabled: !agent.enabled } })))}
              >
                {busy === "toggle" && <Spinner />} {agent.enabled ? "Deaktivér agent" : "Aktivér agent"}
              </Button>
              {!editing && (
                <Button size="sm" disabled={Boolean(pending)} onClick={() => setEditing(true)} data-testid="agent-edit">
                  Ny version
                </Button>
              )}
            </div>
            {pending && (
              <p className="text-xs text-muted-foreground">
                Version {pending.version} afventer godkendelse.{" "}
                <Link href="/aos/approvals" className="text-accent hover:underline">
                  Gå til godkendelser
                </Link>
              </p>
            )}
          </CardContent>
        </Card>
        <Card data-testid="agent-assignments">
          <CardHeader>
            <CardTitle>Produktionsprojekter</CardTitle>
          </CardHeader>
          <CardContent>
            {assignments.length === 0 ? (
              <p className="text-sm text-muted-foreground">Ikke tilknyttet nogen projekter.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {assignments.map((a) => (
                  <li key={a.projectId} className="space-y-0.5">
                    <Link href={`/production/projects/${a.projectId}`} className="font-medium text-accent hover:underline">
                      {a.name}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {a.customer} · {a.roleLabel} · {a.phaseLabel} · {a.openTasks} åbne opgaver{a.isDemo ? " · demo" : ""}
                    </p>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-xs text-muted-foreground">Tilknytning er en planlagt ressource. Agentens status ovenfor bygger kun på job i Job Center.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Versionshistorik</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="space-y-3 text-sm" data-testid="agent-versions">
              {versions.map((x) => (
                <li key={x.id} className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">v{x.version}</span>
                    <Badge variant={VERSION_STATUS[x.status].variant}>{VERSION_STATUS[x.status].label}</Badge>
                    <span className="text-xs text-muted-foreground">{x.source === "repository" ? "GitHub" : "Platform"}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {x.changeNote} · {formatDateTime(x.createdAt)}
                  </p>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
