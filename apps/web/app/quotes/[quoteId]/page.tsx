import type { Metadata } from "next";
import Link from "next/link";
import { isAiConfigured } from "@agency/integrations";
import { QuoteEditor, quoteRecipient } from "@agency/quotes";
import { getCatalog, getQuote } from "@agency/quotes/server";
import { PageHeader } from "@agency/ui";
import { stageLabel } from "@agency/crm";
import { opportunitiesForQuote } from "@agency/crm/server";
import { QuoteCrmPanel } from "@/components/crm-links";
import { QuoteAcceptance } from "@/components/quote-acceptance";
import { orNotFound } from "@/lib/page";
import { productionProjectForQuote } from "@/lib/production";

export const metadata: Metadata = { title: "Tilbudseditor" };
export const dynamic = "force-dynamic";

export default async function QuotePage({ params }: { params: Promise<{ quoteId: string }> }) {
  const { quoteId } = await params;
  const [quote, catalog] = await Promise.all([orNotFound(getQuote(quoteId)), getCatalog()]);
  const [project, opportunities] = await Promise.all([productionProjectForQuote(quoteId), opportunitiesForQuote(quoteId)]);
  return (
    <>
      <PageHeader
        eyebrow={`Tilbud ${quote.number}`}
        title={quoteRecipient(quote).displayName}
        description={
          <Link href="/quotes" className="text-accent hover:underline">
            ← Alle tilbud
          </Link>
        }
      />
      <QuoteCrmPanel quoteId={quote.id} status={quote.status} opportunities={opportunities.map((o) => ({ id: o.id, title: o.title, accountId: o.accountId, stageLabel: stageLabel(o.stage) }))} />
      <QuoteAcceptance quoteId={quote.id} status={quote.status} projectId={project?.id ?? null} />
      <QuoteEditor initialQuote={quote} catalog={catalog} agencyName={process.env.AGENCY_NAME ?? "AI Agency"} aiAvailable={isAiConfigured()} />
    </>
  );
}
