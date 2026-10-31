"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Brand, BrandLegalEntityRelation, Company, Establishment, ResearchJob, ResearchStep, Website } from "@agency/core";
import { Alert, apiFetch, Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Label, Select, Spinner } from "@agency/ui";
import { formatDateTime } from "@agency/shared";
import { Building2, CheckCircle2, Circle, CircleSlash, FileSearch, Globe, Loader2, MapPin, ShieldCheck, ShieldQuestion, ShieldX, Sparkles, XCircle } from "lucide-react";

export interface BrandResearchProps {
  brand: Brand;
  websites: Website[];
  relations: Array<{ relation: BrandLegalEntityRelation; legalEntity: Company | null; establishments: Establishment[] }>;
  latestJob: ResearchJob | null;
  reports: Array<{ id: string; createdAt: string; status: string; analysisEngine: string }>;
  /** Motorpolitikker fra den fælles AI-infrastruktur (vises kun i Live Mode). */
  policyOptions?: Array<{ value: string; label: string }>;
  /** Ekstra paneler (fx dyb research) fra kompositionslaget. */
  aside?: React.ReactNode;
}

interface AiJobInfo {
  id: string;
  status: string;
  engine: "internal" | "claude_api" | "claude_code" | null;
  fallback: boolean;
  explanation: string | null;
}

const ENGINE_NAMES: Record<string, string> = { internal: "Intern software (regelbaseret)", claude_api: "Claude API", claude_code: "Claude Code-rutine" };

function StepIcon({ status }: { status: ResearchStep["status"] }) {
  if (status === "done") return <CheckCircle2 className="h-4 w-4 text-success" />;
  if (status === "running") return <Loader2 className="h-4 w-4 animate-spin text-accent" />;
  if (status === "failed") return <XCircle className="h-4 w-4 text-destructive" />;
  if (status === "skipped") return <CircleSlash className="h-4 w-4 text-muted-foreground" />;
  return <Circle className="h-4 w-4 text-muted-foreground/50" />;
}

export function JobProgress({ job }: { job: ResearchJob }) {
  return (
    <ol className="space-y-2.5" data-testid="research-progress">
      {job.steps.map((step) => (
        <li key={step.key} className="flex items-start gap-3 text-sm">
          <StepIcon status={step.status} />
          <div className="min-w-0">
            <p className={step.status === "pending" ? "text-muted-foreground" : "text-foreground"}>{step.label}</p>
            {step.detail && <p className="truncate text-xs text-muted-foreground">{step.detail}</p>}
          </div>
        </li>
      ))}
    </ol>
  );
}

const STATUS_BADGE = {
  confirmed: (
    <Badge variant="success">
      <ShieldCheck /> Bekræftet
    </Badge>
  ),
  suggested: (
    <Badge variant="warning">
      <ShieldQuestion /> Foreslået — ikke bekræftet
    </Badge>
  ),
  rejected: (
    <Badge variant="muted">
      <ShieldX /> Afvist
    </Badge>
  ),
};

