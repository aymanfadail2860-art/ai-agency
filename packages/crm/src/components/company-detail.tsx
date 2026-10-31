"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Alert, apiFetch, Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState, Input, KeyValue, Label, Select, Spinner, Tabs, Textarea } from "@agency/ui";
import { TASK_TYPES } from "@agency/orchestrator";
import { Bot, Building2, ExternalLink, FileText, FolderKanban, Globe, Mail, Phone, Plus, Receipt, Search, Star, Trophy, UserPlus, XCircle } from "lucide-react";
import { ACCOUNT_STATUS_LABELS, COMPANY_SIZE_LABELS, LEAD_SOURCE_LABELS, STAGES, stageLabel, type AccountStatus, type CompanySize, type LeadSource, type Opportunity, type Stage } from "../contracts";
import type { Account360 } from "../views";
import { ActivityBrowser } from "./activities";
import { CloseDialog, OpportunityForm } from "./pipeline";
import { AccountStatusBadge, ActivityForm, DemoBadge, Money, StageBadge, formatDate, formatDateTime, formatKr } from "./shared";

const TABS = ["overview", "research", "opportunities", "quotes", "projects", "activities", "finance", "documents"] as const;
type Tab = (typeof TABS)[number];
const TAB_LABELS: Record<Tab, string> = {
  overview: "Overblik",
  research: "Research",
  opportunities: "Salgsmuligheder",
  quotes: "Tilbud",
  projects: "Projekter",
  activities: "Aktiviteter",
  finance: "Økonomi",
  documents: "Dokumenter",
};
const QUOTE_STATUS: Record<string, { label: string; variant: "outline" | "info" | "success" | "muted" }> = {
  draft: { label: "Udkast", variant: "outline" },
  sent: { label: "Sendt", variant: "info" },
  accepted: { label: "Accepteret", variant: "success" },
  rejected: { label: "Afvist", variant: "muted" },
};
const CRM_TASKS = TASK_TYPES.filter((t) => t.module === "crm");

type Catalog = Array<{ id: string; name: string; implementationPrice: number; monthlyPrice: number }>;

