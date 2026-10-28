"use client";
import * as React from "react";
import Link from "next/link";
import type { Discount, Quote, QuoteContent, QuoteLineItem, QuoteVersion, ServiceCatalogItem } from "@agency/core";
import { Alert, apiFetch, Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Checkbox, Input, Label, ModeBadge, Select, Spinner, Textarea } from "@agency/ui";
import { formatDateTime, formatDkk } from "@agency/shared";
import { Download, FilePlus2, Lock, Plus, Save, Sparkles, Trash2, Wand2 } from "lucide-react";
import { calculateQuoteTotals } from "../pricing";
import { QuotePreview } from "./quote-preview";

type Draft = Pick<QuoteVersion, "lineItems" | "discount" | "specialTerms" | "validityDays" | "content" | "contentEngine">;

const CONTENT_FIELDS: Array<[keyof QuoteContent, string, number]> = [
  ["title", "Titel", 1],
  ["introduction", "Introduktion", 4],
  ["situation", "Virksomhedens situation", 5],
  ["opportunities", "Identificerede muligheder", 6],
  ["solutions", "Anbefalede løsninger", 5],
  ["implementationPlan", "Implementeringsplan", 5],
  ["benefits", "Forventede fordele", 5],
  ["terms", "Vilkår", 6],
  ["nextSteps", "Næste skridt", 3],
];

const ENGINE_LABEL: Record<string, string> = { claude: "AI-genereret (Claude)", template: "Skabelon (ikke AI)", manual: "Manuelt redigeret" };

function toDraft(v: QuoteVersion): Draft {
  return structuredClone({ lineItems: v.lineItems, discount: v.discount, specialTerms: v.specialTerms, validityDays: v.validityDays, content: v.content, contentEngine: v.contentEngine });
}

