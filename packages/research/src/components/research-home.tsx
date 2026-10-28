"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Company, Mode } from "@agency/core";
import { Alert, apiFetch, Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState, Input, Label, ModeBadge, Spinner, Table, TBody, TD, TH, THead, TR } from "@agency/ui";
import { formatDateTime, validateCvr } from "@agency/shared";
import { ArrowRight, Building2, FlaskConical, Search } from "lucide-react";

export interface ResearchHomeProps {
  mode: Mode;
  cvrConfigured: boolean;
  cvrProviderName: string;
  demoCompanies: Array<{ key: string; name: string; tagline: string; industry: string }>;
  companies: Array<{
    company: Company;
    latestReport: { id: string; createdAt: string } | null;
    latestJob: { status: string } | null;
  }>;
}

export function ResearchHome({ mode, cvrConfigured, cvrProviderName, demoCompanies, companies }: ResearchHomeProps) {
  return (
    <div className="space-y-8">
      {mode === "demo" ? <DemoPicker companies={demoCompanies} /> : <CvrLookup configured={cvrConfigured} providerName={cvrProviderName} />}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.12em] text-muted-foreground">Undersøgte virksomheder</h2>
        {companies.length === 0 ? (
          <EmptyState icon={<Building2 className="h-8 w-8" />} title="Ingen virksomheder endnu" description={mode === "demo" ? "Vælg en fiktiv demovirksomhed ovenfor for at starte." : "Slå et CVR-nummer op for at starte."} />
        ) : (
          <Card>
            <Table>
              <THead>
                <TR>
                  <TH>Virksomhed</TH>
                  <TH>CVR</TH>
                  <TH>Branche</TH>
                  <TH>Seneste research</TH>
                  <TH className="text-right">Handling</TH>
                </TR>
              </THead>
              <TBody>
                {companies.map(({ company, latestReport, latestJob }) => (
                  <TR key={company.id}>
                    <TD>
                      <div className="flex items-center gap-2 font-medium">
                        {company.name} <ModeBadge mode={company.mode} />
                      </div>
                    </TD>
                    <TD className="tabular-nums text-muted-foreground">{company.mode === "demo" ? "Fiktivt" : company.cvr}</TD>
                    <TD className="max-w-[260px] truncate text-muted-foreground">{company.industry?.text ?? "—"}</TD>
                    <TD className="text-muted-foreground">
                      {latestReport ? formatDateTime(latestReport.createdAt) : latestJob?.status === "running" ? "Kører…" : "Ikke startet"}
                    </TD>
                    <TD className="text-right">
                      <Button asChild variant="ghost" size="sm">
                        <Link href={latestReport ? `/research/reports/${latestReport.id}` : `/research/companies/${company.id}`}>
                          {latestReport ? "Åbn rapport" : "Åbn"} <ArrowRight />
                        </Link>
                      </Button>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </Card>
        )}
      </section>
    </div>
  );
}

function DemoPicker({ companies }: { companies: ResearchHomeProps["demoCompanies"] }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  async function choose(key: string) {
    setBusy(key);
    setError(null);
    try {
      const company = await apiFetch<Company>("/api/research/companies/demo", { body: { key } });
      router.push(`/research/companies/${company.id}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
    }
  }

  return (
    <section className="space-y-4">
      <Alert variant="warning" title="Demo Mode">
        Alle virksomheder, kilder, konkurrenter og priser i Demo Mode er fiktive og tydeligt markeret. Skift til Live Mode under Indstillinger for rigtige CVR-opslag.
      </Alert>
      <div className="grid gap-4 md:grid-cols-3">
        {companies.map((c) => (
          <Card key={c.key} className="flex flex-col">
            <CardHeader>
              <div className="mb-1 flex items-center justify-between">
                <Badge variant="demo">
                  <FlaskConical /> Fiktiv
                </Badge>
              </div>
              <CardTitle>{c.name}</CardTitle>
              <CardDescription>{c.tagline}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col justify-between gap-4">
              <p className="text-sm text-muted-foreground">{c.industry}</p>
              <Button onClick={() => choose(c.key)} disabled={busy !== null} data-testid={`demo-company-${c.key}`}>
                {busy === c.key ? <Spinner /> : <Building2 />} Vælg virksomhed
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
      {error && <Alert variant="error" title="Kunne ikke vælge virksomhed">{error}</Alert>}
    </section>
  );
}

function CvrLookup({ configured, providerName }: { configured: boolean; providerName: string }) {
  const router = useRouter();
  const [cvr, setCvr] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const validation = cvr.length > 0 ? validateCvr(cvr) : null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!validation?.valid) return;
    setBusy(true);
    setError(null);
    try {
      const company = await apiFetch<Company>("/api/research/companies/lookup", { body: { cvr: validation.cvr } });
      router.push(`/research/companies/${company.id}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>CVR-opslag</CardTitle>
        <CardDescription>Indtast et dansk CVR-nummer. Data hentes fra {providerName}.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!configured && (
          <Alert variant="warning" title="CVR-integrationen er ikke konfigureret">
            Live-opslag kræver en API-nøgle. Se <Link className="text-accent underline" href="/settings">Indstillinger → Integrationer</Link>, eller skift til Demo Mode. Der bruges aldrig fiktive data som erstatning.
          </Alert>
        )}
        <form onSubmit={submit} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-2">
            <Label htmlFor="cvr">CVR-nummer</Label>
            <Input id="cvr" inputMode="numeric" autoComplete="off" placeholder="fx 10150817" value={cvr} onChange={(e) => setCvr(e.target.value)} maxLength={12} />
          </div>
          <Button type="submit" disabled={!validation?.valid || busy || !configured}>
            {busy ? <Spinner /> : <Search />} Slå op
          </Button>
        </form>
        {validation && !validation.valid && <p className="text-sm text-destructive">{validation.reason}</p>}
        {error && <Alert variant="error" title="Opslaget mislykkedes">{error}</Alert>}
      </CardContent>
    </Card>
  );
}
