"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Brand, Company, ResearchReport, ServiceRecommendation } from "@agency/core";
import { CLASSIFICATION_LABELS, SOURCE_KIND_LABELS } from "@agency/core";
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
  Label,
  ModeBadge,
  Spinner,
  Tabs,
  Textarea,
} from "@agency/ui";
import { formatDateTime } from "@agency/shared";
import { ArrowRight, Building2, ChevronDown, ChevronUp, CircleHelp, FileText, FlaskConical, Globe, MessageCircleQuestion, Radar, Save, ShieldCheck, ShieldQuestion, Swords, Target, TriangleAlert } from "lucide-react";
import { ClassificationBadge, ComplexityBadge, EngineBadge, PriorityBadge, ScoreRing } from "./badges";
import { FindingList } from "./findings";
import { SourceProvider, SourceRefs, useSources } from "./source-context";

type Tab = "overview" | "recommendations" | "website" | "profile" | "opportunities" | "competitors" | "sources";

const FEATURE_STATUS = {
  observed: { label: "Observeret", variant: "success" as const },
  not_observed: { label: "Ikke observeret", variant: "muted" as const },
  unknown: { label: "Ukendt", variant: "outline" as const },
};

const MATURITY_LABEL = { low: "Lav", medium: "Middel", high: "Høj", unknown: "Ukendt" };

const PROFILE_SECTIONS: Array<[keyof ResearchReport["profile"], string]> = [
  ["activities", "Aktiviteter"],
  ["productsAndServices", "Produkter og services"],
  ["targetGroups", "Målgrupper"],
  ["businessModel", "Forretningsmodel"],
  ["digitalPresence", "Digital tilstedeværelse"],
  ["strengths", "Observerede styrker"],
  ["weaknesses", "Observerede svagheder"],
];