export function CompanyDetail({ data, catalog, initialTab = "overview", existing = false }: { data: Account360; catalog: Catalog; initialTab?: string; existing?: boolean }) {
  const router = useRouter();
  const [tab, setTab] = React.useState<Tab>((TABS as readonly string[]).includes(initialTab) ? (initialTab as Tab) : "overview");
  const { account } = data;
  const refresh = () => router.refresh();
  const openOpps = data.opportunities.filter((o) => o.status === "open");
  const planned = data.activities.filter((a) => a.status === "planned").sort((a, b) => a.dueAt.localeCompare(b.dueAt));
  const serviceName = (id: string) => catalog.find((c) => c.id === id)?.name ?? id;

  function select(next: string) {
    setTab(next as Tab);
    router.replace(`/crm/companies/${account.id}${next === "overview" ? "" : `?tab=${next}`}`, { scroll: false });
  }

  return (
    <div className="space-y-6" data-testid="company-360">
      {existing && <Alert variant="info">Virksomheden findes allerede i CRM — du ser den eksisterende profil (ingen dublet oprettet).</Alert>}
      <AccountHeader data={data} />
      <div className="overflow-x-auto pb-1">
        <Tabs
          items={TABS.map((t) => ({
            value: t,
            label: <span data-testid={`tab-${t}`}>{TAB_LABELS[t]}</span>,
            count: t === "opportunities" ? data.opportunities.length : t === "quotes" ? data.quotes.length : t === "projects" ? data.projects.length : t === "activities" ? data.activities.length : t === "documents" ? data.documents.length : t === "research" ? data.research.brandReports.length + data.research.linkedReports.length : undefined,
          }))}
          value={tab}
          onValueChange={select}
        />
      </div>

      {tab === "overview" && (
        <div className="grid gap-6 lg:grid-cols-3 [&>*]:min-w-0">
          <div className="space-y-6 lg:col-span-2">
            <AccountInfo data={data} onSaved={refresh} />
            <Card>
              <CardHeader className="flex-row items-center justify-between space-y-0">
                <CardTitle>Åbne salgsmuligheder</CardTitle>
                <Button size="sm" variant="ghost" onClick={() => select("opportunities")}>
                  Se alle
                </Button>
              </CardHeader>
              <CardContent>
                {openOpps.length ? (
                  <ul className="divide-y divide-border text-sm">
                    {openOpps.map((o) => (
                      <li key={o.id} className="flex flex-col gap-1 py-2 sm:flex-row sm:items-center sm:justify-between">
                        <span className="font-medium">{o.title}</span>
                        <span className="flex flex-wrap items-center gap-2">
                          <StageBadge stage={o.stage} />
                          <Money implementation={o.implementationValue} monthly={o.monthlyValue} className="text-xs" />
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">Ingen åbne salgsmuligheder.</p>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex-row items-center justify-between space-y-0">
                <CardTitle>Kommende aktiviteter</CardTitle>
                <Button size="sm" variant="ghost" onClick={() => select("activities")}>
                  Se alle
                </Button>
              </CardHeader>
              <CardContent>
                {planned.length ? (
                  <ul className="space-y-1 text-sm">
                    {planned.slice(0, 5).map((a) => (
                      <li key={a.id} className="flex justify-between gap-2">
                        <span className="truncate">{a.subject}</span>
                        <span className={`shrink-0 text-xs ${new Date(a.dueAt).getTime() < Date.now() ? "text-destructive" : "text-muted-foreground"}`}>{formatDateTime(a.dueAt)}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">Ingen planlagte aktiviteter — planlæg næste opfølgning.</p>
                )}
              </CardContent>
            </Card>
          </div>
          <div className="space-y-6">
            <Contacts data={data} onChange={refresh} />
            <EchoPanel data={data} onChange={refresh} />
          </div>
        </div>
      )}

      {tab === "research" && <ResearchTab data={data} onChange={refresh} />}
      {tab === "opportunities" && <OpportunitiesTab data={data} catalog={catalog} serviceName={serviceName} onChange={refresh} />}
      {tab === "quotes" && <QuotesTab data={data} onChange={refresh} />}
      {tab === "projects" && <ProjectsTab data={data} />}
      {tab === "activities" && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Registrér eller planlæg aktivitet</CardTitle>
            </CardHeader>
            <CardContent>
              <ActivityForm accounts={[{ id: account.id, name: account.name }]} contacts={data.contacts} opportunities={data.opportunities} defaultAccountId={account.id} onCreated={refresh} />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <ActivityBrowser activities={data.activities} showAccount={false} />
            </CardContent>
          </Card>
        </div>
      )}
      {tab === "finance" && <FinanceTab data={data} />}
      {tab === "documents" && <DocumentsTab data={data} onChange={refresh} />}
    </div>
  );
}

// ─── Header + stamdata ──────────────────────────────────────────────────────

function AccountHeader({ data }: { data: Account360 }) {
  const { account } = data;
  return (
    <Card>
      <CardContent className="flex flex-col gap-4 pt-6 md:flex-row md:items-start md:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">
            <Building2 className="h-6 w-6" />
          </span>
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-semibold" data-testid="account-name">
                {account.name}
              </h2>
              <AccountStatusBadge status={account.status} />
              {account.isDemo && <DemoBadge />}
            </div>
            <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
              {account.website && (
                <a href={account.website} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 hover:text-foreground">
                  <Globe className="h-3.5 w-3.5" /> {account.website.replace(/^https?:\/\//, "").replace(/\/$/, "")}
                </a>
              )}
              {account.cvr && <span>CVR {account.cvr}</span>}
              {account.industry && <span>{account.industry}</span>}
              <span>Ansvarlig: {account.owner}</span>
              <span>Kilde: {LEAD_SOURCE_LABELS[account.source]}</span>
            </p>
            {account.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 pt-1">
                {account.tags.map((t) => (
                  <Badge key={t} variant="muted">
                    {t}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </div>
        <dl className="grid shrink-0 grid-cols-2 gap-4 text-sm sm:grid-cols-3 md:w-auto">
          <KeyValue label="Åben pipeline" value={<Money implementation={sum(data.opportunities.filter((o) => o.status === "open"), "implementationValue")} monthly={sum(data.opportunities.filter((o) => o.status === "open"), "monthlyValue")} />} />
          <KeyValue label="Tilbud" value={String(data.quotes.length)} />
          <KeyValue label="Projekter" value={String(data.projects.length)} />
        </dl>
      </CardContent>
    </Card>
  );
}

const sum = (list: Opportunity[], key: "implementationValue" | "monthlyValue") => list.reduce((s, o) => s + o[key], 0);

function AccountInfo({ data, onSaved }: { data: Account360; onSaved: () => void }) {
  const { account } = data;
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState({
    status: account.status,
    owner: account.owner,
    industry: account.industry,
    phone: account.phone,
    email: account.email,
    address: account.address,
    website: account.website ?? "",
    cvr: account.cvr ?? "",
    size: account.size,
    source: account.source,
    tags: account.tags.join(", "),
    notes: account.notes,
  });
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const lastContact = data.activities.filter((a) => a.status === "done" && ["call", "email", "meeting"].includes(a.kind)).sort((a, b) => (b.completedAt ?? b.dueAt).localeCompare(a.completedAt ?? a.dueAt))[0];
  const nextFollowUp = data.activities.filter((a) => a.status === "planned").sort((a, b) => a.dueAt.localeCompare(b.dueAt))[0];

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/crm/accounts/${account.id}`, {
        method: "PATCH",
        body: { ...draft, website: draft.website.trim() || null, cvr: draft.cvr.trim() || null, tags: draft.tags.split(",").map((t) => t.trim()).filter(Boolean) },
      });
      setEditing(false);
      onSaved();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card data-testid="account-info">
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle>Virksomhedsoplysninger</CardTitle>
        {!editing && (
          <Button size="sm" variant="outline" onClick={() => setEditing(true)} data-testid="edit-account">
            Redigér
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {editing ? (
          <form onSubmit={save} className="space-y-3" data-testid="account-edit-form">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Leadstatus" id="acc-status">
                <Select id="acc-status" value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value as AccountStatus })} data-testid="edit-status">
                  {(Object.keys(ACCOUNT_STATUS_LABELS) as AccountStatus[]).map((s) => (
                    <option key={s} value={s}>
                      {ACCOUNT_STATUS_LABELS[s]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Ansvarlig" id="acc-owner">
                <Input id="acc-owner" value={draft.owner} maxLength={80} onChange={(e) => setDraft({ ...draft, owner: e.target.value })} />
              </Field>
              <Field label="Branche" id="acc-industry">
                <Input id="acc-industry" value={draft.industry} maxLength={120} onChange={(e) => setDraft({ ...draft, industry: e.target.value })} />
              </Field>
              <Field label="CVR (valgfrit)" id="acc-cvr">
                <Input id="acc-cvr" value={draft.cvr} inputMode="numeric" maxLength={8} onChange={(e) => setDraft({ ...draft, cvr: e.target.value })} />
              </Field>
              <Field label="Hjemmeside" id="acc-web">
                <Input id="acc-web" value={draft.website} maxLength={500} onChange={(e) => setDraft({ ...draft, website: e.target.value })} />
              </Field>
              <Field label="Telefon" id="acc-phone">
                <Input id="acc-phone" value={draft.phone} maxLength={40} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} />
              </Field>
              <Field label="E-mail" id="acc-email">
                <Input id="acc-email" type="email" value={draft.email} maxLength={200} onChange={(e) => setDraft({ ...draft, email: e.target.value })} />
              </Field>
              <Field label="Adresse" id="acc-address">
                <Input id="acc-address" value={draft.address} maxLength={300} onChange={(e) => setDraft({ ...draft, address: e.target.value })} />
              </Field>
              <Field label="Størrelse" id="acc-size">
                <Select id="acc-size" value={draft.size} onChange={(e) => setDraft({ ...draft, size: e.target.value as CompanySize })}>
                  {(Object.keys(COMPANY_SIZE_LABELS) as CompanySize[]).map((s) => (
                    <option key={s} value={s}>
                      {COMPANY_SIZE_LABELS[s]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Leadkilde" id="acc-source">
                <Select id="acc-source" value={draft.source} onChange={(e) => setDraft({ ...draft, source: e.target.value as LeadSource })}>
                  {(Object.keys(LEAD_SOURCE_LABELS) as LeadSource[]).map((s) => (
                    <option key={s} value={s}>
                      {LEAD_SOURCE_LABELS[s]}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <Field label="Tags (kommasepareret)" id="acc-tags">
              <Input id="acc-tags" value={draft.tags} onChange={(e) => setDraft({ ...draft, tags: e.target.value })} data-testid="edit-tags" />
            </Field>
            <Field label="Noter" id="acc-notes">
              <Textarea id="acc-notes" rows={3} maxLength={8000} value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
            </Field>
            {error && <Alert variant="error">{error}</Alert>}
            <div className="flex gap-2">
              <Button type="submit" disabled={busy} data-testid="save-account">
                {busy && <Spinner />} Gem
              </Button>
              <Button type="button" variant="outline" onClick={() => setEditing(false)}>
                Annullér
              </Button>
            </div>
          </form>
        ) : (
          <div className="space-y-4">
            <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <KeyValue label="Telefon" value={account.phone || null} />
              <KeyValue label="E-mail" value={account.email || null} />
              <KeyValue label="Adresse" value={account.address || null} />
              <KeyValue label="Størrelse" value={COMPANY_SIZE_LABELS[account.size]} />
              <KeyValue label="Seneste kontakt" value={lastContact ? formatDateTime(lastContact.completedAt ?? lastContact.dueAt) : "Ingen endnu"} />
              <KeyValue label="Næste opfølgning" value={nextFollowUp ? `${formatDateTime(nextFollowUp.dueAt)} · ${nextFollowUp.subject}` : "Ikke planlagt"} />
              <KeyValue label="Oprettet" value={formatDate(account.createdAt)} />
            </dl>
            {account.notes && <p className="whitespace-pre-line rounded-lg bg-muted/50 p-3 text-sm">{account.notes}</p>}
            {account.statusHistory.length > 1 && (
              <details className="text-sm">
                <summary className="cursor-pointer text-muted-foreground">Statushistorik ({account.statusHistory.length})</summary>
                <ul className="mt-2 space-y-1">
                  {[...account.statusHistory].reverse().map((h, i) => (
                    <li key={i} className="text-xs text-muted-foreground">
                      {formatDateTime(h.at)} · {ACCOUNT_STATUS_LABELS[h.to]}
                      {h.note ? ` — ${h.note}` : ""}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Field({ label, id, children }: { label: string; id: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}

// ─── Kontaktpersoner ────────────────────────────────────────────────────────

function Contacts({ data, onChange }: { data: Account360; onChange: () => void }) {
  const [adding, setAdding] = React.useState(false);
  const [draft, setDraft] = React.useState({ name: "", title: "", email: "", phone: "", isPrimary: false });
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  return (
    <Card data-testid="contacts">
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle>Kontaktpersoner</CardTitle>
        <Button size="sm" variant="outline" onClick={() => setAdding(!adding)} data-testid="add-contact">
          <UserPlus /> Tilføj
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {adding && (
          <form
            className="space-y-2 rounded-lg border border-border p-3"
            data-testid="contact-form"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError(null);
              try {
                await apiFetch(`/api/crm/accounts/${data.account.id}/contacts`, { body: draft });
                setDraft({ name: "", title: "", email: "", phone: "", isPrimary: false });
                setAdding(false);
                onChange();
              } catch (err) {
                setError((err as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <Input aria-label="Navn" placeholder="Navn" required maxLength={120} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} data-testid="contact-name" />
            <Input aria-label="Titel" placeholder="Titel" maxLength={120} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
            <Input aria-label="E-mail" placeholder="E-mail" type="email" maxLength={200} value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} data-testid="contact-email" />
            <Input aria-label="Telefon" placeholder="Telefon" maxLength={40} value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={draft.isPrimary} onChange={(e) => setDraft({ ...draft, isPrimary: e.target.checked })} /> Primær kontakt
            </label>
            {error && <Alert variant="error">{error}</Alert>}
            <Button type="submit" size="sm" disabled={busy} data-testid="contact-submit">
              {busy && <Spinner />} Gem kontakt
            </Button>
          </form>
        )}
        {data.contacts.length ? (
          <ul className="space-y-3 text-sm">
            {data.contacts.map((c) => (
              <li key={c.id} className="space-y-0.5" data-testid="contact-row">
                <p className="flex items-center gap-1.5 font-medium">
                  {c.name}
                  {c.isPrimary && <Star className="h-3.5 w-3.5 fill-warning text-warning" aria-label="Primær kontakt" />}
                </p>
                {c.title && <p className="text-xs text-muted-foreground">{c.title}</p>}
                <p className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                  {c.email && (
                    <span className="inline-flex items-center gap-1">
                      <Mail className="h-3 w-3" /> {c.email}
                    </span>
                  )}
                  {c.phone && (
                    <span className="inline-flex items-center gap-1">
                      <Phone className="h-3 w-3" /> {c.phone}
                    </span>
                  )}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          !adding && <p className="text-sm text-muted-foreground">Ingen kontaktpersoner endnu.</p>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Echo (AOS) ─────────────────────────────────────────────────────────────

function EchoPanel({ data, onChange }: { data: Account360; onChange: () => void }) {
  const [busy, setBusy] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  return (
    <Card data-testid="echo-panel">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bot className="h-4 w-4 text-accent" /> Echo — CRM-specialist (AOS)
        </CardTitle>
        <CardDescription>AI-opgaver registreres i AOS&apos; Job Center. De er planlagt, men endnu ikke implementeret — routeren blokerer dem ærligt, og der bruges ingen betalt AI.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <ul className="space-y-2">
          {CRM_TASKS.map((t) => {
            const job = data.echo.jobs.find((j) => j.taskType === t.key);
            return (
              <li key={t.key} className="space-y-1 rounded-lg border border-border p-2.5 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">{t.label}</span>
                  <Badge variant="warning" data-testid="ai-pending">
                    Afventer implementering
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">{t.description}</p>
                <div className="flex justify-end">
                  {job ? (
                    <Link href={`/aos/jobs/${job.id}`} className="text-xs text-accent hover:underline" data-testid="ai-job-link">
                      Registreret i Job Center · {job.status === "blocked" ? "blokeret (ikke implementeret)" : job.status}
                    </Link>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy !== null}
                      data-testid={`ai-task-${t.key}`}
                      onClick={async () => {
                        setBusy(t.key);
                        setError(null);
                        try {
                          const job = await apiFetch<{ status: string }>(`/api/crm/accounts/${data.account.id}/ai-tasks`, { body: { taskType: t.key } });
                          setNotice(`Registreret i Job Center (${job.status === "blocked" ? "blokeret: opgavetypen er ikke implementeret endnu" : job.status}).`);
                          onChange();
                        } catch (err) {
                          setError((err as Error).message);
                        } finally {
                          setBusy(null);
                        }
                      }}
                    >
                      {busy === t.key && <Spinner />} Bestil hos Echo
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
        {notice && <Alert variant="info">{notice}</Alert>}
        {error && <Alert variant="error">{error}</Alert>}
      </CardContent>
    </Card>
  );
}

// ─── Research ───────────────────────────────────────────────────────────────

function ResearchTab({ data, onChange }: { data: Account360; onChange: () => void }) {
  const router = useRouter();
  const { research } = data;
  const [picked, setPicked] = React.useState<string[]>(research.recommendations.filter((r) => r.selected).map((r) => r.catalogItemId));
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const reportId = research.recommendations[0]?.reportId;
  return (
    <div className="grid gap-6 lg:grid-cols-2 [&>*]:min-w-0">
      <Card>
        <CardHeader>
          <CardTitle>Researchrapporter</CardTitle>
          <CardDescription>Læses direkte fra Research-modulet via kundens brand — ingen kopier.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {research.brandReports.length + research.linkedReports.length === 0 ? (
            <EmptyState icon={<Search />} title="Ingen research endnu" description="Kør en brandanalyse i Research — rapporten vises automatisk her." action={<Link href="/research"><Button size="sm" variant="outline">Gå til Research</Button></Link>} />
          ) : (
            <ul className="divide-y divide-border text-sm" data-testid="research-reports">
              {research.brandReports.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-2 py-2">
                  <Link href={`/research/reports/${r.id}`} className="font-medium text-accent hover:underline">
                    Brandanalyse {formatDate(r.createdAt)}
                  </Link>
                  <span className="flex gap-1">
                    <Badge variant="outline">{r.analysisEngine === "demo" ? "Demoanalyse" : r.analysisEngine}</Badge>
                    <Badge variant="muted">{r.status}</Badge>
                  </span>
                </li>
              ))}
              {research.linkedReports.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-2 py-2">
                  <Link href={`/research/reports/${r.id}`} className="font-medium text-accent hover:underline">
                    {r.name} · {formatDate(r.createdAt)}
                  </Link>
                  <Badge variant="info">Tilknyttet</Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Anbefalede services</CardTitle>
          <CardDescription>Fra seneste rapport. Vælg services og start en salgsmulighed.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {research.recommendations.length ? (
            <>
              <ul className="space-y-2 text-sm" data-testid="recommendations">
                {research.recommendations.map((r) => (
                  <li key={r.catalogItemId}>
                    <label className="flex cursor-pointer items-center justify-between gap-2 rounded-lg border border-border p-2">
                      <span className="flex items-center gap-2">
                        <input type="checkbox" checked={picked.includes(r.catalogItemId)} onChange={() => setPicked(picked.includes(r.catalogItemId) ? picked.filter((x) => x !== r.catalogItemId) : [...picked, r.catalogItemId])} />
                        <span className="font-medium">{r.serviceName}</span>
                      </span>
                      <span className="flex items-center gap-1">
                        <Badge variant={r.priority === "high" ? "success" : r.priority === "medium" ? "info" : "muted"}>{r.priority === "high" ? "Høj" : r.priority === "medium" ? "Middel" : "Lav"}</Badge>
                        <span className="tabular-nums text-xs text-muted-foreground">{r.score}/100</span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
              {error && <Alert variant="error">{error}</Alert>}
              <Button
                disabled={busy || !picked.length || !reportId}
                data-testid="start-opportunity-from-research"
                onClick={async () => {
                  setBusy(true);
                  setError(null);
                  try {
                    await apiFetch("/api/crm/from-report", { body: { reportId, action: "opportunity", catalogItemIds: picked } });
                    onChange();
                    router.replace(`/crm/companies/${data.account.id}?tab=opportunities`, { scroll: false });
                  } catch (err) {
                    setError((err as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {busy && <Spinner />} Start salgsmulighed
              </Button>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Ingen anbefalinger endnu.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Salgsmuligheder ────────────────────────────────────────────────────────

function OpportunitiesTab({ data, catalog, serviceName, onChange }: { data: Account360; catalog: Catalog; serviceName: (id: string) => string; onChange: () => void }) {
  const [creating, setCreating] = React.useState(false);
  const [dialog, setDialog] = React.useState<{ opp: Opportunity; stage: "won" | "lost" } | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);

  async function run(id: string, fn: () => Promise<string | void>) {
    setBusy(id);
    setError(null);
    setNotice(null);
    try {
      const msg = await fn();
      if (msg) setNotice(msg);
      onChange();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setCreating(!creating)} data-testid="new-opportunity">
          <Plus /> Ny salgsmulighed
        </Button>
      </div>
      {creating && (
        <OpportunityForm
          accounts={[{ id: data.account.id, name: data.account.name }]}
          catalog={catalog}
          defaultAccountId={data.account.id}
          onCreated={() => {
            setCreating(false);
            onChange();
          }}
        />
      )}
      {notice && <Alert variant="success">{notice}</Alert>}
      {error && <Alert variant="error">{error}</Alert>}
      {data.opportunities.length === 0 && !creating && <EmptyState icon={<Trophy />} title="Ingen salgsmuligheder" description="Opret en salgsmulighed manuelt eller fra en researchrapports anbefalinger." />}
      <div className="grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
        {data.opportunities.map((o) => {
          const quote = data.quotes.find((q) => q.id === o.quoteId);
          return (
            <Card key={o.id} data-testid="account-opportunity" data-opportunity-stage={o.stage}>
              <CardHeader className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <CardTitle className="text-base">{o.title}</CardTitle>
                  <span className="flex gap-1">
                    <StageBadge stage={o.stage} />
                    {o.isDemo && <DemoBadge />}
                  </span>
                </div>
                <CardDescription>
                  {o.services.map(serviceName).join(", ") || "Ingen services valgt"} · {o.probability}% sandsynlighed · lukning {formatDate(o.expectedCloseDate)} · {o.owner}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg bg-muted/50 p-2">
                    <p className="text-xs text-muted-foreground">Implementering (engangs)</p>
                    <p className="font-semibold tabular-nums">{formatKr(o.implementationValue)}</p>
                  </div>
                  <div className="rounded-lg bg-muted/50 p-2">
                    <p className="text-xs text-muted-foreground">Månedlig (tilbagevendende)</p>
                    <p className="font-semibold tabular-nums">{formatKr(o.monthlyValue)}/md.</p>
                  </div>
                </div>
                {o.lostReason && <p className="text-muted-foreground">Tabt: {o.lostReason}</p>}
                <div className="flex flex-wrap items-center gap-2">
                  {quote ? (
                    <Link href={`/quotes/${quote.id}`} className="inline-flex items-center gap-1 text-accent hover:underline" data-testid="opportunity-quote-link">
                      <Receipt className="h-3.5 w-3.5" /> Tilbud {quote.number} ({QUOTE_STATUS[quote.status]?.label ?? quote.status})
                    </Link>
                  ) : null}
                  {o.projectId && (
                    <Link href={`/production/projects/${o.projectId}`} className="inline-flex items-center gap-1 text-accent hover:underline" data-testid="opportunity-project-link">
                      <FolderKanban className="h-3.5 w-3.5" /> Produktionsprojekt
                    </Link>
                  )}
                </div>
                {o.status === "open" && (
                  <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
                    <Select
                      aria-label="Flyt til stadie"
                      className="h-8 w-auto text-xs"
                      value={o.stage}
                      disabled={busy !== null}
                      data-testid="opportunity-stage-select"
                      onChange={(e) => {
                        const stage = e.target.value as Stage;
                        if (stage === "won" || stage === "lost") return setDialog({ opp: o, stage });
                        void run(o.id, () => apiFetch(`/api/crm/opportunities/${o.id}/stage`, { body: { stage } }).then(() => undefined));
                      }}
                    >
                      {STAGES.map((s) => (
                        <option key={s.key} value={s.key}>
                          {stageLabel(s.key)}
                        </option>
                      ))}
                    </Select>
                    {(!quote || quote.status === "rejected") && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy !== null || !o.services.length}
                        title={o.services.length ? undefined : "Vælg mindst én service på salgsmuligheden"}
                        data-testid="create-quote"
                        onClick={() =>
                          run(o.id, async () => {
                            const r = await apiFetch<{ quoteNumber: string; created: boolean }>(`/api/crm/opportunities/${o.id}/quote`, { body: {} });
                            return r.created ? `Tilbudsudkast ${r.quoteNumber} er oprettet i Tilbud og forudfyldt med kunde og services.` : `Tilbud ${r.quoteNumber} findes allerede.`;
                          })
                        }
                      >
                        {busy === o.id && <Spinner />} <Receipt /> Opret tilbud
                      </Button>
                    )}
                    <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => setDialog({ opp: o, stage: "won" })} data-testid="win-opportunity">
                      <Trophy /> Vundet
                    </Button>
                    <Button size="sm" variant="ghost" disabled={busy !== null} onClick={() => setDialog({ opp: o, stage: "lost" })} data-testid="lose-opportunity">
                      <XCircle /> Tabt
                    </Button>
                  </div>
                )}
                <details className="text-xs">
                  <summary className="cursor-pointer text-muted-foreground">Historik ({o.history.length})</summary>
                  <ul className="mt-2 space-y-1">
                    {[...o.history].reverse().map((h, i) => (
                      <li key={i} className="text-muted-foreground">
                        {formatDateTime(h.at)} · {h.message}
                      </li>
                    ))}
                  </ul>
                </details>
              </CardContent>
            </Card>
          );
        })}
      </div>
      {dialog && (
        <CloseDialog
          dialog={dialog}
          onCancel={() => setDialog(null)}
          onConfirm={(extra) => {
            const d = dialog;
            setDialog(null);
            void run(d.opp.id, async () => {
              if (d.stage === "won") {
                const r = await apiFetch<{ projectId: string | null }>(`/api/crm/opportunities/${d.opp.id}/win`, { body: { transferToProduction: extra.transferToProduction ?? true } });
                return r.projectId ? "Vundet — tilbuddet er accepteret og overført til Produktion." : "Vundet — kunden er markeret som aktiv kunde.";
              }
              await apiFetch(`/api/crm/opportunities/${d.opp.id}/stage`, { body: { stage: "lost", lostReason: extra.lostReason ?? "" } });
              return "Markeret som tabt.";
            });
          }}
        />
      )}
    </div>
  );
}

// ─── Tilbud ─────────────────────────────────────────────────────────────────

function QuotesTab({ data, onChange }: { data: Account360; onChange: () => void }) {
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  async function setStatus(id: string, status: "sent" | "rejected") {
    setBusy(id + status);
    setError(null);
    try {
      await apiFetch(`/api/quotes/${id}/status`, { body: { status } });
      onChange();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }
  if (!data.quotes.length) return <EmptyState icon={<Receipt />} title="Ingen tilbud" description="Opret et tilbud fra en salgsmulighed — det forudfyldes med kunde og services." />;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Tilbud</CardTitle>
        <CardDescription>Vises fra Tilbudsmodulet (ingen kopier). Statusændringer opdaterer de tilknyttede salgsmuligheder. Platformen sender ikke tilbud — markér som sendt, når du har sendt det.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {error && <Alert variant="error">{error}</Alert>}
        <ul className="divide-y divide-border text-sm" data-testid="account-quotes">
          {data.quotes.map((q) => (
            <li key={q.id} className="flex flex-col gap-2 py-3 md:flex-row md:items-center md:justify-between" data-testid="account-quote" data-quote-status={q.status}>
              <div className="min-w-0 space-y-0.5">
                <Link href={`/quotes/${q.id}`} className="font-medium text-accent hover:underline">
                  {q.number}
                </Link>
                <p className="text-xs text-muted-foreground">
                  Version {q.currentVersion} af {q.versions} · opdateret {formatDate(q.updatedAt)}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Money implementation={q.implementation} monthly={q.monthly} className="text-xs" />
                <Badge variant={QUOTE_STATUS[q.status]?.variant ?? "outline"}>{QUOTE_STATUS[q.status]?.label ?? q.status}</Badge>
                {q.status === "draft" && (
                  <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => setStatus(q.id, "sent")} data-testid="mark-quote-sent">
                    {busy === q.id + "sent" && <Spinner />} Markér som sendt
                  </Button>
                )}
                {(q.status === "draft" || q.status === "sent") && (
                  <Button size="sm" variant="ghost" disabled={busy !== null} onClick={() => setStatus(q.id, "rejected")} data-testid="mark-quote-rejected">
                    {busy === q.id + "rejected" && <Spinner />} Afvist af kunden
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

// ─── Projekter ──────────────────────────────────────────────────────────────

function ProjectsTab({ data }: { data: Account360 }) {
  if (!data.projects.length) return <EmptyState icon={<FolderKanban />} title="Ingen projekter" description="Når et tilbud accepteres, overføres aftalen til Produktion og vises her." />;
  return (
    <div className="grid gap-4 lg:grid-cols-2 [&>*]:min-w-0" data-testid="account-projects">
      {data.projects.map((p) => (
        <Card key={p.id} data-testid="account-project">
          <CardHeader className="space-y-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-base">
                <Link href={`/production/projects/${p.id}`} className="hover:underline">
                  {p.name}
                </Link>
              </CardTitle>
              <span className="flex gap-1">
                <Badge variant="info">{p.phase}</Badge>
                {p.pendingApproval && <Badge variant="warning">Afventer godkendelse</Badge>}
                {p.isDemo && <DemoBadge />}
              </span>
            </div>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <dl className="grid grid-cols-2 gap-3">
              <KeyValue label="Leverancer" value={`${p.deliverables.done} af ${p.deliverables.total} leveret`} />
              <KeyValue label="Drift / vedligehold" value={p.maintenance} />
              <KeyValue label="Implementering" value={formatKr(p.implementationPrice)} />
              <KeyValue label="Månedlig" value={`${formatKr(p.monthlyPrice)}/md.`} />
            </dl>
            {p.blockers.length > 0 && (
              <Alert variant="warning" title="Blokeringer">
                <ul className="list-disc pl-4">
                  {p.blockers.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
              </Alert>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ─── Økonomi ────────────────────────────────────────────────────────────────

function FinanceTab({ data }: { data: Account360 }) {
  const open = data.opportunities.filter((o) => o.status === "open");
  const won = data.opportunities.filter((o) => o.status === "won");
  const accepted = data.quotes.filter((q) => q.status === "accepted");
  const weighted = (key: "implementationValue" | "monthlyValue") => open.reduce((s, o) => s + (o[key] * o.probability) / 100, 0);
  const rows: Array<{ label: string; implementation: number; monthly: number; testid: string }> = [
    { label: "Åben pipeline", implementation: sum(open, "implementationValue"), monthly: sum(open, "monthlyValue"), testid: "fin-pipeline" },
    { label: "Vægtet pipeline (sandsynlighed)", implementation: weighted("implementationValue"), monthly: weighted("monthlyValue"), testid: "fin-weighted" },
    { label: "Vundne aftaler", implementation: sum(won, "implementationValue"), monthly: sum(won, "monthlyValue"), testid: "fin-won" },
    { label: "Accepterede tilbud", implementation: accepted.reduce((s, q) => s + q.implementation, 0), monthly: accepted.reduce((s, q) => s + q.monthly, 0), testid: "fin-accepted" },
    { label: "Projekter i Produktion", implementation: data.projects.reduce((s, p) => s + p.implementationPrice, 0), monthly: data.projects.reduce((s, p) => s + p.monthlyPrice, 0), testid: "fin-projects" },
  ];
  const costs = data.projects.reduce((s, p) => s + p.registeredCosts, 0);
  const aiUsd = data.projects.reduce((s, p) => s + p.aiApiCostUsd, 0);
  return (
    <div className="space-y-4" data-testid="account-finance">
      <Card>
        <CardHeader>
          <CardTitle>Engangs- og tilbagevendende omsætning</CardTitle>
          <CardDescription>Implementering (engangs) og månedlig service holdes altid adskilt. Beløb ekskl. moms.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="py-2 pr-3 font-medium">Post</th>
                <th className="py-2 pr-3 text-right font-medium">Implementering</th>
                <th className="py-2 text-right font-medium">Månedlig</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.label} className="border-b border-border last:border-0" data-testid={r.testid}>
                  <td className="py-2 pr-3">{r.label}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{formatKr(r.implementation)}</td>
                  <td className="py-2 text-right tabular-nums">{formatKr(r.monthly)}/md.</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs text-muted-foreground">Registrerede projektomkostninger</p>
            <p className="text-lg font-semibold tabular-nums">{formatKr(costs)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs text-muted-foreground">AI API-forbrug (fra AOS)</p>
            <p className="text-lg font-semibold tabular-nums">${aiUsd.toFixed(2)}</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ─── Dokumenter ─────────────────────────────────────────────────────────────

function DocumentsTab({ data, onChange }: { data: Account360; onChange: () => void }) {
  const [title, setTitle] = React.useState("");
  const [url, setUrl] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  return (
    <div className="grid gap-6 lg:grid-cols-3 [&>*]:min-w-0">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Dokumenter</CardTitle>
          <CardDescription>Samlet fra CRM, Tilbud (PDF), Research og Produktion.</CardDescription>
        </CardHeader>
        <CardContent>
          {data.documents.length ? (
            <ul className="divide-y divide-border text-sm" data-testid="account-documents">
              {data.documents.map((d, i) => (
                <li key={`${d.url}-${i}`} className="flex items-center justify-between gap-2 py-2">
                  <a href={d.url} target={d.url.startsWith("http") ? "_blank" : undefined} rel="noreferrer noopener" className="inline-flex min-w-0 items-center gap-2 text-accent hover:underline">
                    <FileText className="h-4 w-4 shrink-0" /> <span className="truncate">{d.title}</span>
                    {d.url.startsWith("http") && <ExternalLink className="h-3 w-3 shrink-0" />}
                  </a>
                  <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                    <Badge variant="outline">{d.source}</Badge> {formatDate(d.addedAt)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Ingen dokumenter endnu.</p>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Tilføj link</CardTitle>
          <CardDescription>Fx kontrakt, mødereferat eller delt mappe. Kun links — ingen filupload.</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-2"
            data-testid="document-form"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError(null);
              try {
                await apiFetch(`/api/crm/accounts/${data.account.id}/documents`, { body: { title, url } });
                setTitle("");
                setUrl("");
                onChange();
              } catch (err) {
                setError((err as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <Input aria-label="Titel" placeholder="Titel" required maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} />
            <Input aria-label="URL" placeholder="https://…" type="url" required maxLength={2000} value={url} onChange={(e) => setUrl(e.target.value)} />
            {error && <Alert variant="error">{error}</Alert>}
            <Button type="submit" size="sm" disabled={busy}>
              {busy && <Spinner />} Tilføj
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
