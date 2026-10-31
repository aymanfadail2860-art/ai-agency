"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { JOB_STATUS_LABELS, POLICY_LABELS, engineLabel, type JobStatus, type PublicAiJob } from "@agency/orchestrator";
import { Alert, apiFetch, Badge, Button, Card, CardContent, CardHeader, CardTitle, Select, Spinner } from "@agency/ui";
import { formatDateTime } from "@agency/shared";
import { Check, ExternalLink, X } from "lucide-react";
import { EVENT_KIND_LABELS, EngineBadge, JobStatusBadge, formatDuration, formatUsd } from "./status";

const MODULE_LABELS: Record<string, string> = { research: "Research", quotes: "Tilbud", production: "Produktion", crm: "CRM", dashboard: "Dashboard", aos: "AOS" };

export function JobTable({ jobs, agentNames, initialStatus = "" }: { jobs: PublicAiJob[]; agentNames: Record<string, string>; initialStatus?: string }) {
  const [status, setStatus] = React.useState(initialStatus);
  const [module, setModule] = React.useState("");
  const visible = jobs.filter((j) => (!status || j.status === status) && (!module || j.module === module));
  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <CardTitle>Opgaver ({visible.length})</CardTitle>
        <div className="flex flex-wrap gap-2">
          <Select aria-label="Filtrér på status" value={status} onChange={(e) => setStatus(e.target.value)} data-testid="job-filter-status">
            <option value="">Alle statusser</option>
            {(Object.keys(JOB_STATUS_LABELS) as JobStatus[]).map((s) => (
              <option key={s} value={s}>
                {JOB_STATUS_LABELS[s]}
              </option>
            ))}
          </Select>
          <Select aria-label="Filtrér på modul" value={module} onChange={(e) => setModule(e.target.value)}>
            <option value="">Alle moduler</option>
            {Object.entries(MODULE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
        </div>
      </CardHeader>
      <CardContent className="overflow-x-auto p-0">
        {visible.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground" data-testid="jobs-empty">
            Ingen opgaver registreret{status || module ? " med dette filter" : " endnu"}. Opgaver oprettes, når du fx starter research.
          </p>
        ) : (
          <table className="w-full text-sm" data-testid="job-table">
            <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr className="border-b border-border">
                <th className="px-4 py-2.5 font-medium">Opgave</th>
                <th className="px-4 py-2.5 font-medium">Modul</th>
                <th className="px-4 py-2.5 font-medium">Agent</th>
                <th className="px-4 py-2.5 font-medium">Motor</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 text-right font-medium">Omkostning</th>
                <th className="px-4 py-2.5 font-medium">Oprettet</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((j) => (
                <tr key={j.id} className="border-b border-border/60 last:border-0 hover:bg-muted/40" data-testid="job-row">
                  <td className="px-4 py-2.5">
                    <Link href={`/aos/jobs/${j.id}`} className="font-medium text-accent hover:underline">
                      {j.title}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">{MODULE_LABELS[j.module]}</td>
                  <td className="px-4 py-2.5">{j.agentId ? (agentNames[j.agentId] ?? j.agentId) : "–"}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{engineLabel(j.engine)}</td>
                  <td className="px-4 py-2.5">
                    <JobStatusBadge status={j.status} overdue={j.overdue} />
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">
                    {j.cost.apiCostUsd > 0 ? formatUsd(j.cost.apiCostUsd) : j.cost.subscriptionRuns > 0 ? "Abonnement" : "–"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-muted-foreground">{formatDateTime(j.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}

const SOURCE_LABEL = { platform: "AI Agency", engine: "Motor", user: "Bruger" } as const;

export function JobDetail({ job: initial, agentName }: { job: PublicAiJob; agentName: string | null }) {
  const router = useRouter();
  const [job, setJob] = React.useState(initial);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [confirmDuplicate, setConfirmDuplicate] = React.useState(false);
  const open = ["queued", "awaiting_approval", "dispatched", "running"].includes(job.status);

  React.useEffect(() => setJob(initial), [initial]);
  React.useEffect(() => {
    if (!open) return;
    const timer = setInterval(async () => {
      try {
        setJob(await apiFetch<PublicAiJob>(`/api/aos/jobs/${job.id}`));
      } catch {
        /* behold seneste visning */
      }
    }, 3000);
    return () => clearInterval(timer);
  }, [open, job.id]);

  async function act(key: string, path: string, body?: unknown) {
    setBusy(key);
    setError(null);
    try {
      setJob(await apiFetch<PublicAiJob>(path, { body: body ?? {} }));
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const ambiguous = job.engine === "claude_code" && job.error && !job.error.retryable;
  const duration = job.startedAt && job.finishedAt ? new Date(job.finishedAt).getTime() - new Date(job.startedAt).getTime() : null;
  const report = job.result?.artifacts.find((a) => a.kind === "report");

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Tidslinje</CardTitle>
            <p className="text-xs text-muted-foreground">Kun registrerede hændelser. Kilde: AI Agency (platformen), Motor (rapporteret af sessionen) eller Bruger. Modellens interne ræsonnement vises ikke.</p>
          </CardHeader>
          <CardContent>
            <ol className="relative space-y-4 border-l border-border pl-5" data-testid="job-timeline">
              {job.timeline.map((e, i) => (
                <li key={i} className="relative">
                  <span className="absolute -left-[25px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-card bg-accent" aria-hidden />
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <time dateTime={e.at}>{new Date(e.at).toLocaleTimeString("da-DK")}</time>
                    <Badge variant={e.source === "engine" ? "info" : "outline"}>{SOURCE_LABEL[e.source]}</Badge>
                    <span>{EVENT_KIND_LABELS[e.kind] ?? e.kind}</span>
                  </div>
                  <p className="mt-0.5 text-sm">{e.message}</p>
                </li>
              ))}
            </ol>
            {job.engine === "claude_code" && open && (
              <p className="mt-4 text-xs text-muted-foreground">
                Claude Code har ingen status-API: platformen viser kun det, sessionen selv melder tilbage. {job.overdue && "Sessionen har ikke svaret inden for tidsgrænsen — åbn den for at se, hvad der skete."}
              </p>
            )}
          </CardContent>
        </Card>

        {job.result && (
          <Card>
            <CardHeader>
              <CardTitle>Resultat</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p data-testid="job-result-summary">{job.result.summary}</p>
              {report?.url && (
                <Link href={report.url} className="inline-block text-accent hover:underline" data-testid="job-report-link">
                  Åbn researchrapporten →
                </Link>
              )}
              {job.result.artifacts
                .filter((a) => a.kind !== "report" && a.url)
                .map((a) => (
                  <a key={a.url} href={a.url!} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-accent hover:underline">
                    {a.label} <ExternalLink className="h-3 w-3" />
                  </a>
                ))}
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
            <div className="flex flex-wrap gap-1.5">
              <JobStatusBadge status={job.status} overdue={job.overdue} />
              <EngineBadge engine={job.engine} />
              {job.mode === "demo" && <Badge variant="demo">Demo</Badge>}
            </div>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
              <dt className="text-muted-foreground">Agent</dt>
              <dd>{agentName ? `${agentName} (v${job.agentVersion})` : "–"}</dd>
              <dt className="text-muted-foreground">Politik</dt>
              <dd>{POLICY_LABELS[job.policy]}</dd>
              <dt className="text-muted-foreground">Forsøg</dt>
              <dd>
                {job.attempt} af {job.maxAttempts}
              </dd>
              <dt className="text-muted-foreground">Varighed</dt>
              <dd>{formatDuration(duration)}</dd>
              <dt className="text-muted-foreground">API-omkostning</dt>
              <dd className="tabular-nums">{formatUsd(job.cost.apiCostUsd)}</dd>
              <dt className="text-muted-foreground">Tokens (ind/ud)</dt>
              <dd className="tabular-nums">
                {job.cost.inputTokens.toLocaleString("da-DK")} / {job.cost.outputTokens.toLocaleString("da-DK")}
              </dd>
              <dt className="text-muted-foreground">Websøgninger</dt>
              <dd className="tabular-nums">{job.cost.searchCalls}</dd>
              <dt className="text-muted-foreground">Claude Code-kørsler</dt>
              <dd className="tabular-nums">{job.cost.subscriptionRuns}</dd>
              {job.subject.customerName && (
                <>
                  <dt className="text-muted-foreground">Kunde/brand</dt>
                  <dd>{job.subject.brandId ? <Link className="text-accent hover:underline" href={`/research/brands/${job.subject.brandId}`}>{job.subject.customerName}</Link> : job.subject.customerName}</dd>
                </>
              )}
            </dl>
            {job.external?.claudeCodeSessionUrl && (
              <a href={job.external.claudeCodeSessionUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-accent hover:underline" data-testid="job-session-link">
                Åbn Claude Code-sessionen <ExternalLink className="h-3 w-3" />
              </a>
            )}
            {job.error && <Alert variant={job.status === "blocked" ? "warning" : "error"} title={job.status === "blocked" ? "Blokeret af routeren" : "Fejl"}>{job.error.message}</Alert>}
            {error && <Alert variant="error" title="Handlingen mislykkedes">{error}</Alert>}
            <div className="flex flex-wrap gap-2">
              {open && (
                <Button variant="outline" size="sm" onClick={() => act("cancel", `/api/aos/jobs/${job.id}/cancel`)} disabled={busy !== null} data-testid="job-cancel">
                  {busy === "cancel" ? <Spinner /> : <X />} Annullér
                </Button>
              )}
              {["failed", "blocked", "cancelled"].includes(job.status) && job.attempt < job.maxAttempts && (
                <>
                  {ambiguous && (
                    <label className="flex items-start gap-2 text-xs">
                      <input type="checkbox" checked={confirmDuplicate} onChange={(e) => setConfirmDuplicate(e.target.checked)} className="mt-0.5" />
                      Jeg har kontrolleret i Claude Code, at det forrige forsøg ikke kører.
                    </label>
                  )}
                  <Button size="sm" onClick={() => act("retry", `/api/aos/jobs/${job.id}/retry`, { confirmPossibleDuplicate: confirmDuplicate })} disabled={busy !== null || (Boolean(ambiguous) && !confirmDuplicate)} data-testid="job-retry">
                    {busy === "retry" ? <Spinner /> : <Check />} Prøv igen
                  </Button>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Routing</CardTitle>
            <p className="text-xs text-muted-foreground">Regelbaseret og forklarlig — ingen AI bruges til at vælge motor.</p>
          </CardHeader>
          <CardContent className="space-y-3 text-sm" data-testid="job-routing">
            <ol className="list-decimal space-y-1 pl-4 text-xs">
              {job.routing.trace.map((t, i) => (
                <li key={i}>{t}</li>
              ))}
            </ol>
            <ul className="space-y-1.5 text-xs">
              {job.routing.candidates.map((c, i) => (
                <li key={i} className="flex gap-2">
                  <span className={c.accepted ? "text-success" : "text-muted-foreground"}>{c.accepted ? "✓" : "✗"}</span>
                  <span>
                    <span className="font-medium">{engineLabel(c.engine)}:</span> {c.reason}
                  </span>
                </li>
              ))}
            </ul>
            {job.routing.approvalReasons.length > 0 && (
              <Alert variant="warning" title="Kræver godkendelse">
                {job.routing.approvalReasons.join(" ")}
              </Alert>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
