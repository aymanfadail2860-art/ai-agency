"use client";
import * as React from "react";
import { Alert, apiFetch, Badge, Button, Input, Label, Select, Spinner, Textarea } from "@agency/ui";
import { Bell, CalendarDays, CheckSquare, FileText, FlaskConical, Mail, Phone, RefreshCw, StickyNote } from "lucide-react";
import { ACCOUNT_STATUS_LABELS, ACTIVITY_KIND_LABELS, stageLabel, type AccountStatus, type Activity, type ActivityKind, type Stage } from "../contracts";

export const formatKr = (n: number) => `${Math.round(n).toLocaleString("da-DK")} kr.`;
export const formatDate = (d: string | null) => (d ? new Date(d.length === 10 ? `${d}T12:00:00Z` : d).toLocaleDateString("da-DK", { day: "numeric", month: "short", year: "numeric" }) : "–");
export const formatDateTime = (d: string) => new Date(d).toLocaleString("da-DK", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** Implementering og månedlig værdi vises altid hver for sig. */
export function Money({ implementation, monthly, className }: { implementation: number; monthly: number; className?: string }) {
  return (
    <span className={className}>
      <span className="tabular-nums">{formatKr(implementation)}</span>
      <span className="text-muted-foreground"> + </span>
      <span className="tabular-nums">{formatKr(monthly)}/md.</span>
    </span>
  );
}

export function AccountStatusBadge({ status }: { status: AccountStatus }) {
  const variant = status === "customer" ? "success" : status === "qualified" ? "info" : status === "new_lead" ? "warning" : status === "working" ? "secondary" : "muted";
  return (
    <Badge variant={variant} data-account-status={status}>
      {ACCOUNT_STATUS_LABELS[status]}
    </Badge>
  );
}

export function StageBadge({ stage }: { stage: Stage }) {
  const variant = stage === "won" ? "success" : stage === "lost" ? "muted" : stage === "quote_sent" || stage === "negotiation" ? "info" : "outline";
  return (
    <Badge variant={variant} data-stage={stage}>
      {stageLabel(stage)}
    </Badge>
  );
}

export const ACTIVITY_ICON: Record<ActivityKind, React.ComponentType<{ className?: string }>> = {
  call: Phone,
  email: Mail,
  meeting: CalendarDays,
  task: CheckSquare,
  follow_up: RefreshCw,
  note: StickyNote,
  reminder: Bell,
};

export function DemoBadge() {
  return (
    <Badge variant="demo" title="Eksempeldata">
      <FlaskConical /> Demo
    </Badge>
  );
}

export function isOverdue(a: Pick<Activity, "status" | "dueAt">) {
  return a.status === "planned" && new Date(a.dueAt).getTime() < Date.now();
}

const toLocalInput = (iso: string) => {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/** Opret aktivitet — knyttes til virksomhed og evt. kontaktperson/salgsmulighed. Intet sendes eksternt. */
export function ActivityForm({
  accounts,
  contacts = [],
  opportunities = [],
  defaultAccountId,
  defaultOpportunityId,
  onCreated,
  compact = false,
}: {
  accounts: Array<{ id: string; name: string }>;
  contacts?: Array<{ id: string; name: string; accountId: string }>;
  opportunities?: Array<{ id: string; title: string; accountId: string }>;
  defaultAccountId?: string;
  defaultOpportunityId?: string;
  onCreated: () => void;
  compact?: boolean;
}) {
  const [draft, setDraft] = React.useState({
    accountId: defaultAccountId ?? accounts[0]?.id ?? "",
    contactId: "",
    opportunityId: defaultOpportunityId ?? "",
    kind: "call" as ActivityKind,
    subject: "",
    description: "",
    dueAt: toLocalInput(new Date(Date.now() + 86_400_000).toISOString()),
    status: "planned" as "planned" | "done",
    priority: "normal" as "low" | "normal" | "high",
    outcome: "",
    nextStep: "",
  });
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const ownContacts = contacts.filter((c) => c.accountId === draft.accountId);
  const ownOpps = opportunities.filter((o) => o.accountId === draft.accountId);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiFetch("/api/crm/activities", {
        body: {
          accountId: draft.accountId,
          contactId: draft.contactId || null,
          opportunityId: draft.opportunityId || null,
          kind: draft.kind,
          subject: draft.subject,
          description: draft.description,
          dueAt: new Date(draft.dueAt).toISOString(),
          status: draft.kind === "note" ? "done" : draft.status,
          priority: draft.priority,
          outcome: draft.outcome,
          nextStep: draft.nextStep,
        },
      });
      setDraft({ ...draft, subject: "", description: "", outcome: "", nextStep: "" });
      onCreated();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3" data-testid="activity-form">
      <div className={`grid gap-3 ${compact ? "sm:grid-cols-2" : "sm:grid-cols-2 lg:grid-cols-4"}`}>
        {!defaultAccountId && (
          <div className="space-y-1">
            <Label htmlFor="act-account">Virksomhed</Label>
            <Select id="act-account" value={draft.accountId} onChange={(e) => setDraft({ ...draft, accountId: e.target.value, contactId: "", opportunityId: "" })} required>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </div>
        )}
        <div className="space-y-1">
          <Label htmlFor="act-kind">Type</Label>
          <Select id="act-kind" value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value as ActivityKind })} data-testid="activity-kind">
            {(Object.keys(ACTIVITY_KIND_LABELS) as ActivityKind[]).map((k) => (
              <option key={k} value={k}>
                {ACTIVITY_KIND_LABELS[k]}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="act-due">Dato og tidspunkt</Label>
          <Input id="act-due" type="datetime-local" value={draft.dueAt} onChange={(e) => setDraft({ ...draft, dueAt: e.target.value })} required />
        </div>
        {draft.kind !== "note" && (
          <div className="space-y-1">
            <Label htmlFor="act-status">Status</Label>
            <Select id="act-status" value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value as "planned" | "done" })} data-testid="activity-status">
              <option value="planned">Planlagt</option>
              <option value="done">Udført (registrér)</option>
            </Select>
          </div>
        )}
        <div className="space-y-1">
          <Label htmlFor="act-priority">Prioritet</Label>
          <Select id="act-priority" value={draft.priority} onChange={(e) => setDraft({ ...draft, priority: e.target.value as "low" | "normal" | "high" })}>
            <option value="low">Lav</option>
            <option value="normal">Normal</option>
            <option value="high">Høj</option>
          </Select>
        </div>
        {ownContacts.length > 0 && (
          <div className="space-y-1">
            <Label htmlFor="act-contact">Kontaktperson</Label>
            <Select id="act-contact" value={draft.contactId} onChange={(e) => setDraft({ ...draft, contactId: e.target.value })}>
              <option value="">Ingen</option>
              {ownContacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </div>
        )}
        {ownOpps.length > 0 && (
          <div className="space-y-1">
            <Label htmlFor="act-opp">Salgsmulighed</Label>
            <Select id="act-opp" value={draft.opportunityId} onChange={(e) => setDraft({ ...draft, opportunityId: e.target.value })}>
              <option value="">Ingen</option>
              {ownOpps.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.title}
                </option>
              ))}
            </Select>
          </div>
        )}
      </div>
      <div className="space-y-1">
        <Label htmlFor="act-subject">Emne</Label>
        <Input id="act-subject" required maxLength={200} value={draft.subject} onChange={(e) => setDraft({ ...draft, subject: e.target.value })} data-testid="activity-subject" />
      </div>
      <div className="space-y-1">
        <Label htmlFor="act-desc">Beskrivelse</Label>
        <Textarea id="act-desc" rows={2} maxLength={4000} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
      </div>
      {draft.status === "done" && draft.kind !== "note" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="act-outcome">Resultat</Label>
            <Input id="act-outcome" maxLength={2000} value={draft.outcome} onChange={(e) => setDraft({ ...draft, outcome: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="act-next">Næste skridt</Label>
            <Input id="act-next" maxLength={500} value={draft.nextStep} onChange={(e) => setDraft({ ...draft, nextStep: e.target.value })} />
          </div>
        </div>
      )}
      {draft.kind === "email" && <p className="text-xs text-muted-foreground">E-mails registreres kun i CRM — platformen sender ingen e-mails.</p>}
      {error && <Alert variant="error">{error}</Alert>}
      <Button type="submit" disabled={busy || !draft.accountId} data-testid="activity-submit">
        {busy && <Spinner />} Gem aktivitet
      </Button>
    </form>
  );
}