export function BrandResearch({ brand, websites, relations, latestJob, reports, policyOptions, aside }: BrandResearchProps) {
  const router = useRouter();
  const [job, setJob] = React.useState<ResearchJob | null>(latestJob && (latestJob.status === "running" || latestJob.status === "queued") ? latestJob : null);
  const [aiJob, setAiJob] = React.useState<AiJobInfo | null>(null);
  const [policy, setPolicy] = React.useState("AUTO");
  const [website, setWebsite] = React.useState("");
  const [cvr, setCvr] = React.useState("");
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!job || job.status === "completed" || job.status === "failed") return;
    const timer = setInterval(async () => {
      try {
        const next = await apiFetch<ResearchJob>(`/api/research/jobs/${job.id}`);
        setJob(next);
        if (next.status === "completed" && next.reportId) {
          clearInterval(timer);
          router.push(`/research/reports/${next.reportId}`);
        }
        if (next.status === "failed") clearInterval(timer);
      } catch (e) {
        setError((e as Error).message);
        clearInterval(timer);
      }
    }, 900);
    return () => clearInterval(timer);
  }, [job, router]);

  async function act(key: string, fn: () => Promise<unknown>, refresh = true) {
    setBusy(key);
    setError(null);
    try {
      await fn();
      if (refresh) router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const start = () =>
    act(
      "start",
      async () => {
        const res = await apiFetch<(ResearchJob & { aiJob?: AiJobInfo }) | { id: null; status: string; aiJob: AiJobInfo }>("/api/research/jobs", {
          body: { brandId: brand.id, websiteUrl: website.trim() || null, ...(brand.mode === "live" ? { policy } : {}) },
        });
        setAiJob(res.aiJob ?? null);
        if (res.id) setJob(res as ResearchJob);
      },
      false,
    );

  const running = job && (job.status === "queued" || job.status === "running");
  const visibleRelations = relations.filter((r) => r.legalEntity);
  const confirmedCount = visibleRelations.filter((r) => r.relation.status === "confirmed").length;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_400px]">
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Brand</CardTitle>
            <CardDescription>Brandet er analyseobjektet. Juridiske enheder er en berigelse og kræver ikke CVR.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="text-lg font-semibold">{brand.name}</p>
            {websites.length === 0 ? (
              <p className="text-muted-foreground">Ingen hjemmeside kendt. Angiv den til højre for en fuld analyse.</p>
            ) : (
              <ul className="space-y-1">
                {websites.map((w) => (
                  <li key={w.id} className="flex items-center gap-2">
                    <Globe className="h-4 w-4 text-accent" />
                    {brand.mode === "demo" ? <span>{w.url} (fiktiv)</span> : <a className="text-accent hover:underline" href={w.url} target="_blank" rel="noopener noreferrer">{w.url}</a>}
                    {w.isPrimary && <Badge variant="outline">Primær</Badge>}
                  </li>
                ))}
              </ul>
            )}
            <p className="text-xs text-muted-foreground">Intern identifikator: {brand.id}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Juridiske enheder</CardTitle>
            <CardDescription>Kun bekræftede relationer bruges som fakta i analysen og på tilbuddet. Systemet vælger aldrig automatisk.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {visibleRelations.length === 0 && <p className="text-sm text-muted-foreground">Ingen juridisk enhed er knyttet til brandet. Researchen kan gennemføres uden.</p>}
            {visibleRelations.length > 1 && confirmedCount === 0 && (
              <Alert variant="warning" title="Flere mulige juridiske enheder">
                Bekræft den enhed, der driver brandet, og afvis de øvrige. Indtil da bruges ingen registerdata.
              </Alert>
            )}
            {visibleRelations.map(({ relation, legalEntity, establishments }) => (
              <div key={relation.id} className="rounded-lg border border-border p-4 text-sm" data-testid="relation" data-status={relation.status} data-cvr={relation.cvr}>
                <div className="flex flex-wrap items-center gap-2">
                  <Building2 className="h-4 w-4 text-accent" />
                  <span className="font-medium">{legalEntity!.name}</span>
                  <span className="tabular-nums text-muted-foreground">CVR {relation.cvr}{brand.mode === "demo" ? " (fiktivt)" : ""}</span>
                  {STATUS_BADGE[relation.status]}
                </div>
                <p className="mt-1 text-muted-foreground">
                  {legalEntity!.industry?.text ?? "Branche ukendt"}
                  {legalEntity!.address?.city ? ` · ${legalEntity!.address.city}` : ""}
                  {legalEntity!.adProtected ? " · Reklamebeskyttet" : ""}
                </p>
                <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                  {relation.evidence.map((e, i) => (
                    <li key={i}>
                      Kilde: {e.description}
                      {e.url && brand.mode === "live" && (
                        <>
                          {" "}
                          <a className="text-accent hover:underline" href={e.url} target="_blank" rel="noopener noreferrer">
                            (link)
                          </a>
                        </>
                      )}
                    </li>
                  ))}
                </ul>
                {relation.status === "confirmed" && establishments.length > 0 && (
                  <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                    {establishments.map((e) => (
                      <li key={e.id} className="flex items-center gap-1.5">
                        <MapPin className="h-3 w-3" /> {e.name} · {e.address?.city} · P-nr. {e.pNumber}
                      </li>
                    ))}
                  </ul>
                )}
                <div className="mt-3 flex gap-2">
                  {relation.status !== "confirmed" && (
                    <Button size="sm" variant="outline" disabled={busy !== null} data-testid={`confirm-${relation.cvr}`} onClick={() => act(relation.id, () => apiFetch(`/api/research/brands/${brand.id}/relations/${relation.id}`, { method: "PATCH", body: { decision: "confirmed" } }))}>
                      {busy === relation.id ? <Spinner /> : <ShieldCheck />} Bekræft
                    </Button>
                  )}
                  {relation.status !== "rejected" && (
                    <Button size="sm" variant="ghost" disabled={busy !== null} data-testid={`reject-${relation.cvr}`} onClick={() => act(relation.id, () => apiFetch(`/api/research/brands/${brand.id}/relations/${relation.id}`, { method: "PATCH", body: { decision: "rejected" } }))}>
                      <ShieldX /> Afvis
                    </Button>
                  )}
                </div>
              </div>
            ))}
            <form
              className="flex flex-col gap-2 sm:flex-row sm:items-end"
              onSubmit={(e) => {
                e.preventDefault();
                if (cvr.trim()) act("propose", async () => { await apiFetch(`/api/research/brands/${brand.id}/relations`, { body: { cvr: cvr.trim() } }); setCvr(""); });
              }}
            >
              <div className="flex-1 space-y-1.5">
                <Label htmlFor="propose-cvr">Foreslå juridisk enhed (CVR)</Label>
                <Input id="propose-cvr" inputMode="numeric" value={cvr} onChange={(e) => setCvr(e.target.value)} placeholder="8 cifre" />
              </div>
              <Button type="submit" variant="outline" disabled={busy !== null || !cvr.trim()}>
                {busy === "propose" ? <Spinner /> : null} Foreslå
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-accent" /> AI Research
            </CardTitle>
            <CardDescription>Website Intelligence, websøgning, konkurrenter, forretningsanalyse og konkrete serviceanbefalinger.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {brand.mode === "live" && (
              <div className="space-y-2">
                <Label htmlFor="website">{websites.length ? "Anden hjemmeside (valgfri)" : "Hjemmeside"}</Label>
                <Input id="website" type="url" placeholder={websites[0]?.url ?? "https://…"} value={website} onChange={(e) => setWebsite(e.target.value)} disabled={Boolean(running)} />
                <p className="text-xs text-muted-foreground">Kun offentlige sider hentes (maks. 8), og robots.txt respekteres.</p>
              </div>
            )}
            {brand.mode === "live" && policyOptions && policyOptions.length > 1 && (
              <div className="space-y-2">
                <Label htmlFor="policy">AI-motor</Label>
                <Select id="policy" value={policy} onChange={(e) => setPolicy(e.target.value)} disabled={Boolean(running)} data-testid="research-policy">
                  {policyOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
                <p className="text-xs text-muted-foreground">Automatisk: routeren vælger Claude API, hvis den er konfigureret og inden for budget — ellers regelbaseret analyse.</p>
              </div>
            )}
            <Button className="w-full" size="lg" onClick={start} disabled={Boolean(running) || busy !== null} data-testid="start-research">
              {running || busy === "start" ? <Spinner /> : <Sparkles />} {running ? "Research kører…" : "Start AI Research"}
            </Button>
            {aiJob && (
              <div className="rounded-lg border border-border bg-muted/40 p-3 text-xs" data-testid="research-routing">
                <p>
                  <span className="font-medium">Motor:</span> {aiJob.engine ? ENGINE_NAMES[aiJob.engine] : "ingen"}
                  {aiJob.fallback && <span className="text-muted-foreground"> (fallback)</span>} ·{" "}
                  <Link href={`/aos/jobs/${aiJob.id}`} className="text-accent hover:underline">
                    Se i AOS
                  </Link>
                </p>
                {aiJob.explanation && <p className="mt-1 text-muted-foreground">{aiJob.explanation}</p>}
                {aiJob.status === "awaiting_approval" && <p className="mt-1 font-medium text-warning-foreground">Afventer godkendelse i AOS, før researchen starter.</p>}
              </div>
            )}
            {job && <JobProgress job={job} />}
            {job?.status === "failed" && <Alert variant="error" title="Researchen fejlede">{job.error}</Alert>}
            {error && <Alert variant="error" title="Handlingen mislykkedes">{error}</Alert>}
          </CardContent>
        </Card>
        {aside}
        {reports.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Rapporter for brandet</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {reports.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-2 text-sm">
                    <Link href={`/research/reports/${r.id}`} className="inline-flex items-center gap-2 text-accent hover:underline">
                      <FileSearch className="h-4 w-4" /> {formatDateTime(r.createdAt)}
                    </Link>
                    <Badge variant={r.status === "handed_off" ? "success" : "muted"}>{r.status === "handed_off" ? "Overført til tilbud" : r.status === "saved" ? "Gemt" : "Udkast"}</Badge>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
