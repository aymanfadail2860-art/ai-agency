"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Alert, apiFetch, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Label, Select, Spinner, Textarea } from "@agency/ui";
import { FileCheck2, Plus, Trash2 } from "lucide-react";
import { AGENT_ROLE_LABELS, PRIORITY_LABELS, type AgentRole, type Priority, type ProductionProject, type ServiceBase } from "../contracts";

export interface ProjectFormProps {
  bases: Array<ServiceBase & { defaultPrice: { implementation: number; monthly: number } | null }>;
  customers: Array<{ brandId: string; name: string }>;
  agents: Array<{ id: string; key: string; name: string; role: string; color: string; enabled: boolean }>;
  acceptedQuotes: Array<{ quoteId: string; number: string; customer: string; implementation: number; monthly: number; projectId: string | null }>;
  draftQuotes: Array<{ quoteId: string; number: string; customer: string }>;
  initialBaseKey?: string;
}

const today = () => new Date().toISOString().slice(0, 10);
const plusDays = (d: string, n: number) => {
  const x = new Date(`${d}T12:00:00Z`);
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
};

export function ProjectForm({ bases, customers, agents, acceptedQuotes, draftQuotes, initialBaseKey }: ProjectFormProps) {
  const router = useRouter();
  const first = bases.find((b) => b.key === initialBaseKey) ?? bases[0]!;
  const [baseKey, setBaseKey] = React.useState(first.key);
  const base = bases.find((b) => b.key === baseKey) ?? first;
  const [customerMode, setCustomerMode] = React.useState<"existing" | "new">(customers.length ? "existing" : "new");
  const [brandId, setBrandId] = React.useState(customers[0]?.brandId ?? "");
  const [customerName, setCustomerName] = React.useState("");
  const [name, setName] = React.useState(first.name);
  const [description, setDescription] = React.useState("");
  const [deliverables, setDeliverables] = React.useState(first.features.map((f) => ({ name: f, description: "" })));
  const [impl, setImpl] = React.useState(String(first.defaultPrice?.implementation ?? 0));
  const [monthly, setMonthly] = React.useState(String(first.defaultPrice?.monthly ?? 0));
  const [startDate, setStartDate] = React.useState(today());
  const [targetDate, setTargetDate] = React.useState(plusDays(today(), 35));
  const [priority, setPriority] = React.useState<Priority>("normal");
  const [team, setTeam] = React.useState<Record<string, AgentRole | "">>(() => Object.fromEntries(first.defaultAgents.map((a) => [`agt_${a.key}`, a.role])));
  const [notes, setNotes] = React.useState("");
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  function chooseBase(key: string) {
    const b = bases.find((x) => x.key === key)!;
    setBaseKey(key);
    if (!name || bases.some((x) => x.name === name)) setName(b.name);
    setDeliverables(b.features.map((f) => ({ name: f, description: "" })));
    if (b.defaultPrice) {
      setImpl(String(b.defaultPrice.implementation));
      setMonthly(String(b.defaultPrice.monthly));
    }
    setTeam(Object.fromEntries(b.defaultAgents.map((a) => [`agt_${a.key}`, a.role])));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy("create");
    setError(null);
    try {
      const customer = customerMode === "existing" ? { brandId, name: customers.find((c) => c.brandId === brandId)?.name ?? "" } : { brandId: null, name: customerName };
      const project = await apiFetch<ProductionProject>("/api/production/projects", {
        body: {
          customer,
          name,
          serviceBaseKey: baseKey,
          description,
          deliverables: deliverables.filter((d) => d.name.trim()),
          implementationPrice: Number(impl) || 0,
          monthlyPrice: Number(monthly) || 0,
          startDate,
          targetDate,
          priority,
          agents: Object.entries(team).filter(([, role]) => role).map(([agentId, role]) => ({ agentId, role })),
          notes,
        },
      });
      router.push(`/production/projects/${project.id}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(null);
    }
  }

  async function fromQuote(quoteId: string) {
    setBusy(quoteId);
    setError(null);
    try {
      const res = await apiFetch<{ projectId: string }>(`/api/quotes/${quoteId}/accept`, { body: {} });
      router.push(`/production/projects/${res.projectId}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(null);
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_360px] [&>*]:min-w-0">
      <form onSubmit={submit} className="space-y-6" data-testid="project-form">
        <Card>
          <CardHeader>
            <CardTitle>Kunde og service</CardTitle>
            <CardDescription>Vælg en eksisterende kunde, så kundedata ikke dubleres. Servicebasen fra Service Factory giver opgaver, testplan og arkitektur.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="customer-mode">Kunde</Label>
              <Select id="customer-mode" value={customerMode} onChange={(e) => setCustomerMode(e.target.value as "existing" | "new")}>
                {customers.length > 0 && <option value="existing">Eksisterende kunde (brand)</option>}
                <option value="new">Ny kunde (kun navn)</option>
              </Select>
            </div>
            {customerMode === "existing" ? (
              <div className="space-y-1.5">
                <Label htmlFor="brand">Kundenavn</Label>
                <Select id="brand" value={brandId} onChange={(e) => setBrandId(e.target.value)} data-testid="customer-select">
                  {customers.map((c) => (
                    <option key={c.brandId} value={c.brandId}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label htmlFor="customer-name">Kundenavn</Label>
                <Input id="customer-name" required maxLength={200} value={customerName} onChange={(e) => setCustomerName(e.target.value)} data-testid="customer-name" />
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="base">Servicekategori (Service Factory)</Label>
              <Select id="base" value={baseKey} onChange={(e) => chooseBase(e.target.value)} data-testid="service-base">
                {bases.map((b) => (
                  <option key={b.key} value={b.key}>
                    {b.name} · v{b.version}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="name">Projektnavn</Label>
              <Input id="name" required maxLength={200} value={name} onChange={(e) => setName(e.target.value)} data-testid="project-name" />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label htmlFor="description">Projektbeskrivelse</Label>
              <Textarea id="description" rows={3} maxLength={4000} value={description} onChange={(e) => setDescription(e.target.value)} placeholder={base.description} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Aftalte leverancer</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {deliverables.map((d, i) => (
              <div key={i} className="flex gap-2">
                <Input aria-label={`Leverance ${i + 1}`} value={d.name} maxLength={200} onChange={(e) => setDeliverables(deliverables.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                <Button type="button" variant="ghost" size="icon" aria-label="Fjern leverance" onClick={() => setDeliverables(deliverables.filter((_, j) => j !== i))}>
                  <Trash2 />
                </Button>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={() => setDeliverables([...deliverables, { name: "", description: "" }])} disabled={deliverables.length >= 40}>
              <Plus /> Tilføj leverance
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Økonomi, tidsplan og prioritet</CardTitle>
            <CardDescription>Priser er ekskl. moms. Standardpriser kommer fra servicekataloget (demopriser).</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="impl">Implementeringspris (kr.)</Label>
              <Input id="impl" type="number" min={0} step={100} value={impl} onChange={(e) => setImpl(e.target.value)} data-testid="impl-price" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="monthly">Månedlig servicepris (kr.)</Label>
              <Input id="monthly" type="number" min={0} step={10} value={monthly} onChange={(e) => setMonthly(e.target.value)} data-testid="monthly-price" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="priority">Prioritet</Label>
              <Select id="priority" value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
                {(Object.keys(PRIORITY_LABELS) as Priority[]).map((p) => (
                  <option key={p} value={p}>
                    {PRIORITY_LABELS[p]}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="start">Startdato</Label>
              <Input id="start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="target">Forventet levering</Label>
              <Input id="target" type="date" value={targetDate} min={startDate} onChange={(e) => setTargetDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Projektstatus</Label>
              <p className="flex h-9 items-center text-sm text-muted-foreground">Aktiv · fase "Oprettet"</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Agenter fra AOS</CardTitle>
            <CardDescription>Agenterne tilknyttes som planlagte ressourcer. Reelle agentopgaver oprettes senere gennem AOS' Job Center.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-2 [&>*]:min-w-0" data-testid="agent-picker">
            {agents.map((a) => (
              <div key={a.id} className={`flex items-center gap-3 rounded-lg border p-2.5 ${team[a.id] ? "border-accent/50 bg-accent/5" : "border-border"}`}>
                <input
                  type="checkbox"
                  id={`agent-${a.key}`}
                  checked={Boolean(team[a.id])}
                  disabled={!a.enabled}
                  onChange={(e) => setTeam({ ...team, [a.id]: e.target.checked ? "developer" : "" })}
                />
                <label htmlFor={`agent-${a.key}`} className="flex min-w-0 flex-1 items-center gap-2 text-sm">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[11px] font-bold text-white" style={{ background: a.color }} aria-hidden>
                    {a.name.slice(0, 1)}
                  </span>
                  <span className="truncate">
                    <span className="font-medium">{a.name}</span> <span className="text-muted-foreground">· {a.role}</span>
                  </span>
                </label>
                {team[a.id] && (
                  <Select aria-label={`Rolle for ${a.name}`} className="h-8 w-36 text-xs" value={team[a.id]} onChange={(e) => setTeam({ ...team, [a.id]: e.target.value as AgentRole })}>
                    {(Object.keys(AGENT_ROLE_LABELS) as AgentRole[]).map((r) => (
                      <option key={r} value={r}>
                        {AGENT_ROLE_LABELS[r]}
                      </option>
                    ))}
                  </Select>
                )}
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Interne noter</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea aria-label="Interne noter" rows={3} maxLength={8000} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </CardContent>
        </Card>

        {error && <Alert variant="error" title="Projektet blev ikke oprettet">{error}</Alert>}
        <div className="flex gap-2">
          <Button type="submit" size="lg" disabled={busy !== null} data-testid="create-project">
            {busy === "create" ? <Spinner /> : <Plus />} Opret projekt
          </Button>
          <Link href="/production">
            <Button type="button" variant="outline" size="lg">
              Annullér
            </Button>
          </Link>
        </div>
      </form>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileCheck2 className="h-4 w-4 text-accent" /> Fra accepteret tilbud
            </CardTitle>
            <CardDescription>Overfør aftalen direkte: kunde, leverancer og priser hentes fra tilbuddet via kontrakten quotes.production-intake.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {acceptedQuotes.length === 0 && draftQuotes.length === 0 && <p className="text-muted-foreground">Ingen tilbud i denne tilstand.</p>}
            {acceptedQuotes.map((q) => (
              <div key={q.quoteId} className="flex items-center justify-between gap-2 rounded-lg border border-border p-2.5">
                <div className="min-w-0">
                  <p className="truncate font-medium">{q.customer}</p>
                  <p className="text-xs text-muted-foreground">
                    {q.number} · accepteret
                  </p>
                </div>
                {q.projectId ? (
                  <Link href={`/production/projects/${q.projectId}`} className="shrink-0 text-xs text-accent hover:underline">
                    Åbn projekt
                  </Link>
                ) : (
                  <Button size="sm" variant="outline" onClick={() => fromQuote(q.quoteId)} disabled={busy !== null}>
                    {busy === q.quoteId && <Spinner />} Opret
                  </Button>
                )}
              </div>
            ))}
            {draftQuotes.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {draftQuotes.length} tilbud er endnu ikke accepteret. Registrér kundens accept på tilbudssiden ("Kunden har accepteret"), så oprettes projektet automatisk.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