/** Afslut en planlagt aktivitet med resultat og næste skridt. */
export function CompleteActivity({ activity, onDone }: { activity: Activity; onDone: () => void }) {
  const [open, setOpen] = React.useState(false);
  const [outcome, setOutcome] = React.useState("");
  const [nextStep, setNextStep] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  if (activity.status !== "planned") return null;
  if (!open)
    return (
      <Button size="sm" variant="outline" onClick={() => setOpen(true)} data-testid="complete-activity">
        Afslut
      </Button>
    );
  return (
    <form
      className="flex w-full flex-col gap-2 sm:flex-row"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          await apiFetch(`/api/crm/activities/${activity.id}`, { method: "PATCH", body: { status: "done", outcome, nextStep } });
          onDone();
        } finally {
          setBusy(false);
        }
      }}
    >
      <Input aria-label="Resultat" placeholder="Resultat" className="h-8 text-xs" value={outcome} onChange={(e) => setOutcome(e.target.value)} maxLength={2000} />
      <Input aria-label="Næste skridt" placeholder="Næste skridt" className="h-8 text-xs" value={nextStep} onChange={(e) => setNextStep(e.target.value)} maxLength={500} />
      <Button type="submit" size="sm" disabled={busy} data-testid="save-complete">
        {busy && <Spinner />} Gem
      </Button>
    </form>
  );
}

