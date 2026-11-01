import type { Metadata } from "next";
import { getSettings } from "@agency/core/server";
import { ActivityCenter, type ActivityView } from "@agency/crm";
import { getAccountCore, listAccounts, listActivities, listOpportunities } from "@agency/crm/server";
import { ModeBadge, PageHeader } from "@agency/ui";

export const metadata: Metadata = { title: "CRM · Aktiviteter" };
export const dynamic = "force-dynamic";

const VIEWS: ActivityView[] = ["all", "planned", "overdue", "upcoming", "done"];

export default async function ActivitiesPage({ searchParams }: { searchParams: Promise<{ view?: string; kind?: string }> }) {
  const { mode } = await getSettings();
  const sp = await searchParams;
  const [activities, accounts, opportunities] = await Promise.all([listActivities({ mode, view: "all" }), listAccounts(mode), listOpportunities(mode)]);
  const cores = await Promise.all(accounts.map((a) => getAccountCore(a.account.id)));
  const contacts = cores.flatMap((c) => c.contacts.map((x) => ({ id: x.id, name: x.name, accountId: x.accountId })));
  return (
    <>
      <PageHeader eyebrow="CRM" title="Aktiviteter" badges={<ModeBadge mode={mode} />} description="Alle opkald, e-mails, møder, opgaver, opfølgninger, noter og påmindelser — som liste eller tidslinje." />
      <ActivityCenter
        activities={activities}
        accounts={accounts.map((a) => ({ id: a.account.id, name: a.account.name }))}
        contacts={contacts}
        opportunities={opportunities.filter((o) => o.status === "open").map((o) => ({ id: o.id, title: o.title, accountId: o.accountId }))}
        initialView={VIEWS.includes(sp.view as ActivityView) ? (sp.view as ActivityView) : "all"}
        initialKind={sp.kind ?? ""}
      />
    </>
  );
}
