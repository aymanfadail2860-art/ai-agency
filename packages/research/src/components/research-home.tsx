"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Brand, Company, Establishment, Mode } from "@agency/core";
import {
  Alert,
  apiFetch,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Checkbox,
  EmptyState,
  Input,
  Label,
  ModeBadge,
  Spinner,
  Table,
  Tabs,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from "@agency/ui";
import { formatDateTime, validateCvr } from "@agency/shared";
import { ArrowRight, Building2, FlaskConical, Globe, Hash, MapPin, Search, ShieldQuestion } from "lucide-react";

/* Typer spejler DiscoveryResult fra serveren (kun de felter, UI'en bruger). */
interface DiscoveredLegalEntity {
  company: Company;
  secondaryNames: string[];
  establishments: Establishment[];
  totalPNumbers: number;
  via: "user_cvr_input" | "website_cvr_mention";
  evidence: { description: string; url: string | null };
}
interface BrandCandidate {
  name: string;
  website: string | null;
  source: string;
  legalEntityId: string | null;
  existingBrandId: string | null;
}
interface Discovery {
  input: { type: "cvr" | "url"; value: string };
  legalEntities: DiscoveredLegalEntity[];
  brandCandidates: BrandCandidate[];
  website: { url: string; domain: string; brandName: string; title: string; description: string; reachable: boolean; error: string | null } | null;
  cvrMentions: Array<{ cvr: string; url: string; snippet: string; verified: boolean }>;
  nameSearchHits: Array<{ cvr: string; name: string; status: string | null; city: string | null; industry: string | null }>;
  existingBrand: { id: string; name: string } | null;
  limitations: string[];
  cvrConfigured: boolean;
}

export interface ResearchHomeProps {
  mode: Mode;
  cvrConfigured: boolean;
  cvrProviderName: string;
  demoExamples: Array<{ type: "cvr" | "url"; value: string; label: string; hint: string }>;
  brands: Array<{
    brand: Brand;
    websites: string[];
    legalNames: Array<{ name: string; cvr: string; status: string }>;
    latestReport: { id: string; createdAt: string } | null;
    latestJob: { status: string } | null;
  }>;
}

export function ResearchHome({ mode, cvrConfigured, cvrProviderName, demoExamples, brands }: ResearchHomeProps) {
  const [type, setType] = React.useState<"cvr" | "url">("url");
  const [value, setValue] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [discovery, setDiscovery] = React.useState<Discovery | null>(null);

  const cvrValidation = type === "cvr" && value && mode === "live" ? validateCvr(value) : null;

  async function run(t: "cvr" | "url", v: string) {
    setBusy(true);
    setError(null);
    setDiscovery(null);
    try {
      setDiscovery(await apiFetch<Discovery>("/api/research/discover", { body: { type: t, value: v } }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-8">
      {mode === "demo" && (
        <Alert variant="warning" title="Demo Mode">
          Alle brands, virksomheder, kilder og priser i Demo Mode er fiktive og tydeligt markeret. Skift til Live Mode under Indstillinger for reel research.
        </Alert>
      )}
      <Card>
        <CardHeader>
          <CardTitle>Start research</CardTitle>
          <CardDescription>Begynd med et CVR-nummer eller brandets hjemmeside. Begge veje fører til samme Research Engine — CVR er valgfrit.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Tabs
            value={type}
            onValueChange={(v) => {
              setType(v as "cvr" | "url");
              setValue("");
              setDiscovery(null);
              setError(null);
            }}
            items={[
              { value: "url", label: <span className="inline-flex items-center gap-1.5" data-testid="entry-url"><Globe className="h-4 w-4" /> Hjemmeside / URL</span> },
              { value: "cvr", label: <span className="inline-flex items-center gap-1.5" data-testid="entry-cvr"><Hash className="h-4 w-4" /> CVR-nummer</span> },
            ]}
          />
          {type === "cvr" && mode === "live" && !cvrConfigured && (
            <Alert variant="warning" title="CVR-opslag er ikke konfigureret">
              {cvrProviderName} kræver en API-nøgle (se <Link className="text-accent underline" href="/settings">Indstillinger</Link>). Brug i stedet URL-indgangen — research kan gennemføres fuldt ud uden CVR.
            </Alert>
          )}
          <form
            className="flex flex-col gap-3 sm:flex-row sm:items-end"
            onSubmit={(e) => {
              e.preventDefault();
              if (value.trim()) run(type, value.trim());
            }}
          >
            <div className="flex-1 space-y-2">
              <Label htmlFor="research-input">{type === "cvr" ? "CVR-nummer" : "Hjemmesideadresse"}</Label>
              <Input
                id="research-input"
                data-testid="research-input"
                autoComplete="off"
                inputMode={type === "cvr" ? "numeric" : "url"}
                placeholder={type === "cvr" ? (mode === "demo" ? "fx 00000004" : "fx 10150817") : mode === "demo" ? "fx https://bryggeriet-nordlys.example" : "fx https://www.eksempel.dk"}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                maxLength={type === "cvr" ? 14 : 500}
              />
            </div>
            <Button type="submit" disabled={busy || !value.trim() || (cvrValidation ? !cvrValidation.valid : false)} data-testid="discover">
              {busy ? <Spinner /> : <Search />} Identificér brand
            </Button>
          </form>
          {cvrValidation && !cvrValidation.valid && <p className="text-sm text-destructive">{cvrValidation.reason}</p>}
          {mode === "demo" && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted-foreground">Demoeksempler:</span>
              {demoExamples.map((ex) => (
                <button
                  key={ex.value}
                  type="button"
                  title={ex.hint}
                  data-testid={`demo-example-${ex.value.replace(/[^a-z0-9]/gi, "")}`}
                  className="inline-flex items-center gap-1 rounded-full border border-warning/40 bg-warning/10 px-2.5 py-1 text-xs font-medium text-warning-foreground hover:bg-warning/20"
                  onClick={() => {
                    setType(ex.type);
                    setValue(ex.value);
                    run(ex.type, ex.value);
                  }}
                >
                  <FlaskConical className="h-3 w-3" /> {ex.label}
                </button>
              ))}
            </div>
          )}
          {error && <Alert variant="error" title="Identifikationen mislykkedes">{error}</Alert>}
        </CardContent>
      </Card>

      {discovery && <DiscoveryPanel discovery={discovery} mode={mode} />}

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.12em] text-muted-foreground">Undersøgte brands</h2>
        {brands.length === 0 ? (
          <EmptyState icon={<Building2 className="h-8 w-8" />} title="Ingen brands endnu" description="Start research ovenfor med en hjemmeside eller et CVR-nummer." />
        ) : (
          <Card>
            <Table>
              <THead>
                <TR>
                  <TH>Brand</TH>
                  <TH>Juridisk enhed</TH>
                  <TH>Hjemmeside</TH>
                  <TH>Seneste research</TH>
                  <TH className="text-right">Handling</TH>
                </TR>
              </THead>
              <TBody>
                {brands.map(({ brand, websites, legalNames, latestReport, latestJob }) => (
                  <TR key={brand.id}>
                    <TD>
                      <div className="flex items-center gap-2 font-medium">
                        {brand.name} <ModeBadge mode={brand.mode} />
                      </div>
                    </TD>
                    <TD className="text-sm text-muted-foreground">
                      {legalNames.length === 0
                        ? "Ikke identificeret"
                        : legalNames.map((l) => (
                            <span key={l.cvr} className="block">
                              {l.name} <span className="tabular-nums">({l.cvr})</span> {l.status === "suggested" && <Badge variant="warning" className="ml-1">Foreslået</Badge>}
                            </span>
                          ))}
                    </TD>
                    <TD className="max-w-[220px] truncate text-sm text-muted-foreground">{websites[0] ?? "—"}</TD>
                    <TD className="text-muted-foreground">{latestReport ? formatDateTime(latestReport.createdAt) : latestJob?.status === "running" ? "Kører…" : "Ikke startet"}</TD>
                    <TD className="text-right">
                      <Button asChild variant="ghost" size="sm">
                        <Link href={latestReport ? `/research/reports/${latestReport.id}` : `/research/brands/${brand.id}`}>
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

function DiscoveryPanel({ discovery, mode }: { discovery: Discovery; mode: Mode }) {
  const router = useRouter();
  const isCvr = discovery.input.type === "cvr";
  const [choice, setChoice] = React.useState(0);
  const [name, setName] = React.useState(discovery.brandCandidates[0]?.name ?? "");
  const [website, setWebsite] = React.useState(discovery.brandCandidates[0]?.website ?? "");
  const [suggest, setSuggest] = React.useState<string[]>(discovery.legalEntities.map((l) => l.company.id));
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const candidate = discovery.brandCandidates[choice];

  function pick(i: number) {
    setChoice(i);
    setName(discovery.brandCandidates[i].name);
    setWebsite(discovery.brandCandidates[i].website ?? "");
  }

  async function create() {
    if (candidate?.existingBrandId && candidate.name === name) {
      router.push(`/research/brands/${candidate.existingBrandId}`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch<{ brand: Brand; created: boolean }>("/api/research/brands", {
        body: {
          type: discovery.input.type,
          name,
          websiteUrl: website.trim() || null,
          legalEntityId: isCvr ? discovery.legalEntities[0]?.company.id ?? null : null,
          suggestedLegalEntityIds: isCvr ? [] : suggest,
        },
      });
      router.push(`/research/brands/${res.brand.id}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <Card className="border-accent/40" data-testid="discovery-result">
      <CardHeader>
        <CardTitle>Identifikation</CardTitle>
        <CardDescription>Bekræft brandet, der skal analyseres. Juridiske relationer gættes ikke — kun det, du selv angiver eller bekræfter, regnes som bekræftet.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {discovery.existingBrand && (
          <Alert variant="info" title={`Brandet "${discovery.existingBrand.name}" findes allerede`}>
            Der oprettes ikke en dublet. <Link className="text-accent underline" href={`/research/brands/${discovery.existingBrand.id}`}>Åbn brandet</Link> for at se tidligere rapporter eller starte en ny research.
          </Alert>
        )}

        {discovery.website && (
          <div className="rounded-lg border border-border p-4 text-sm">
            <p className="mb-1 flex items-center gap-2 font-medium">
              <Globe className="h-4 w-4 text-accent" /> {discovery.website.domain}
              {discovery.website.reachable ? <Badge variant="success">Hentet</Badge> : <Badge variant="destructive">Ikke tilgængelig</Badge>}
            </p>
            {discovery.website.title && <p className="text-muted-foreground">{discovery.website.title}</p>}
            {discovery.website.description && <p className="mt-1 text-muted-foreground">{discovery.website.description}</p>}
          </div>
        )}

        {discovery.legalEntities.map((le) => (
          <div key={le.company.id} className="rounded-lg border border-border p-4 text-sm" data-testid="discovered-legal-entity">
            <div className="flex flex-wrap items-center gap-2">
              <Building2 className="h-4 w-4 text-accent" />
              <span className="font-medium">{le.company.name}</span>
              <span className="tabular-nums text-muted-foreground">CVR {le.company.cvr}{mode === "demo" ? " (fiktivt)" : ""}</span>
              {le.via === "user_cvr_input" ? <Badge variant="success">Angivet af dig</Badge> : <Badge variant="warning"><ShieldQuestion /> Foreslået — skal bekræftes</Badge>}
              {le.company.adProtected && <Badge variant="warning">Reklamebeskyttet</Badge>}
            </div>
            <p className="mt-1 text-muted-foreground">
              {le.company.industry?.text ?? "Branche ukendt"} · {le.company.companyForm?.text ?? ""} · {le.company.status ?? ""}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{le.evidence.description}</p>
            {!isCvr && (
              <label className="mt-2 flex items-center gap-2 text-xs">
                <Checkbox checked={suggest.includes(le.company.id)} onCheckedChange={(on) => setSuggest((s) => (on ? [...s, le.company.id] : s.filter((x) => x !== le.company.id)))} />
                Gem som foreslået relation (kan bekræftes eller afvises bagefter)
              </label>
            )}
            {le.establishments.length > 0 && (
              <div className="mt-3">
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Arbejdssteder (P-numre)</p>
                <ul className="space-y-1">
                  {le.establishments.map((e) => (
                    <li key={e.id} className="flex items-center gap-2 text-xs text-muted-foreground">
                      <MapPin className="h-3 w-3" /> {e.name} · {e.address?.street}, {e.address?.postalCode} {e.address?.city} · P-nr. {e.pNumber}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ))}

        {discovery.nameSearchHits.length > 0 && (
          <div className="rounded-lg border border-dashed border-border p-4 text-sm">
            <p className="mb-2 font-medium">Mulige juridiske enheder fra navnesøgning (ikke verificeret)</p>
            <ul className="space-y-1 text-muted-foreground">
              {discovery.nameSearchHits.map((h) => (
                <li key={h.cvr}>
                  {h.name} · CVR {h.cvr} {h.city ? `· ${h.city}` : ""}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-muted-foreground">Du kan foreslå en af dem som relation på brandsiden, når brandet er oprettet.</p>
          </div>
        )}

        <div className="space-y-3">
          <p className="text-sm font-medium">{discovery.brandCandidates.length > 1 ? "Vælg det brand, der skal analyseres" : "Brand"}</p>
          {discovery.brandCandidates.length > 1 && (
            <div className="grid gap-2 md:grid-cols-3">
              {discovery.brandCandidates.map((c, i) => (
                <button
                  key={`${c.name}-${i}`}
                  type="button"
                  onClick={() => pick(i)}
                  data-testid={`brand-candidate-${i}`}
                  className={`rounded-lg border p-3 text-left text-sm transition-colors ${choice === i ? "border-accent bg-accent/5 ring-1 ring-accent/30" : "border-border hover:bg-muted/40"}`}
                >
                  <p className="font-medium">{c.name}</p>
                  <p className="text-xs text-muted-foreground">{c.source}</p>
                  {c.existingBrandId && <Badge variant="info" className="mt-1">Findes allerede</Badge>}
                </button>
              ))}
            </div>
          )}
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="brand-name">Brandnavn</Label>
              <Input id="brand-name" value={name} onChange={(e) => setName(e.target.value)} data-testid="brand-name" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="brand-website">Hjemmeside {isCvr ? "(valgfri, men anbefalet)" : ""}</Label>
              <Input id="brand-website" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://…" data-testid="brand-website" />
            </div>
          </div>
        </div>

        {discovery.limitations.length > 0 && (
          <Alert variant="info" title="Bemærk">
            <ul className="mt-1 list-disc space-y-1 pl-4">
              {discovery.limitations.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          </Alert>
        )}
        {error && <Alert variant="error" title="Brandet kunne ikke oprettes">{error}</Alert>}
        <div className="flex justify-end">
          <Button onClick={create} disabled={busy || !name.trim()} data-testid="create-brand">
            {busy ? <Spinner /> : <ArrowRight />} {candidate?.existingBrandId && candidate.name === name ? "Åbn eksisterende brand" : "Opret brand og fortsæt"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