export function ActivityRow({ activity, accountName, showAccount = true, onChange }: { activity: Activity; accountName?: string; showAccount?: boolean; onChange: () => void }) {
  const Icon = ACTIVITY_ICON[activity.kind] ?? FileText;
  const overdue = isOverdue(activity);
  return (
    <li className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start" data-testid="activity-row" data-activity-status={activity.status}>
      <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${activity.status === "done" ? "bg-success/10 text-success" : overdue ? "bg-destructive/10 text-destructive" : "bg-accent/10 text-accent"}`}>
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1 space-y-0.5 text-sm">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-medium">{activity.subject}</span>
          <Badge variant="outline">{ACTIVITY_KIND_LABELS[activity.kind]}</Badge>
          {activity.status === "done" ? <Badge variant="success">Udført</Badge> : activity.status === "cancelled" ? <Badge variant="muted">Annulleret</Badge> : overdue ? <Badge variant="destructive">Forsinket</Badge> : <Badge variant="info">Planlagt</Badge>}
          {activity.priority === "high" && <Badge variant="warning">Høj</Badge>}
          {activity.isDemo && <DemoBadge />}
        </div>
        <p className="text-xs text-muted-foreground">
          {formatDateTime(activity.completedAt ?? activity.dueAt)} · {activity.owner}
          {showAccount && accountName ? ` · ${accountName}` : ""}
        </p>
        {activity.description && <p className="text-muted-foreground">{activity.description}</p>}
        {activity.outcome && (
          <p>
            <span className="font-medium">Resultat:</span> {activity.outcome}
          </p>
        )}
        {activity.nextStep && (
          <p>
            <span className="font-medium">Næste skridt:</span> {activity.nextStep}
          </p>
        )}
      </div>
      <CompleteActivity activity={activity} onDone={onChange} />
    </li>
  );
}
