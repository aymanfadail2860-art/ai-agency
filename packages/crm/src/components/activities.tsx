"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Card, CardContent, CardHeader, CardTitle, EmptyState, Select, Tabs } from "@agency/ui";
import { CalendarClock, List, Plus } from "lucide-react";
import { ACTIVITY_KIND_LABELS, type Activity, type ActivityKind } from "../contracts";
import { ACTIVITY_ICON, ActivityForm, ActivityRow, CompleteActivity, DemoBadge, formatDateTime, isOverdue } from "./shared";

export type ActivityItem = Activity & { accountName?: string };
export type ActivityView = "all" | "planned" | "overdue" | "upcoming" | "done";

const VIEW_LABELS: Record<ActivityView, string> = { all: "Alle", planned: "Planlagte", overdue: "Forsinkede", upcoming: "Næste 7 dage", done: "Udførte" };

export function filterActivities<T extends Activity>(items: T[], view: ActivityView, kind: string): T[] {
  const now = Date.now();
  const week = now + 7 * 86_400_000;
  return items
    .filter((a) => !kind || a.kind === kind)
    .filter((a) => {
      const t = new Date(a.dueAt).getTime();
      if (view === "planned") return a.status === "planned";
      if (view === "overdue") return isOverdue(a);
      if (view === "upcoming") return a.status === "planned" && t >= now && t <= week;
      if (view === "done") return a.status === "done";
      return true;
    })
    .sort((a, b) => (view === "planned" || view === "upcoming" || view === "overdue" ? a.dueAt.localeCompare(b.dueAt) : b.dueAt.localeCompare(a.dueAt)));
}

/** Liste — én række pr. aktivitet. */
export function ActivityList({ items, showAccount = true, onChange }: { items: ActivityItem[]; showAccount?: boolean; onChange: () => void }) {
  if (!items.length) return <EmptyState icon={<CalendarClock />} title="Ingen aktiviteter" description="Der er ingen aktiviteter i den valgte visning." />;
  return (
    <ul className="divide-y divide-border" data-testid="activity-list">
      {items.map((a) => (
        <ActivityRow key={a.id} activity={a} accountName={a.accountName} showAccount={showAccount} onChange={onChange} />
      ))}
    </ul>
  );
}

