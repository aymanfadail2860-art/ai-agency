"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Alert, apiFetch, Badge, Button, Card, CardContent, CardHeader, CardTitle, Input, Label, Select, Spinner } from "@agency/ui";
import { CalendarDays, GripVertical, Plus, Search, Trophy, XCircle } from "lucide-react";
import { STAGES, stageLabel, type Opportunity, type Stage } from "../contracts";
import { DemoBadge, Money, formatDate, formatKr } from "./shared";

export type PipelineItem = Opportunity & { accountName: string; nextActivity: { id: string; subject: string; dueAt: string } | null };

interface Dialog {
  opp: PipelineItem;
  stage: "won" | "lost";
}

export function PipelineBoard({
  opportunities,
  accounts,
  catalog,
  initialStatus = "open",
}: {
  opportunities: PipelineItem[];
  accounts: Array<{ id: string; name: string }>;
  catalog: Array<{ id: string; name: string; implementationPrice: number; monthlyPrice: number }>;
  initialStatus?: string;
}) {
  const router = useRouter();
  const [items, setItems] = React.useState(opportunities);
  const [query, setQuery] = React.useState("");
  const [owner, setOwner] = React.useState("");
  const [status, setStatus] = React.useState(initialStatus);
  const [dragId, setDragId] = React.useState<string | null>(null);
  const [overStage, setOverStage] = React.useState<Stage | null>(null);
  const [dialog, setDialog] = React.useState<Dialog | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  React.useEffect(() => setItems(opportunities), [opportunities]);

  const owners = Array.from(new Set(items.map((o) => o.owner))).sort();
  const q = query.trim().toLowerCase();
  const visible = items.filter((o) => (!q || `${o.title} ${o.accountName}`.toLowerCase().includes(q)) && (!owner || o.owner === owner) && (status === "all" || o.status === status));
  const columns = status === "open" ? STAGES.filter((s) => s.key !== "won" && s.key !== "lost") : STAGES;

  async function move(opp: PipelineItem, stage: Stage, extra: Record<string, unknown> = {}) {
    if (opp.stage === stage) return;
    if ((stage === "won" || stage === "lost") && !extra.confirmed) {
      setDialog({ opp, stage });
      return;
    }
    setError(null);
    const previous = items;
    setItems(items.map((o) => (o.id === opp.id ? { ...o, stage, status: stage === "won" ? "won" : stage === "lost" ? "lost" : "open" } : o)));
    try {
      if (stage === "won") await apiFetch(`/api/crm/opportunities/${opp.id}/win`, { body: { transferToProduction: extra.transferToProduction ?? true } });
      else await apiFetch(`/api/crm/opportunities/${opp.id}/stage`, { body: { stage, lostReason: extra.lostReason ?? "" } });
      router.refresh();
    } catch (e) {
      setItems(previous);
      setError((e as Error).message);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <div className="grid flex-1 gap-2 sm:grid-cols-[2fr_1fr_1fr] lg:max-w-3xl [&>*]:min-w-0">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input className="pl-8" placeholder="Søg titel eller kunde" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Søg" data-testid="pipeline-search" />
          </div>
          <Select aria-label="Ansvarlig" value={owner} onChange={(e) => setOwner(e.target.value)}>
            <option value="">Alle ansvarlige</option>
            {owners.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </Select>
          <Select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)} data-testid="pipeline-status">
            <option value="open">Åbne</option>
            <option value="all">Alle (inkl. vundne/tabte)</option>
            <option value="won">Vundne</option>
            <option value="lost">Tabte</option>
          </Select>
        </div>
        <Button onClick={() => setCreating(!creating)} disabled={accounts.length === 0} data-testid="new-opportunity">
          <Plus /> Ny salgsmulighed
        </Button>
      </div>
      {creating && <OpportunityForm accounts={accounts} catalog={catalog} onCreated={() => { setCreating(false); router.refresh(); }} />}
      {error && <Alert variant="error">{error}</Alert>}

      <div className="-mx-1 overflow-x-auto pb-2" data-testid="kanban">
        <div className="flex min-w-max gap-3 px-1">
          {columns.map((col) => {
            const own = visible.filter((o) => o.stage === col.key);
            return (
              <section
                key={col.key}
                className={`flex w-72 shrink-0 flex-col rounded-xl border bg-muted/40 transition-colors ${overStage === col.key ? "border-accent bg-accent/5" : "border-border"}`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setOverStage(col.key);
                }}
                onDragLeave={() => setOverStage(null)}
                onDrop={(e) => {
                  e.preventDefault();
                  setOverStage(null);
                  const id = e.dataTransfer.getData("text/plain") || dragId;
                  const opp = items.find((o) => o.id === id);
                  if (opp) void move(opp, col.key);
                }}
                aria-label={`Stadie: ${col.label}`}
                data-testid={`stage-${col.key}`}
              >
                <header className="space-y-0.5 border-b border-border/70 px-3 py-2.5">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold">{col.label}</h3>
                    <span className="rounded-full bg-card px-2 text-xs tabular-nums text-muted-foreground">{own.length}</span>
                  </div>
                  <p className="text-[11px] tabular-nums text-muted-foreground">
                    {formatKr(own.reduce((s, o) => s + o.implementationValue, 0))} + {formatKr(own.reduce((s, o) => s + o.monthlyValue, 0))}/md.
                  </p>
                </header>
                <div className="flex min-h-24 flex-1 flex-col gap-2 p-2">
                  {own.map((o) => (
                    <article
                      key={o.id}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData("text/plain", o.id);
                        e.dataTransfer.effectAllowed = "move";
                        setDragId(o.id);
                      }}
                      onDragEnd={() => setDragId(null)}
                      className={`group space-y-2 rounded-lg border border-border bg-card p-3 text-sm shadow-sm transition-all hover:border-accent/50 hover:shadow-md ${dragId === o.id ? "opacity-50" : ""}`}
                      data-testid="opportunity-card"
                      data-opportunity-stage={o.stage}
                    >
                      <div className="flex items-start gap-1.5">
                        <GripVertical className="mt-0.5 h-4 w-4 shrink-0 cursor-grab text-muted-foreground" aria-hidden />
                        <div className="min-w-0 flex-1">
                          <Link href={`/crm/companies/${o.accountId}?tab=opportunities`} className="block truncate font-medium hover:underline">
                            {o.title}
                          </Link>
                          <p className="truncate text-xs text-muted-foreground">{o.accountName}</p>
                        </div>
                        {o.isDemo && <DemoBadge />}
                      </div>
                      <Money implementation={o.implementationValue} monthly={o.monthlyValue} className="block text-xs" />
                      <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                        <Badge variant="outline">{o.probability}%</Badge>
                        {o.expectedCloseDate && (
                          <span className="inline-flex items-center gap-1">
                            <CalendarDays className="h-3 w-3" /> {formatDate(o.expectedCloseDate)}
                          </span>
                        )}
                        <span>· {o.owner}</span>
                        {o.quoteId && <Badge variant="info">Tilbud</Badge>}
                        {o.projectId && <Badge variant="success">Projekt</Badge>}
                      </div>
                      {o.nextActivity && <p className="truncate text-[11px]">Næste: {o.nextActivity.subject} ({formatDate(o.nextActivity.dueAt)})</p>}
                      {o.status === "lost" && o.lostReason && <p className="text-[11px] text-muted-foreground">Årsag: {o.lostReason}</p>}
                      <Select aria-label={`Flyt ${o.title}`} className="h-7 text-xs" value={o.stage} onChange={(e) => void move(o, e.target.value as Stage)} data-testid="move-stage">
                        {STAGES.map((s) => (
                          <option key={s.key} value={s.key}>
                            Flyt til: {s.label}
                          </option>
                        ))}
                      </Select>
                    </article>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </div>
      {dialog && <CloseDialog dialog={dialog} onCancel={() => setDialog(null)} onConfirm={(extra) => { const d = dialog; setDialog(null); void move(d.opp, d.stage, { ...extra, confirmed: true }); }} />}
    </div>
  );
}

export function CloseDialog({ dialog, onCancel, onConfirm }: { dialog: { opp: { title: string; quoteId: string | null }; stage: "won" | "lost" }; onCancel: () => void; onConfirm: (extra: Record<string, unknown>) => void }) {
  const [reason, setReason] = React.useState("");
  const [transfer, setTransfer] = React.useState(true);
  const won = dialog.stage === "won";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-labelledby="close-title" data-testid="close-dialog">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle id="close-title" className="flex items-center gap-2">
            {won ? <Trophy className="h-4 w-4 text-success" /> : <XCircle className="h-4 w-4 text-destructive" />} {won ? "Markér som vundet" : "Markér som tabt"}: {dialog.opp.title}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {won ? (
            dialog.opp.quoteId ? (
              <label className="flex items-start gap-2">
                <input type="checkbox" className="mt-0.5" checked={transfer} onChange={(e) => setTransfer(e.target.checked)} data-testid="transfer-production" />
                <span>Kunden har accepteret tilbuddet — acceptér det og overfør aftalen til Produktion (opretter ikke dubletter).</span>
              </label>
            ) : (
              <p className="text-muted-foreground">Ingen tilbud er tilknyttet. Muligheden markeres vundet, og kunden bliver aktiv kunde. Opret projektet i Produktion manuelt.</p>
            )
          ) : (
            <div className="space-y-1">
              <Label htmlFor="lost-reason">Hvorfor blev muligheden tabt?</Label>
              <Input id="lost-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} data-testid="lost-reason" />
            </div>
          )}
          <div className="flex gap-2">
            <Button onClick={() => onConfirm(won ? { transferToProduction: transfer } : { lostReason: reason })} disabled={!won && reason.trim().length < 2} data-testid="confirm-close">
              Bekræft
            </Button>
            <Button variant="outline" onClick={onCancel}>
              Annullér
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export function OpportunityForm({
  accounts,
  catalog,
  defaultAccountId,
  onCreated,
}: {
  accounts: Array<{ id: string; name: string }>;
  catalog: Array<{ id: string; name: string; implementationPrice: number; monthlyPrice: number }>;
  defaultAccountId?: string;
  onCreated: () => void;
}) {
  const [accountId, setAccountId] = React.useState(defaultAccountId ?? accounts[0]?.id ?? "");
  const [title, setTitle] = React.useState("");
  const [services, setServices] = React.useState<string[]>([]);
  const [impl, setImpl] = React.useState("0");
  const [monthly, setMonthly] = React.useState("0");
  const [close, setClose] = React.useState(new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10));
  const [stage, setStage] = React.useState<Stage>("qualified");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  function toggle(id: string) {
    const next = services.includes(id) ? services.filter((s) => s !== id) : [...services, id];
    setServices(next);
    const items = catalog.filter((c) => next.includes(c.id));
    setImpl(String(items.reduce((s, c) => s + c.implementationPrice, 0)));
    setMonthly(String(items.reduce((s, c) => s + c.monthlyPrice, 0)));
    if (!title || catalog.some((c) => title.includes(c.name))) setTitle(items.map((c) => c.name).join(" + "));
  }

  return (
    <Card data-testid="opportunity-form">
      <CardHeader>
        <CardTitle>Ny salgsmulighed</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError(null);
            try {
              await apiFetch("/api/crm/opportunities", { body: { accountId, title, services, implementationValue: Number(impl) || 0, monthlyValue: Number(monthly) || 0, expectedCloseDate: close || null, stage } });
              onCreated();
            } catch (err) {
              setError((err as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {!defaultAccountId && (
              <div className="space-y-1">
                <Label htmlFor="opp-account">Kunde</Label>
                <Select id="opp-account" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </Select>
              </div>
            )}
            <div className="space-y-1">
              <Label htmlFor="opp-title">Titel</Label>
              <Input id="opp-title" required maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} data-testid="opportunity-title" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="opp-stage">Stadie</Label>
              <Select id="opp-stage" value={stage} onChange={(e) => setStage(e.target.value as Stage)}>
                {STAGES.filter((s) => s.key !== "won" && s.key !== "lost").map((s) => (
                  <option key={s.key} value={s.key}>
                    {stageLabel(s.key)}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="opp-impl">Implementeringspris (engangs, kr.)</Label>
              <Input id="opp-impl" type="number" min={0} value={impl} onChange={(e) => setImpl(e.target.value)} data-testid="opportunity-impl" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="opp-monthly">Månedlig servicepris (kr./md.)</Label>
              <Input id="opp-monthly" type="number" min={0} value={monthly} onChange={(e) => setMonthly(e.target.value)} data-testid="opportunity-monthly" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="opp-close">Forventet lukning</Label>
              <Input id="opp-close" type="date" value={close} onChange={(e) => setClose(e.target.value)} />
            </div>
          </div>
          <fieldset className="space-y-1.5">
            <legend className="text-sm font-medium">Servicekategori (servicekatalog)</legend>
            <div className="flex flex-wrap gap-2">
              {catalog.map((c) => (
                <label key={c.id} className={`flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 text-xs ${services.includes(c.id) ? "border-accent bg-accent/10" : "border-border"}`}>
                  <input type="checkbox" className="sr-only" checked={services.includes(c.id)} onChange={() => toggle(c.id)} />
                  {c.name}
                </label>
              ))}
            </div>
          </fieldset>
          {error && <Alert variant="error">{error}</Alert>}
          <Button type="submit" disabled={busy || !accountId} data-testid="opportunity-submit">
            {busy && <Spinner />} Opret salgsmulighed
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
