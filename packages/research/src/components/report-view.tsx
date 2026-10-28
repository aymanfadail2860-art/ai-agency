"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Company, ResearchReport, ServiceRecommendation } from "@agency/core";
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
import { ArrowRight, ChevronDown, ChevronUp, FileText, FlaskConical, Save, Swords, TriangleAlert } from "lucide-react";
import { ClassificationBadge, ComplexityBadge, EngineBadge, PriorityBadge, ScoreRing } from "./badges";
import { FindingList } from "./findings";
import { SourceProvider, SourceRefs, useSources } from "./source-context";

type Tab = "recommendations" | "profile" | "opportunities" | "competitors" | "sources";

const PROFILE_SECTIONS: Array<[keyof ResearchReport["profile"], string]> = [
  ["activities", "Aktiviteter"],
  ["productsAndServices", "Produkter og services"],
  ["targetGroups", "Målgrupper"],
  ["businessModel", "Forretningsmodel"],
  ["digitalPresence", "Digital tilstedeværelse"],
  ["strengths", "Observerede styrker"],
  ["weaknesses", "Observerede svagheder"],
];

export function ResearchReportView({ report, company }: { report: ResearchReport; company: Company }) {
  const router = useRouter();
  const [tab, setTab] = React.useState<Tab>("recommendations");
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
            { value: "recommendations", label: "Serviceanbefalinger", count: recs.length },
            { value: "profile", label: "Virksomhedsprofil" },
            { value: "opportunities", label: "Forbedringsmuligheder", count: report.opportunities.length },
            { value: "competitors", label: "Konkurrenter", count: report.competitors.length },
            { value: "sources", label: "Kilder", count: report.sources.length },
          ]}
        />

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
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      {opp.description} <SourceRefs ids={opp.sourceIds} />
                    </p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {tab === "competitors" && <CompetitorsTab report={report} company={company} />}
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

function CompetitorsTab({ report, company }: { report: ResearchReport; company: Company }) {
  if (report.competitors.length === 0)
    return <EmptyState icon={<Swords className="h-8 w-8" />} title="Ingen konkurrenter identificeret" description="Konkurrenter vises kun, når de fremgår af en kilde (fx websøgning). Der opfindes ingen konkurrenter." />;
  const ownFeatures = report.profile.digitalPresence.filter((f) => f.classification === "fact").length;
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Sammenligning af observerbare digitale funktioner. {company.name} har {ownFeatures} dokumenterede forhold under digital tilstedeværelse.
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