/** Tidslinje — grupperet pr. dag med lodret forløb. */
export function ActivityTimeline({ items, showAccount = true, onChange }: { items: ActivityItem[]; showAccount?: boolean; onChange: () => void }) {
  if (!items.length) return <EmptyState icon={<CalendarClock />} title="Ingen aktiviteter" description="Der er ingen aktiviteter i den valgte visning." />;
  const groups = new Map<string, ActivityItem[]>();
  for (const a of items) {
    const day = new Date(a.completedAt ?? a.dueAt).toLocaleDateString("da-DK", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    groups.set(day, [...(groups.get(day) ?? []), a]);
  }
  return (
    <div className="space-y-6" data-testid="activity-timeline">
      {Array.from(groups.entries()).map(([day, list]) => (
        <section key={day}>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground first-letter:uppercase">{day}</h3>
          <ol className="relative ml-4 space-y-4 border-l border-border pl-6">
            {list.map((a) => {
              const Icon = ACTIVITY_ICON[a.kind];
              const overdue = isOverdue(a);
              return (
                <li key={a.id} className="relative" data-testid="timeline-item">
                  <span className={`absolute -left-[37px] top-0 flex h-6 w-6 items-center justify-center rounded-full border-2 border-background ${a.status === "done" ? "bg-success text-white" : overdue ? "bg-destructive text-white" : "bg-accent text-white"}`}>
                    <Icon className="h-3 w-3" />
                  </span>
                  <div className="min-w-0 space-y-0.5 text-sm">
                    <p className="flex flex-wrap items-center gap-1.5">
                      <span className="font-medium">{a.subject}</span>
                      <span className="text-xs text-muted-foreground">
                        {ACTIVITY_KIND_LABELS[a.kind]} · {formatDateTime(a.completedAt ?? a.dueAt)} · {a.owner}
                        {showAccount && a.accountName ? ` · ${a.accountName}` : ""}
                      </span>
                      {overdue && <span className="text-xs font-medium text-destructive">Forsinket</span>}
                      {a.isDemo && <DemoBadge />}
                    </p>
                    {a.description && <p className="text-muted-foreground">{a.description}</p>}
                    {a.outcome && <p>Resultat: {a.outcome}</p>}
                    {a.nextStep && <p>Næste skridt: {a.nextStep}</p>}
                    <div className="pt-1">
                      <CompleteActivity activity={a} onDone={onChange} />
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      ))}
    </div>
  );
}

/** Filtre + liste/tidslinje-skift. Bruges både på aktivitetssiden og i 360-profilen. */
export function ActivityBrowser({
  activities,
  initialView = "all",
  initialKind = "",
  showAccount = true,
  syncUrl = false,
}: {
  activities: ActivityItem[];
  initialView?: ActivityView;
  initialKind?: string;
  showAccount?: boolean;
  syncUrl?: boolean;
}) {
  const router = useRouter();
  const [view, setView] = React.useState<ActivityView>(initialView);
  const [kind, setKind] = React.useState(initialKind);
  const [layout, setLayout] = React.useState<"list" | "timeline">("list");
  const visible = filterActivities(activities, view, kind);
  const refresh = () => router.refresh();

  function update(nextView: ActivityView, nextKind: string) {
    setView(nextView);
    setKind(nextKind);
    if (syncUrl) {
      const params = new URLSearchParams();
      if (nextView !== "all") params.set("view", nextView);
      if (nextKind) params.set("kind", nextKind);
      router.replace(`/crm/activities${params.size ? `?${params}` : ""}`, { scroll: false });
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <Tabs
          items={(Object.keys(VIEW_LABELS) as ActivityView[]).map((v) => ({ value: v, label: VIEW_LABELS[v], count: filterActivities(activities, v, kind).length }))}
          value={view}
          onValueChange={(v) => update(v as ActivityView, kind)}
        />
        <div className="grid grid-cols-[1fr_auto] gap-2 sm:flex">
          <Select aria-label="Aktivitetstype" value={kind} onChange={(e) => update(view, e.target.value)} data-testid="activity-kind-filter">
            <option value="">Alle typer</option>
            {(Object.keys(ACTIVITY_KIND_LABELS) as ActivityKind[]).map((k) => (
              <option key={k} value={k}>
                {ACTIVITY_KIND_LABELS[k]}
              </option>
            ))}
          </Select>
          <div className="inline-flex rounded-lg border border-border p-0.5" role="group" aria-label="Visning">
            <Button size="sm" variant={layout === "list" ? "secondary" : "ghost"} onClick={() => setLayout("list")} aria-pressed={layout === "list"} data-testid="layout-list">
              <List /> Liste
            </Button>
            <Button size="sm" variant={layout === "timeline" ? "secondary" : "ghost"} onClick={() => setLayout("timeline")} aria-pressed={layout === "timeline"} data-testid="layout-timeline">
              <CalendarClock /> Tidslinje
            </Button>
          </div>
        </div>
      </div>
      {layout === "list" ? <ActivityList items={visible} showAccount={showAccount} onChange={refresh} /> : <ActivityTimeline items={visible} showAccount={showAccount} onChange={refresh} />}
    </div>
  );
}

/** Aktivitetssiden: opret + browse på tværs af virksomheder. */
export function ActivityCenter({
  activities,
  accounts,
  contacts,
  opportunities,
  initialView,
  initialKind,
}: {
  activities: ActivityItem[];
  accounts: Array<{ id: string; name: string }>;
  contacts: Array<{ id: string; name: string; accountId: string }>;
  opportunities: Array<{ id: string; title: string; accountId: string }>;
  initialView?: ActivityView;
  initialKind?: string;
}) {
  const router = useRouter();
  const [creating, setCreating] = React.useState(false);
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">Opkald, e-mails, møder, opgaver, opfølgninger, noter og påmindelser. Platformen sender ingen e-mails og foretager ingen opkald — aktiviteter registreres kun.</p>
        {accounts.length > 0 ? (
          <Button onClick={() => setCreating(!creating)} data-testid="new-activity">
            <Plus /> Ny aktivitet
          </Button>
        ) : (
          <Link href="/crm/companies" className="text-sm text-accent underline-offset-4 hover:underline">
            Opret først en virksomhed
          </Link>
        )}
      </div>
      {creating && (
        <Card>
          <CardHeader>
            <CardTitle>Ny aktivitet</CardTitle>
          </CardHeader>
          <CardContent>
            <ActivityForm
              accounts={accounts}
              contacts={contacts}
              opportunities={opportunities}
              onCreated={() => {
                setCreating(false);
                router.refresh();
              }}
            />
          </CardContent>
        </Card>
      )}
      <Card>
        <CardContent className="pt-6">
          <ActivityBrowser activities={activities} initialView={initialView} initialKind={initialKind} syncUrl />
        </CardContent>
      </Card>
    </div>
  );
}
