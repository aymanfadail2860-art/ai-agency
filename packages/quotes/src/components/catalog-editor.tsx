"use client";
import * as React from "react";
import type { ServiceCatalogItem } from "@agency/core";
import { COMPLEXITY_LABELS } from "@agency/core";
import { Alert, apiFetch, Badge, Button, Card, CardContent, Input, Label, Spinner, Textarea } from "@agency/ui";
import { formatDkk } from "@agency/shared";
import { FlaskConical, RotateCcw, Save } from "lucide-react";

const CATEGORY_LABELS: Record<ServiceCatalogItem["category"], string> = {
  customer_contact: "Kundekontakt",
  sales_marketing: "Salg og marketing",
  automation: "Automatisering",
  data_software: "Data og software",
};

export function CatalogEditor({ initialItems }: { initialItems: ServiceCatalogItem[] }) {
  const [items, setItems] = React.useState(initialItems);
  return (
    <div className="space-y-4">
      <Alert variant="warning" title="Fiktive demopriser">
        Alle priser i servicekataloget er fiktive og redigerbare. Ændringer gælder for nye tilbud — eksisterende tilbud bevarer deres priser.
      </Alert>
      {items.map((item) => (
        <CatalogRow key={item.id} item={item} onSaved={(next) => setItems((list) => list.map((i) => (i.id === next.id ? next : i)))} />
      ))}
    </div>
  );
}

function CatalogRow({ item, onSaved }: { item: ServiceCatalogItem; onSaved: (item: ServiceCatalogItem) => void }) {
  const [impl, setImpl] = React.useState(item.implementationPrice);
  const [monthly, setMonthly] = React.useState(item.monthlyPrice);
  const [description, setDescription] = React.useState(item.description);
  const [busy, setBusy] = React.useState(false);
  const [status, setStatus] = React.useState<string | null>(null);
  const dirty = impl !== item.implementationPrice || monthly !== item.monthlyPrice || description !== item.description;

  async function save() {
    setBusy(true);
    setStatus(null);
    try {
      const next = await apiFetch<ServiceCatalogItem>(`/api/catalog/${item.id}`, { method: "PUT", body: { implementationPrice: impl, monthlyPrice: monthly, description } });
      onSaved(next);
      setStatus("Gemt");
    } catch (e) {
      setStatus((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function reset() {
    setBusy(true);
    try {
      const next = await apiFetch<ServiceCatalogItem>(`/api/catalog/${item.id}`, { method: "DELETE" });
      setImpl(next.implementationPrice);
      setMonthly(next.monthlyPrice);
      setDescription(next.description);
      onSaved(next);
      setStatus("Nulstillet til standard");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardContent className="grid gap-5 p-5 lg:grid-cols-[1.2fr_1fr]">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold">{item.name}</h3>
            <Badge variant="secondary">{CATEGORY_LABELS[item.category]}</Badge>
            <Badge variant="outline">Kompleksitet: {COMPLEXITY_LABELS[item.complexity]}</Badge>
            <Badge variant="demo">
              <FlaskConical /> Demopris
            </Badge>
          </div>
          <Textarea aria-label={`Beskrivelse af ${item.name}`} rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
          <div className="grid gap-3 text-sm md:grid-cols-2">
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Leverancer</p>
              <ul className="list-disc space-y-0.5 pl-4 text-muted-foreground">
                {item.deliverables.map((d) => (
                  <li key={d}>{d}</li>
                ))}
              </ul>
            </div>
            <div className="space-y-2">
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Estimeret implementeringstid</p>
                <p>{item.estimatedWeeks.min}–{item.estimatedWeeks.max} uger</p>
              </div>
              {item.addOns.length > 0 && (
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Mulige tilvalg</p>
                  <ul className="space-y-0.5 text-muted-foreground">
                    {item.addOns.map((a) => (
                      <li key={a.id}>
                        {a.name}: +{formatDkk(a.implementationPrice, { whole: true })} / +{formatDkk(a.monthlyPrice, { whole: true })} pr. md.
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor={`impl-${item.id}`}>Implementering (kr.)</Label>
              <Input id={`impl-${item.id}`} type="number" min={0} step={500} value={impl} onChange={(e) => setImpl(Math.max(0, Number(e.target.value) || 0))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`month-${item.id}`}>Pr. måned (kr.)</Label>
              <Input id={`month-${item.id}`} type="number" min={0} step={50} value={monthly} onChange={(e) => setMonthly(Math.max(0, Number(e.target.value) || 0))} />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={save} disabled={!dirty || busy}>
              {busy ? <Spinner /> : <Save />} Gem
            </Button>
            <Button size="sm" variant="ghost" onClick={reset} disabled={busy}>
              <RotateCcw /> Nulstil
            </Button>
            {status && <span className="text-xs text-muted-foreground">{status}</span>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
