"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Company, ResearchJob, ResearchStep } from "@agency/core";
import { Alert, apiFetch, Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, KeyValue, Label, Spinner } from "@agency/ui";
import { formatDateTime } from "@agency/shared";
import { CheckCircle2, Circle, CircleSlash, FileSearch, Loader2, ShieldAlert, Sparkles, XCircle } from "lucide-react";

export interface CompanyResearchProps {
  company: Company;
  latestJob: ResearchJob | null;
  reports: Array<{ id: string; createdAt: string; status: string; analysisEngine: string }>;
}

function addressLine(company: Company) {
  const a = company.address;
  if (!a) return null;
  return [a.street, [a.postalCode, a.city].filter(Boolean).join(" ")].filter(Boolean).join(", ");
}

export function CompanyCard({ company }: { company: Company }) {
  const provider = company.registrySource.provider === "demo" ? "Fiktive demodata" : `CVR-registret via ${company.registrySource.provider}`;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Registeroplysninger</CardTitle>
        <CardDescription>
          Kilde: {provider} · hentet {formatDateTime(company.registrySource.retrievedAt)}
          {company.registrySource.reference && company.mode === "live" && (
            <>
              {" · "}
              <a className="text-accent hover:underline" href={company.registrySource.reference} target="_blank" rel="noopener noreferrer">
                Se i CVR
              </a>
            </>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <dl className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <KeyValue label="Virksomhedsnavn" value={company.name} />
          <KeyValue label="CVR-nummer" value={company.mode === "demo" ? `${company.cvr} (fiktivt)` : company.cvr} />
          <KeyValue label="Status" value={company.status} />
          <KeyValue label="Adresse" value={addressLine(company)} />
          <KeyValue label="Branche" value={company.industry ? `${company.industry.text}${company.industry.code ? ` (${company.industry.code})` : ""}` : null} />
          <KeyValue label="Virksomhedsform" value={company.companyForm?.text} />
          <KeyValue label="Stiftet" value={company.foundedAt} />
          <KeyValue label="Ansatte" value={company.employees?.count != null ? `${company.employees.count} (${company.employees.year ?? ""})` : company.employees?.interval} />
          <KeyValue
            label="Hjemmeside"
            value={
              company.contact.website ? (
                company.mode === "demo" ? (
                  `${company.contact.website} (fiktiv)`
                ) : (
                  <a className="text-accent hover:underline" href={company.contact.website} target="_blank" rel="noopener noreferrer">
                    {company.contact.website}
                  </a>
                )
              ) : null
            }
          />
        </dl>
        {company.adProtected && (
          <Alert variant="warning" title="Reklamebeskyttet">
            Virksomheden er reklamebeskyttet i CVR og må ikke kontaktes med henblik på direkte markedsføring uden forudgående samtykke.
          </Alert>
        )}
        <p className="text-xs text-muted-foreground">Intern identifikator: {company.id}</p>
      </CardContent>
    </Card>
  );
}

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

export function CompanyResearch({ company, latestJob, reports }: CompanyResearchProps) {
  const router = useRouter();
  const [job, setJob] = React.useState<ResearchJob | null>(latestJob && (latestJob.status === "running" || latestJob.status === "queued") ? latestJob : null);
  const [website, setWebsite] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [starting, setStarting] = React.useState(false);

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
    }, 800);
    return () => clearInterval(timer);
  }, [job, router]);

  async function start() {
    setStarting(true);
    setError(null);
    try {
      const created = await apiFetch<ResearchJob>("/api/research/jobs", {
        body: { companyId: company.id, websiteUrl: website.trim() || null },
      });
      setJob(created);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setStarting(false);
    }
  }

  const running = job && (job.status === "queued" || job.status === "running");

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      <CompanyCard company={company} />
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-accent" /> AI Research
            </CardTitle>
            <CardDescription>Undersøger registerdata, hjemmeside, websøgning og konkurrenter og foreslår services fra kataloget.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {company.mode === "live" && (
              <div className="space-y-2">
                <Label htmlFor="website">Hjemmeside (valgfri overstyring)</Label>
                <Input id="website" type="url" placeholder={company.contact.website ?? "https://…"} value={website} onChange={(e) => setWebsite(e.target.value)} disabled={Boolean(running)} />
                <p className="text-xs text-muted-foreground">Kun offentlige sider hentes, og robots.txt respekteres.</p>
              </div>
            )}
            <Button className="w-full" size="lg" onClick={start} disabled={Boolean(running) || starting} data-testid="start-research">
              {running || starting ? <Spinner /> : <Sparkles />} {running ? "Research kører…" : "Start AI Research"}
            </Button>
            {job && <JobProgress job={job} />}
            {job?.status === "failed" && <Alert variant="error" title="Researchen fejlede">{job.error}</Alert>}
            {error && <Alert variant="error" title="Kunne ikke starte research">{error}</Alert>}
          </CardContent>
        </Card>
        {company.adProtected && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <ShieldAlert className="h-3.5 w-3.5" /> Reklamebeskyttelse respekteres i salgsarbejdet.
          </div>
        )}
        {reports.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Tidligere rapporter</CardTitle>
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