export function ResearchReportView({ report, company, brand }: { report: ResearchReport; company: Company | null; brand: Brand | null }) {
  const router = useRouter();
  const isV2 = (report.schemaVersion ?? 1) >= 2;
  const [tab, setTab] = React.useState<Tab>(isV2 ? "overview" : "recommendations");
  const brandName = report.brandSnapshot?.name ?? brand?.name ?? company?.name ?? "Brandet";
  const [recs, setRecs] = React.useState<ServiceRecommendation[]>(report.recommendations);
  const [notes, setNotes] = React.useState(report.notes);
  const [dirty, setDirty] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [handingOff, setHandingOff] = React.useState(false);
  const [savedAt, setSavedAt] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const selectedCount = recs.filter((r) => r.selected).length;

  function patchRec(id: string, patch: Partial<ServiceRecommendation>) {
    setRecs((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    setDirty(true);
  }

  async function save(status: "saved" | "draft" = "saved") {
    setSaving(true);
    setError(null);
    try {
      await apiFetch(`/api/research/reports/${report.id}`, {
        method: "PATCH",
        body: {
          notes,
          status,
          recommendations: recs.map((r) => ({ id: r.id, selected: r.selected, editedDescription: r.editedDescription, note: r.note })),
        },
      });
      setDirty(false);
      setSavedAt(new Date().toISOString());
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function createQuote() {
    setHandingOff(true);
    setError(null);
    if (!(await save())) {
      setHandingOff(false);
      return;
    }
    try {
      const result = await apiFetch<{ quoteId: string }>(`/api/research/reports/${report.id}/handoff`, { method: "POST", body: {} });
      router.push(`/quotes/${result.quoteId}`);
    } catch (e) {
      setError((e as Error).message);
      setHandingOff(false);
    }
  }

  return (
    <SourceProvider sources={report.sources}>
      <div className="space-y-6 pb-28">
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <ModeBadge mode={report.mode} />
          {report.mode === "live" ? (
            <Badge variant="success" data-testid="research-basis">Reel research på offentlige kilder</Badge>
          ) : (
            <Badge variant="demo" data-testid="research-basis">
              <FlaskConical /> Demo Mode — fiktivt grundlag
            </Badge>
          )}
          <EngineBadge engine={report.analysisEngine} model={report.analysisModel} />
          <span>Genereret {formatDateTime(report.createdAt)}</span>
          <span>·</span>
          <span>{report.sources.length} kilder</span>
          {report.handoffs.length > 0 && (
            <>
              <span>·</span>
              <Link className="text-accent hover:underline" href={`/quotes/${report.handoffs[report.handoffs.length - 1].quoteId}`}>
                Åbn seneste tilbud
              </Link>
            </>
          )}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Resumé</CardTitle>
            <CardDescription>
              Skelnen mellem <strong>{CLASSIFICATION_LABELS.fact.toLowerCase()}</strong>, <strong>{CLASSIFICATION_LABELS.assessment.toLowerCase()}er</strong> og{" "}
              <strong>{CLASSIFICATION_LABELS.hypothesis.toLowerCase()}r</strong> er markeret ved hvert fund. Klik på [n] for at åbne kilden.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm leading-relaxed text-foreground" data-testid="report-summary">{report.summary}</p>
            <div className="flex flex-wrap gap-2">
              <ClassificationBadge classification="fact" />
              <ClassificationBadge classification="assessment" />
              <ClassificationBadge classification="hypothesis" />
              <ClassificationBadge classification="unknown" />
            </div>
          </CardContent>
        </Card>

        {report.limitations.length > 0 && (
          <Alert variant={report.mode === "demo" ? "warning" : "info"} title="Datagrundlag og begrænsninger">
            <ul className="mt-1 list-disc space-y-1 pl-4">
              {report.limitations.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          </Alert>
        )}

        <Tabs
          value={tab}
          onValueChange={(v) => setTab(v as Tab)}
          items={[
            ...(isV2 ? [{ value: "overview", label: "Overblik" }] : []),
            { value: "recommendations", label: "Serviceanbefalinger", count: recs.length },
            ...(report.websiteAnalysis ? [{ value: "website", label: "Website-analyse", count: report.websiteAnalysis.pages.length }] : []),
            { value: "profile", label: isV2 ? "Forretning og målgrupper" : "Virksomhedsprofil" },
            { value: "opportunities", label: "Forbedringsmuligheder", count: report.opportunities.length },
            { value: "competitors", label: "Konkurrenter", count: report.competitors.length },
            { value: "sources", label: "Kilder", count: report.sources.length },
          ]}
        />

        {tab === "overview" && <OverviewTab report={report} brandName={brandName} />}
        {tab === "website" && report.websiteAnalysis && <WebsiteTab report={report} />}

        {tab === "recommendations" && (
          <div className="space-y-4">
            {recs.length === 0 && <EmptyState title="Ingen anbefalinger" description="Datagrundlaget var ikke tilstrækkeligt til at anbefale services." />}
            {recs.map((rec) => (
              <RecommendationCard key={rec.id} rec={rec} onChange={(patch) => patchRec(rec.id, patch)} />
            ))}
            <Card>
              <CardHeader>
                <CardTitle>Noter til rapporten</CardTitle>
                <CardDescription>Overføres til tilbuddet sammen med de valgte services.</CardDescription>
              </CardHeader>
              <CardContent>
                <Textarea
                  aria-label="Noter til rapporten"
                  value={notes}
                  onChange={(e) => {
                    setNotes(e.target.value);
                    setDirty(true);
                  }}
                  placeholder="Fx indtryk fra første samtale, kontaktperson, budgetramme…"
                  rows={4}
                />
              </CardContent>
            </Card>
          </div>
        )}

        {tab === "profile" && (
          <div className="grid gap-4 lg:grid-cols-2">
            {PROFILE_SECTIONS.map(([key, label]) => (
              <Card key={key}>
                <CardHeader>
                  <CardTitle>{label}</CardTitle>
                </CardHeader>
                <CardContent>
                  <FindingList findings={report.profile[key]} empty="Ikke tilstrækkeligt grundlag i kilderne." />
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {tab === "opportunities" && (
          <div className="space-y-3">
            {report.opportunities.length === 0 && <EmptyState title="Ingen forbedringsmuligheder identificeret" />}
            {report.opportunities.map((opp) => (
              <Card key={opp.id}>
                <CardContent className="flex gap-4 p-5">
                  <ScoreRing score={opp.score.total} />
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold">{opp.title}</h3>
                      <ClassificationBadge classification={opp.classification} />
                    </div>
                    {opp.observed ? (
                      <dl className="grid gap-2 text-sm md:grid-cols-2">
                        <OppField label="Observeret" value={opp.observed} refs={opp.sourceIds} />
                        <OppField label="Potentielt problem" value={opp.potentialProblem} />
                        <OppField label="Relevant løsning" value={opp.solution} />
                        <OppField label="Mulig værdi" value={opp.value} />
                        {opp.missingInformation && opp.missingInformation.length > 0 && (
                          <div className="md:col-span-2">
                            <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Mangler for at bekræfte behovet</dt>
                            <dd>
                              <ul className="mt-1 list-disc pl-4 text-muted-foreground">
                                {opp.missingInformation.map((m) => (
                                  <li key={m}>{m}</li>
                                ))}
                              </ul>
                            </dd>
                          </div>
                        )}
                      </dl>
                    ) : (
                      <p className="text-sm leading-relaxed text-muted-foreground">
                        {opp.description} <SourceRefs ids={opp.sourceIds} />
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {tab === "competitors" && <CompetitorsTab report={report} brandName={brandName} />}
        {tab === "sources" && <SourcesTab />}

        {error && <Alert variant="error" title="Der opstod en fejl">{error}</Alert>}
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 backdrop-blur lg:left-72">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-3">
          <div className="text-sm">
            <span className="font-semibold" data-testid="selected-count">{selectedCount}</span> <span className="text-muted-foreground">services valgt</span>
            {dirty ? <span className="ml-3 text-xs text-warning-foreground">Ikke gemte ændringer</span> : savedAt ? <span className="ml-3 text-xs text-success">Gemt</span> : null}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => save()} disabled={saving || handingOff} data-testid="save-report">
              {saving ? <Spinner /> : <Save />} Gem rapport
            </Button>
            <Button onClick={createQuote} disabled={selectedCount === 0 || handingOff} data-testid="create-quote">
              {handingOff ? <Spinner /> : <FileText />} Opret tilbud <ArrowRight />
            </Button>
          </div>
        </div>
      </div>
    </SourceProvider>
  );
}

function RecommendationCard({ rec, onChange }: { rec: ServiceRecommendation; onChange: (patch: Partial<ServiceRecommendation>) => void }) {
  const [open, setOpen] = React.useState(false);
  const [showScore, setShowScore] = React.useState(false);
  return (
    <Card className={rec.selected ? "border-accent/50 ring-1 ring-accent/30" : undefined} data-testid="recommendation">
      <CardContent className="space-y-4 p-5">
        <div className="flex items-start gap-4">
          <Checkbox
            checked={rec.selected}
            onCheckedChange={(checked) => onChange({ selected: checked })}
            aria-label={`Vælg ${rec.serviceName}`}
            className="mt-1.5 h-5 w-5"
            data-testid={`select-${rec.catalogItemId}`}
          />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-semibold">{rec.serviceName}</h3>
              <PriorityBadge priority={rec.priority} />
              <ComplexityBadge complexity={rec.complexity} />
            </div>
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">Problem, løsningen adresserer: </span>
              {rec.problem}
            </p>
            <p className="text-sm leading-relaxed text-foreground">
              <span className="font-medium">Hvorfor relevant: </span>
              {rec.relevance}
            </p>
            {rec.proposedSolution && (
              <p className="text-sm leading-relaxed text-foreground">
                <span className="font-medium">Foreslået løsning: </span>
                {rec.proposedSolution}
              </p>
            )}
            {rec.businessBenefit && (
              <p className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">Forventet fordel (kvalitativ): </span>
                {rec.businessBenefit}
              </p>
            )}
          </div>
          <button type="button" onClick={() => setShowScore((v) => !v)} className="flex flex-col items-center gap-1 rounded-lg p-1 hover:bg-muted" aria-expanded={showScore} aria-label="Vis scoreberegning">
            <ScoreRing score={rec.score.total} />
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Score</span>
          </button>
        </div>

        {showScore && (
          <div className="rounded-lg border border-border bg-muted/40 p-4">
            <p className="mb-3 text-xs text-muted-foreground">{rec.score.method}</p>
            <div className="space-y-2.5">
              {rec.score.criteria.map((c) => (
                <div key={c.key} className="grid grid-cols-[200px_1fr_44px] items-center gap-3 text-sm">
                  <span className="text-foreground">
                    {c.label} <span className="text-xs text-muted-foreground">({Math.round(c.weight * 100)} %)</span>
                  </span>
                  <div className="space-y-1">
                    <div className="h-1.5 rounded-full bg-muted">
                      <div className="h-1.5 rounded-full bg-accent" style={{ width: `${c.value}%` }} />
                    </div>
                    <p className="text-xs text-muted-foreground">{c.rationale}</p>
                  </div>
                  <span className="text-right tabular-nums">{c.value}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="pl-9">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Researchfund og kilder</p>
          <FindingList findings={rec.findings} />
        </div>

        <div className="pl-9">
          <button type="button" className="inline-flex items-center gap-1 text-sm font-medium text-accent" onClick={() => setOpen((v) => !v)}>
            {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />} {open ? "Skjul detaljer og redigering" : "Fordele, forudsætninger, usikkerheder og redigering"}
          </button>
          {open && (
            <div className="mt-4 space-y-5">
              <div className="grid gap-4 md:grid-cols-3">
                <ListBlock title="Forventede fordele" items={rec.expectedBenefits} />
                <ListBlock title="Forudsætninger" items={rec.prerequisites} />
                <ListBlock title="Usikkerheder" items={rec.uncertainties} icon={<TriangleAlert className="h-3.5 w-3.5 text-warning-foreground" />} />
              </div>
              {rec.customerQuestions && rec.customerQuestions.length > 0 && (
                <ListBlock title="Spørgsmål til kunden" items={rec.customerQuestions} icon={<CircleHelp className="h-3.5 w-3.5 text-accent" />} />
              )}
              <p className="text-xs text-muted-foreground">Fordele er kvalitative. Der angives ikke beregnede besparelser eller omsætningseffekter, da de ikke er dokumenteret.</p>
              <div className="space-y-2">
                <Label htmlFor={`desc-${rec.id}`}>Beskrivelse til tilbuddet</Label>
                <Textarea
                  id={`desc-${rec.id}`}
                  rows={3}
                  value={rec.editedDescription ?? ""}
                  placeholder={rec.relevance}
                  onChange={(e) => onChange({ editedDescription: e.target.value || null })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor={`note-${rec.id}`}>Intern note</Label>
                <Textarea id={`note-${rec.id}`} rows={2} value={rec.note ?? ""} onChange={(e) => onChange({ note: e.target.value || null })} />
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function ListBlock({ title, items, icon }: { title: string; items: string[]; icon?: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      <ul className="space-y-1.5 text-sm">
        {items.map((item) => (
          <li key={item} className="flex gap-2">
            {icon ?? <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-muted-foreground" />}
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function CompetitorsTab({ report, brandName }: { report: ResearchReport; brandName: string }) {
  if (report.competitors.length === 0)
    return <EmptyState icon={<Swords className="h-8 w-8" />} title="Ingen konkurrenter identificeret" description="Konkurrenter vises kun, når de fremgår af en kilde (fx websøgning). Der opfindes ingen konkurrenter." />;
  const ownFeatures = report.profile.digitalPresence.filter((f) => f.classification === "fact").length;
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Sammenligning af observerbare digitale funktioner. {brandName} har {ownFeatures} dokumenterede forhold under digital tilstedeværelse. Der konkluderes intet om konkurrenternes interne systemer.
      </p>
      {report.competitors.map((c) => (
        <Card key={c.id}>
          <CardContent className="space-y-3 p-5">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-semibold">{c.name}</h3>
              <ClassificationBadge classification={c.classification} />
              {report.mode === "demo" && (
                <Badge variant="demo">
                  <FlaskConical /> Fiktiv
                </Badge>
              )}
              <SourceRefs ids={c.sourceIds} />
            </div>
            <p className="text-sm text-foreground">{c.comparison}</p>
            {c.observedFeatures.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {c.observedFeatures.map((f) => (
                  <Badge key={f} variant="outline">
                    {f}
                  </Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function SourcesTab() {
  const { sources, open } = useSources();
  return (
    <Card>
      <CardContent className="divide-y divide-border p-0">
        {sources.map((s, i) => (
          <button key={s.id} type="button" onClick={() => open(s.id)} className="flex w-full items-start gap-4 px-5 py-4 text-left hover:bg-muted/40">
            <span className="w-8 shrink-0 text-sm tabular-nums text-muted-foreground">[{i + 1}]</span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{s.title}</p>
              <p className="truncate text-xs text-muted-foreground">
                {SOURCE_KIND_LABELS[s.kind]} · {s.provider} · {formatDateTime(s.retrievedAt)} {s.url ? `· ${s.url}` : ""}
              </p>
            </div>
            {s.isDemo && <Badge variant="demo">Demo</Badge>}
          </button>
        ))}
      </CardContent>
    </Card>
  );
}

function OppField({ label, value, refs }: { label: string; value?: string; refs?: string[] }) {
  if (!value) return null;
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="text-foreground">
        {value} {refs && <SourceRefs ids={refs} />}
      </dd>
    </div>
  );
}

function OverviewTab({ report, brandName }: { report: ResearchReport; brandName: string }) {
  const maturity = report.digitalMaturity;
  const legal = report.legalEntities ?? [];
  return (
    <div className="grid gap-4 lg:grid-cols-2" data-testid="overview-tab">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="h-4 w-4 text-accent" /> Samlet anbefaling
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm leading-relaxed" data-testid="overall-recommendation">{report.overallRecommendation}</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-4 w-4 text-accent" /> Brandprofil
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="font-medium">{brandName}</p>
          {(report.brandSnapshot?.websites ?? []).map((w) => (
            <p key={w} className="text-muted-foreground">{w}{report.mode === "demo" ? " (fiktiv)" : ""}</p>
          ))}
          <FindingList findings={report.profile.activities.slice(0, 3)} empty="Aktiviteter kunne ikke fastslås." />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-accent" /> Juridiske virksomhedsoplysninger
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {legal.length === 0 && <p className="text-muted-foreground">Ingen juridisk enhed identificeret. Analysen bygger på brandets egne kilder.</p>}
          {legal.map((l) => (
            <div key={l.legalEntityId} className="rounded-md border border-border p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{l.name}</span>
                <span className="tabular-nums text-muted-foreground">CVR {l.cvr}</span>
                {l.status === "confirmed" ? (
                  <Badge variant="success">
                    <ShieldCheck /> Bekræftet
                  </Badge>
                ) : (
                  <Badge variant="warning">
                    <ShieldQuestion /> Foreslået — ikke brugt i analysen
                  </Badge>
                )}
                {l.sourceId && <SourceRefs ids={[l.sourceId]} />}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {[l.industry, l.companyForm, l.address, l.establishments ? `${l.establishments} arbejdssted(er)` : null].filter(Boolean).join(" · ")}
              </p>
            </div>
          ))}
        </CardContent>
      </Card>
      {maturity && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Radar className="h-4 w-4 text-accent" /> Digital modenhed
            </CardTitle>
          </CardHeader>
          <CardContent className="flex gap-4 text-sm">
            {maturity.level !== "unknown" && <ScoreRing score={maturity.score} />}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="font-medium">{MATURITY_LABEL[maturity.level]}</span>
                <ClassificationBadge classification={maturity.classification} />
              </div>
              <p className="text-muted-foreground">{maturity.rationale}</p>
            </div>
          </CardContent>
        </Card>
      )}
      {report.meetingQuestions && report.meetingQuestions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageCircleQuestion className="h-4 w-4 text-accent" /> Spørgsmål til kundemødet
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="list-decimal space-y-1.5 pl-5 text-sm" data-testid="meeting-questions">
              {report.meetingQuestions.map((q) => (
                <li key={q}>{q}</li>
              ))}
            </ol>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function WebsiteTab({ report }: { report: ResearchReport }) {
  const wa = report.websiteAnalysis!;
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]" data-testid="website-tab">
      <Card>
        <CardHeader>
          <CardTitle>Undersøgte sider</CardTitle>
          <CardDescription>Kun offentlige sider; robots.txt respekteres.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {wa.pages.length === 0 && <p className="text-muted-foreground">Ingen sider kunne undersøges.</p>}
          {wa.pages.map((p) => (
            <div key={p.sourceId} className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate font-medium">{p.title}</p>
                <p className="truncate text-xs text-muted-foreground">{p.url}</p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Badge variant="outline">{p.pageType}</Badge>
                <SourceRefs ids={[p.sourceId]} />
              </div>
            </div>
          ))}
          {wa.blocked.length > 0 && (
            <div className="pt-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Kunne ikke hentes</p>
              {wa.blocked.map((b) => (
                <p key={b.url} className="text-xs text-muted-foreground">{b.url} — {b.reason}</p>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Digitale funktioner</CardTitle>
          <CardDescription>"Ikke observeret" betyder kun, at funktionen ikke blev fundet på de undersøgte sider.</CardDescription>
        </CardHeader>
        <CardContent className="divide-y divide-border p-0">
          {wa.features.map((f) => (
            <div key={f.key} className="flex items-start gap-3 px-6 py-3 text-sm" data-testid={`feature-${f.key}`}>
              <Badge variant={FEATURE_STATUS[f.status].variant} className="mt-0.5 shrink-0">{FEATURE_STATUS[f.status].label}</Badge>
              <div className="min-w-0">
                <p className="font-medium">{f.label}</p>
                <p className="text-xs text-muted-foreground">
                  {f.evidence} {f.status === "observed" && <SourceRefs ids={f.sourceIds} />}
                </p>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
