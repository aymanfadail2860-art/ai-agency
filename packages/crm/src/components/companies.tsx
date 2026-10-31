"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Alert, apiFetch, Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState, Input, Label, Select, Spinner, Textarea } from "@agency/ui";
import { Building2, Plus, Search, UserPlus } from "lucide-react";
import type { AccountSummary } from "../server/service";
import { ACCOUNT_STATUS_LABELS, COMPANY_SIZE_LABELS, LEAD_SOURCE_LABELS, LEAD_STATUSES, type AccountStatus, type CompanySize, type CrmAccount, type LeadSource } from "../contracts";
import { AccountStatusBadge, DemoBadge, Money, formatDate } from "./shared";

export function CompanyList({
  accounts,
  initialQuery = "",
  initialStatus = "",
  notInCrm,
}: {
  accounts: AccountSummary[];
  initialQuery?: string;
  initialStatus?: string;
  notInCrm: Array<{ brandId: string; name: string; sources: string[] }>;
}) {
  const router = useRouter();
  const [query, setQuery] = React.useState(initialQuery);
  const [status, setStatus] = React.useState(initialStatus);
  const [source, setSource] = React.useState("");
  const [tag, setTag] = React.useState("");
  const [creating, setCreating] = React.useState(false);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const tags = Array.from(new Set(accounts.flatMap((a) => a.account.tags))).sort();

  const q = query.trim().toLowerCase();
  const visible = accounts.filter(({ account }) => {
    if (q && !`${account.name} ${account.website ?? ""} ${account.cvr ?? ""} ${account.industry} ${account.tags.join(" ")} ${account.email}`.toLowerCase().includes(q)) return false;
    if (status === "leads" && !LEAD_STATUSES.includes(account.status)) return false;
    if (status && status !== "leads" && account.status !== status) return false;
    if (source && account.source !== source) return false;
    if (tag && !account.tags.includes(tag)) return false;
    return true;
  });

  async function importBrand(brandId: string, name: string) {
    setBusy(brandId);
    setError(null);
    try {
      const res = await apiFetch<{ account: CrmAccount }>("/api/crm/accounts", { body: { brandId, name, source: "research" } });
      router.push(`/crm/companies/${res.account.id}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="gap-3">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <CardTitle>Virksomheder ({visible.length})</CardTitle>
            <Button onClick={() => setCreating(!creating)} data-testid="new-account">
              <Plus /> Ny virksomhed
            </Button>
          </div>
          <div className="grid gap-2 sm:grid-cols-[2fr_1fr_1fr_1fr] [&>*]:min-w-0">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input className="pl-8" placeholder="Søg navn, CVR, hjemmeside, branche eller tag" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Søg" data-testid="account-search" />
            </div>
            <Select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)} data-testid="account-status-filter">
              <option value="">Alle statusser</option>
              <option value="leads">Aktive leads</option>
              {(Object.keys(ACCOUNT_STATUS_LABELS) as AccountStatus[]).map((s) => (
                <option key={s} value={s}>
                  {ACCOUNT_STATUS_LABELS[s]}
                </option>
              ))}
            </Select>
            <Select aria-label="Leadkilde" value={source} onChange={(e) => setSource(e.target.value)}>
              <option value="">Alle kilder</option>
              {(Object.keys(LEAD_SOURCE_LABELS) as LeadSource[]).map((s) => (
                <option key={s} value={s}>
                  {LEAD_SOURCE_LABELS[s]}
                </option>
              ))}
            </Select>
            <Select aria-label="Tag" value={tag} onChange={(e) => setTag(e.target.value)}>
              <option value="">Alle tags</option>
              {tags.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
          </div>
        </CardHeader>
        {creating && (
          <CardContent className="border-t border-border pt-6">
            <CreateAccountForm
              onCreated={(account, created) => {
                if (!created) setNotice(`${account.name} findes allerede i CRM — den eksisterende virksomhed er åbnet.`);
                router.push(`/crm/companies/${account.id}${created ? "" : "?existing=1"}`);
              }}
            />
          </CardContent>
        )}
        <CardContent className={creating ? "border-t border-border pt-6" : ""}>
          {notice && <Alert variant="info">{notice}</Alert>}
          {visible.length === 0 ? (
            <EmptyState icon={<Building2 />} title={accounts.length ? "Ingen virksomheder matcher" : "Ingen virksomheder i CRM endnu"} description={accounts.length ? "Ret søgning eller filtre." : "Opret en virksomhed, tilføj en eksisterende kunde nedenfor eller start den guidede demo."} />
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 [&>*]:min-w-0" data-testid="account-cards">
              {visible.map(({ account, contacts, openOpportunities, pipeline, lastContactAt, nextActivity, overdueActivities }) => (
                <Link key={account.id} href={`/crm/companies/${account.id}`} className="group block rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-ring" data-testid="account-card">
                  <div className="h-full space-y-3 rounded-xl border border-border bg-card p-4 transition-all group-hover:-translate-y-0.5 group-hover:border-accent/50 group-hover:shadow-md">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate font-semibold">{account.name}</p>
                        <p className="truncate text-xs text-muted-foreground">{[account.industry, account.website?.replace(/^https?:\/\//, "").replace(/\/$/, "")].filter(Boolean).join(" · ") || "—"}</p>
                      </div>
                      <AccountStatusBadge status={account.status} />
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {account.isDemo && <DemoBadge />}
                      {account.tags.slice(0, 3).map((t) => (
                        <Badge key={t} variant="secondary">
                          {t}
                        </Badge>
                      ))}
                      {overdueActivities > 0 && <Badge variant="destructive">{overdueActivities} forsinket</Badge>}
                    </div>
                    <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                      <dt className="text-muted-foreground">Kontakter</dt>
                      <dd>{contacts}</dd>
                      <dt className="text-muted-foreground">Åbne muligheder</dt>
                      <dd>{openOpportunities}</dd>
                      <dt className="text-muted-foreground">Seneste kontakt</dt>
                      <dd>{formatDate(lastContactAt)}</dd>
                      <dt className="text-muted-foreground">Næste aktivitet</dt>
                      <dd className="truncate">{nextActivity ? `${formatDate(nextActivity.dueAt)} · ${nextActivity.subject}` : "–"}</dd>
                    </dl>
                    {openOpportunities > 0 && <Money implementation={pipeline.implementation} monthly={pipeline.monthly} className="block text-xs" />}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {notInCrm.length > 0 && (
        <Card data-testid="not-in-crm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserPlus className="h-4 w-4 text-accent" /> Eksisterende kunder, der ikke er i CRM
            </CardTitle>
            <CardDescription>Kunder fra Research, Tilbud og Produktion. Tilføjes uden dubletter — CRM bruger samme kundeidentitet.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-border/60 text-sm">
              {notInCrm.map((b) => (
                <li key={b.brandId} className="flex items-center justify-between gap-3 py-2.5">
                  <span className="min-w-0">
                    <span className="font-medium">{b.name}</span> <span className="text-xs text-muted-foreground">· {b.sources.join(", ")}</span>
                  </span>
                  <Button size="sm" variant="outline" onClick={() => importBrand(b.brandId, b.name)} disabled={busy !== null} data-testid="import-brand">
                    {busy === b.brandId && <Spinner />} Tilføj til CRM
                  </Button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
      {error && <Alert variant="error">{error}</Alert>}
    </div>
  );
}

export function CreateAccountForm({ onCreated }: { onCreated: (account: CrmAccount, created: boolean) => void }) {
  const [form, setForm] = React.useState({ name: "", website: "", cvr: "", industry: "", address: "", phone: "", email: "", size: "unknown" as CompanySize, source: "outbound" as LeadSource, owner: "Mig", tags: "", notes: "" });
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setForm({ ...form, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch<{ account: CrmAccount; created: boolean }>("/api/crm/accounts", {
        body: { ...form, tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean), website: form.website || undefined, cvr: form.cvr || undefined },
      });
      onCreated(res.account, res.created);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4" data-testid="account-form">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-1">
          <Label htmlFor="acc-name">Virksomhedsnavn</Label>
          <Input id="acc-name" required maxLength={200} value={form.name} onChange={set("name")} data-testid="account-name" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="acc-web">Hjemmeside</Label>
          <Input id="acc-web" placeholder="fx eksempel.dk" maxLength={500} value={form.website} onChange={set("website")} data-testid="account-website" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="acc-cvr">CVR (valgfrit)</Label>
          <Input id="acc-cvr" inputMode="numeric" maxLength={8} value={form.cvr} onChange={set("cvr")} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="acc-industry">Branche</Label>
          <Input id="acc-industry" maxLength={120} value={form.industry} onChange={set("industry")} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="acc-phone">Telefon</Label>
          <Input id="acc-phone" maxLength={40} value={form.phone} onChange={set("phone")} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="acc-email">E-mail</Label>
          <Input id="acc-email" type="email" maxLength={200} value={form.email} onChange={set("email")} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="acc-address">Adresse</Label>
          <Input id="acc-address" maxLength={300} value={form.address} onChange={set("address")} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="acc-size">Størrelse</Label>
          <Select id="acc-size" value={form.size} onChange={set("size")}>
            {(Object.keys(COMPANY_SIZE_LABELS) as CompanySize[]).map((s) => (
              <option key={s} value={s}>
                {COMPANY_SIZE_LABELS[s]}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="acc-source">Leadkilde</Label>
          <Select id="acc-source" value={form.source} onChange={set("source")}>
            {(Object.keys(LEAD_SOURCE_LABELS) as LeadSource[]).map((s) => (
              <option key={s} value={s}>
                {LEAD_SOURCE_LABELS[s]}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="acc-owner">Ansvarlig</Label>
          <Input id="acc-owner" maxLength={80} value={form.owner} onChange={set("owner")} />
        </div>
        <div className="space-y-1 sm:col-span-2">
          <Label htmlFor="acc-tags">Tags (kommasepareret)</Label>
          <Input id="acc-tags" value={form.tags} onChange={set("tags")} placeholder="fx restaurant, aarhus" />
        </div>
      </div>
      <div className="space-y-1">
        <Label htmlFor="acc-notes">Noter</Label>
        <Textarea id="acc-notes" rows={2} maxLength={8000} value={form.notes} onChange={set("notes")} />
      </div>
      <p className="text-xs text-muted-foreground">Findes virksomheden allerede (samme hjemmeside eller navn), åbnes den eksisterende i stedet for at oprette en dublet.</p>
      {error && <Alert variant="error">{error}</Alert>}
      <Button type="submit" disabled={busy} data-testid="account-submit">
        {busy && <Spinner />} Opret lead
      </Button>
    </form>
  );
}
