import type { Metadata } from "next";
import { getSettings } from "@agency/core/server";
import { CrmDashboardView } from "@agency/crm";
import { getCrmDashboard, listActivities, listOpportunities } from "@agency/crm/server";
import { listQuotes } from "@agency/quotes/server";
import { ModeBadge, PageHeader } from "@agency/ui";
import { getDemoState } from "@/lib/crm-demo";

export const metadata: Metadata = { title: "CRM" };
export const dynamic = "force-dynamic";

const PERIODS = ["7", "30", "90", "all"];

export default async function CrmPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const { mode } = await getSettings();
  const sp = await searchParams;
  const period = PERIODS.includes(sp.period ?? "") ? sp.period! : "30";
  const [dashboard, upcoming, overdue, quotes, opportunities, demo] = await Promise.all([
    getCrmDashboard(mode, period === "all" ? null : Number(period)),
    listActivities({ mode, view: "upcoming" }),
    listActivities({ mode, view: "overdue" }),
    listQuotes(mode),
    listOpportunities(mode),
    mode === "demo" ? getDemoState() : Promise.resolve(null),
  ]);
  // Åbne tilbud = udkast eller sendt, knyttet til en CRM-salgsmulighed (læst fra Tilbud — ingen kopi).
  const crmQuoteIds = new Set(opportunities.map((o) => o.quoteId).filter(Boolean));
  const openQuotes = quotes.filter((q) => crmQuoteIds.has(q.quote.id) && (q.quote.status === "draft" || q.quote.status === "sent")).length;
  return (
    <>
      <PageHeader
        eyebrow="Modul 4"
        title="CRM"
        badges={<ModeBadge mode={mode} />}
        description="Internt salgs- og kundestyringssystem: leads, virksomheder, pipeline, aktiviteter og den samlede kundeprofil på tværs af Research, Tilbud og Produktion."
      />
      <CrmDashboardView dashboard={dashboard} openQuotes={openQuotes} upcoming={upcoming.slice(0, 8)} overdue={overdue.slice(0, 8)} period={period} demo={demo} />
    </>
  );
}