function newLineId() {
  return `qli_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
}

export function QuoteEditor({ initialQuote, catalog, agencyName, aiAvailable }: { initialQuote: Quote; catalog: ServiceCatalogItem[]; agencyName: string; aiAvailable: boolean }) {
  const [quote, setQuote] = React.useState(initialQuote);
  const [versionId, setVersionId] = React.useState(initialQuote.currentVersionId);
  const version = quote.versions.find((v) => v.id === versionId)!;
  const editable = versionId === quote.currentVersionId;
  const [draft, setDraft] = React.useState<Draft>(() => toDraft(version));
  const [dirty, setDirty] = React.useState(false);
  const [busy, setBusy] = React.useState<null | "save" | "version" | "generate" | "pdf">(null);
  const [message, setMessage] = React.useState<{ kind: "success" | "warning" | "error"; text: string } | null>(null);
  const [addId, setAddId] = React.useState("");

  React.useEffect(() => {
    setDraft(toDraft(quote.versions.find((v) => v.id === versionId)!));
    setDirty(false);
  }, [versionId, quote]);

  const totals = calculateQuoteTotals({ ...draft, vatRate: version.vatRate });

  function update(patch: Partial<Draft>) {
    setDraft((d) => ({ ...d, ...patch }));
    setDirty(true);
  }
  function updateLine(id: string, patch: Partial<QuoteLineItem>) {
    update({ lineItems: draft.lineItems.map((l) => (l.id === id ? { ...l, ...patch } : l)) });
  }
  function updateContent(key: keyof QuoteContent, value: string) {
    update({ content: { ...draft.content, [key]: value }, contentEngine: "manual" });
  }
  function addService() {
    const item = catalog.find((c) => c.id === addId);
    if (!item) return;
    update({
      lineItems: [
        ...draft.lineItems,
        {
          id: newLineId(),
          catalogItemId: item.id,
          sourceRecommendationId: null,
          name: item.name,
          description: item.shortDescription,
          deliverables: [...item.deliverables],
          implementationPrice: item.implementationPrice,
          monthlyPrice: item.monthlyPrice,
          quantity: 1,
          addOns: [],
          estimatedWeeks: item.estimatedWeeks,
          rationale: null,
        },
      ],
    });
    setAddId("");
  }

  async function save(silent = false): Promise<Quote | null> {
    if (!editable) return quote;
    setBusy("save");
    try {
      const next = await apiFetch<Quote>(`/api/quotes/${quote.id}`, { method: "PUT", body: {
          versionId,
          patch: { ...draft, lineItems: draft.lineItems.map((l) => ({ ...l, deliverables: l.deliverables.map((d) => d.trim()).filter(Boolean) })) },
        },
      });
      setQuote(next);
      setDirty(false);
      if (!silent) setMessage({ kind: "success", text: "Udkastet er gemt." });
      return next;
    } catch (e) {
      setMessage({ kind: "error", text: (e as Error).message });
      return null;
    } finally {
      setBusy(null);
    }
  }

  async function newVersion() {
    if (dirty && !(await save(true))) return;
    setBusy("version");
    try {
      const next = await apiFetch<Quote>(`/api/quotes/${quote.id}/versions`, { method: "POST", body: {} });
      setQuote(next);
      setVersionId(next.currentVersionId);
      setMessage({ kind: "success", text: `Version ${next.versions.length} er oprettet. Tidligere versioner er låst.` });
    } catch (e) {
      setMessage({ kind: "error", text: (e as Error).message });
    } finally {
      setBusy(null);
    }
  }

  async function generate() {
    if (dirty && !(await save(true))) return;
    setBusy("generate");
    try {
      const res = await apiFetch<{ quote: Quote; engine: string; warning: string | null }>(`/api/quotes/${quote.id}/generate`, { method: "POST", body: { versionId } });
      setQuote(res.quote);
      setMessage(res.warning ? { kind: "warning", text: res.warning } : { kind: "success", text: "Tilbudsteksten er genereret med Claude." });
    } catch (e) {
      setMessage({ kind: "error", text: (e as Error).message });
    } finally {
      setBusy(null);
    }
  }

  async function exportPdf() {
    if (dirty && !(await save(true))) return;
    setBusy("pdf");
    try {
      const a = document.createElement("a");
      a.href = `/api/quotes/${quote.id}/pdf?version=${versionId}`;
      a.download = "";
      document.body.appendChild(a);
      a.click();
      a.remove();
    } finally {
      setTimeout(() => setBusy(null), 600);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <ModeBadge mode={quote.mode} />
          <Badge variant="outline">{quote.number}</Badge>
          <Label htmlFor="version" className="sr-only">Version</Label>
          <Select id="version" className="h-8 w-auto text-xs" value={versionId} onChange={(e) => setVersionId(e.target.value)} data-testid="version-select">
            {[...quote.versions].reverse().map((v) => (
              <option key={v.id} value={v.id}>
                Version {v.versionNumber} {v.id === quote.currentVersionId ? "(aktuel)" : "(låst)"}
              </option>
            ))}
          </Select>
          {draft.contentEngine && <Badge variant={draft.contentEngine === "claude" ? "info" : "secondary"}>{ENGINE_LABEL[draft.contentEngine]}</Badge>}
          <span className="text-muted-foreground">Opdateret {formatDateTime(version.updatedAt)}</span>
          {dirty && <span className="text-xs text-warning-foreground">Ikke gemte ændringer</span>}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => save()} disabled={!editable || busy !== null} data-testid="save-draft">
            {busy === "save" ? <Spinner /> : <Save />} Gem udkast
          </Button>
          <Button variant="outline" onClick={newVersion} disabled={busy !== null} data-testid="new-version">
            {busy === "version" ? <Spinner /> : <FilePlus2 />} Ny version
          </Button>
          <Button variant="accent" onClick={generate} disabled={!editable || busy !== null} data-testid="generate-content">
            {busy === "generate" ? <Spinner /> : aiAvailable && quote.mode === "live" ? <Sparkles /> : <Wand2 />} Generer tilbud
          </Button>
          <Button onClick={exportPdf} disabled={busy !== null} data-testid="export-pdf">
            {busy === "pdf" ? <Spinner /> : <Download />} Eksportér PDF
          </Button>
        </div>
      </div>

      {message && <Alert variant={message.kind === "error" ? "error" : message.kind === "warning" ? "warning" : "success"} title={message.text} />}
      {!editable && (
        <Alert variant="info" title="Låst version">
          Du ser en tidligere version, som ikke kan redigeres. Vælg den aktuelle version for at redigere — eller eksportér denne version som PDF.
        </Alert>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <fieldset disabled={!editable} className="min-w-0 space-y-5">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle>Services og priser</CardTitle>
              <CardDescription>Demopriser i DKK ekskl. moms. Ændringer vises med det samme i preview.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {draft.lineItems.map((line, index) => {
                const catalogItem = catalog.find((c) => c.id === line.catalogItemId);
                const lineTotal = totals.lines.find((l) => l.id === line.id);
                return (
                  <div key={line.id} className="space-y-3 rounded-lg border border-border p-4" data-testid="line-item">
                    <div className="flex items-start gap-2">
                      <div className="flex-1 space-y-1.5">
                        <Label htmlFor={`name-${line.id}`}>Service {index + 1}</Label>
                        <Input id={`name-${line.id}`} value={line.name} onChange={(e) => updateLine(line.id, { name: e.target.value })} />
                      </div>
                      <Button variant="ghost" size="icon" className="mt-6" aria-label={`Fjern ${line.name}`} onClick={() => update({ lineItems: draft.lineItems.filter((l) => l.id !== line.id) })}>
                        <Trash2 />
                      </Button>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor={`desc-${line.id}`}>Beskrivelse</Label>
                      <Textarea id={`desc-${line.id}`} rows={2} value={line.description} onChange={(e) => updateLine(line.id, { description: e.target.value })} />
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="space-y-1.5">
                        <Label htmlFor={`impl-${line.id}`}>Implementering (kr.)</Label>
                        <Input id={`impl-${line.id}`} type="number" min={0} step="100" value={line.implementationPrice} onChange={(e) => updateLine(line.id, { implementationPrice: Math.max(0, Number(e.target.value) || 0) })} data-testid="impl-price" />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor={`month-${line.id}`}>Pr. måned (kr.)</Label>
                        <Input id={`month-${line.id}`} type="number" min={0} step="10" value={line.monthlyPrice} onChange={(e) => updateLine(line.id, { monthlyPrice: Math.max(0, Number(e.target.value) || 0) })} data-testid="monthly-price" />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor={`qty-${line.id}`}>Antal</Label>
                        <Input id={`qty-${line.id}`} type="number" min={1} step="1" value={line.quantity} onChange={(e) => updateLine(line.id, { quantity: Math.max(1, Math.floor(Number(e.target.value) || 1)) })} />
                      </div>
                    </div>
                    {catalogItem && catalogItem.addOns.length > 0 && (
                      <div className="space-y-1.5">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tilvalg</p>
                        {catalogItem.addOns.map((addOn) => {
                          const checked = line.addOns.some((a) => a.id === addOn.id);
                          return (
                            <label key={addOn.id} className="flex cursor-pointer items-center gap-2 text-sm">
                              <Checkbox
                                checked={checked}
                                onCheckedChange={(on) => updateLine(line.id, { addOns: on ? [...line.addOns, { ...addOn }] : line.addOns.filter((a) => a.id !== addOn.id) })}
                              />
                              <span>{addOn.name}</span>
                              <span className="text-muted-foreground">
                                +{formatDkk(addOn.implementationPrice, { whole: true })} · +{formatDkk(addOn.monthlyPrice, { whole: true })}/md.
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    )}
                    <div className="space-y-1.5">
                      <Label htmlFor={`deliv-${line.id}`}>Leverancer (én pr. linje)</Label>
                      <Textarea
                        id={`deliv-${line.id}`}
                        rows={3}
                        value={line.deliverables.join("\n")}
                        onChange={(e) => updateLine(line.id, { deliverables: e.target.value.split("\n").map((s) => s.trimStart()).filter((s, i, arr) => s !== "" || i === arr.length - 1) })}
                      />
                    </div>
                    {lineTotal && (
                      <p className="text-right text-xs text-muted-foreground tabular-nums">
                        Linje: {formatDkk(lineTotal.implementation)} + {formatDkk(lineTotal.monthly)}/md.
                      </p>
                    )}
                  </div>
                );
              })}
              <div className="flex gap-2">
                <Select aria-label="Tilføj service fra kataloget" value={addId} onChange={(e) => setAddId(e.target.value)}>
                  <option value="">Tilføj service fra kataloget…</option>
                  {catalog.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} — {formatDkk(c.implementationPrice, { whole: true })} + {formatDkk(c.monthlyPrice, { whole: true })}/md.
                    </option>
                  ))}
                </Select>
                <Button variant="outline" onClick={addService} disabled={!addId}>
                  <Plus /> Tilføj
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle>Rabat, vilkår og gyldighed</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <div className="space-y-1.5">
                  <Label htmlFor="disc-kind">Rabattype</Label>
                  <Select id="disc-kind" value={draft.discount.kind} onChange={(e) => update({ discount: { ...draft.discount, kind: e.target.value as Discount["kind"] } })}>
                    <option value="none">Ingen rabat</option>
                    <option value="percent">Procent</option>
                    <option value="amount">Fast beløb (kr.)</option>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="disc-value">Værdi</Label>
                  <Input id="disc-value" type="number" min={0} disabled={draft.discount.kind === "none"} value={draft.discount.value} onChange={(e) => update({ discount: { ...draft.discount, value: Math.max(0, Number(e.target.value) || 0) } })} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="disc-scope">Gælder for</Label>
                  <Select id="disc-scope" disabled={draft.discount.kind === "none"} value={draft.discount.scope} onChange={(e) => update({ discount: { ...draft.discount, scope: e.target.value as Discount["scope"] } })}>
                    <option value="implementation">Implementering</option>
                    <option value="monthly">Månedlig pris</option>
                    {draft.discount.kind !== "amount" && <option value="all">Begge</option>}
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="disc-label">Rabattekst</Label>
                  <Input id="disc-label" disabled={draft.discount.kind === "none"} placeholder="fx Introrabat" value={draft.discount.label ?? ""} onChange={(e) => update({ discount: { ...draft.discount, label: e.target.value || null } })} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="special">Særlige vilkår</Label>
                <Textarea id="special" rows={3} value={draft.specialTerms} onChange={(e) => update({ specialTerms: e.target.value })} placeholder="fx Opstart senest 1. marts; pilotperiode på 3 måneder" />
              </div>
              <div className="w-40 space-y-1.5">
                <Label htmlFor="validity">Gyldighed (dage)</Label>
                <Input id="validity" type="number" min={1} max={365} value={draft.validityDays} onChange={(e) => update({ validityDays: Math.min(365, Math.max(1, Math.floor(Number(e.target.value) || 30))) })} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle>Prisberegning</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-3 gap-3 text-sm tabular-nums" data-testid="totals">
                {[
                  ["Implementering", totals.implementation],
                  ["Pr. måned", totals.monthly],
                  ["Første år", totals.firstYear],
                ].map(([label, t]) => {
                  const a = t as typeof totals.firstYear;
                  return (
                    <div key={label as string} className="rounded-lg bg-muted/50 p-3">
                      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label as string}</dt>
                      <dd className="mt-1 font-semibold">{formatDkk(a.exclVat)}</dd>
                      <dd className="text-xs text-muted-foreground">Moms {formatDkk(a.vat)}</dd>
                      <dd className="text-xs text-muted-foreground">Inkl. moms {formatDkk(a.inclVat)}</dd>
                    </div>
                  );
                })}
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle>Tilbudstekst</CardTitle>
              <CardDescription>
                {aiAvailable && quote.mode === "live"
                  ? "“Generer tilbud” skriver en personlig tekst med Claude ud fra research og valgte services."
                  : "“Generer tilbud” bygger teksten ud fra skabelon, research og valgte services (AI ikke aktiv i denne tilstand)."}{" "}
                Alle felter kan redigeres.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {CONTENT_FIELDS.map(([key, label, rows]) => (
                <div key={key} className="space-y-1.5">
                  <Label htmlFor={`content-${key}`}>{label}</Label>
                  {rows === 1 ? (
                    <Input id={`content-${key}`} value={draft.content[key]} onChange={(e) => updateContent(key, e.target.value)} />
                  ) : (
                    <Textarea id={`content-${key}`} rows={rows} value={draft.content[key]} onChange={(e) => updateContent(key, e.target.value)} />
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
          {quote.sourceReportId && (
            <p className="text-xs text-muted-foreground">
              Oprettet fra <Link className="text-accent hover:underline" href={`/research/reports/${quote.sourceReportId}`}>researchrapport</Link> via kontrakten research.quote-handoff@1.
            </p>
          )}
        </fieldset>

        <div className="min-w-0">
          <div className="sticky top-6 space-y-2">
            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              {!editable && <Lock className="h-3 w-3" />} Live preview
            </p>
            <div className="max-h-[calc(100vh-7rem)] overflow-y-auto rounded-xl">
              <QuotePreview quote={quote} version={{ ...draft, vatRate: version.vatRate, versionNumber: version.versionNumber, updatedAt: version.updatedAt }} agencyName={agencyName} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
