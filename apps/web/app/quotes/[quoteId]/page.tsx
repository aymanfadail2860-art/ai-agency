import type { Metadata } from "next";
import Link from "next/link";
import { isAiConfigured } from "@agency/integrations";
import { QuoteEditor, quoteRecipient } from "@agency/quotes";
import { getCatalog, getQuote } from "@agency/quotes/server";
import { PageHeader } from "@agency/ui";
import { QuoteAcceptance } from "@/components/quote-acceptance";
import { orNotFound } from "@/lib/page";
import { productionProjectForQuote } from "@/lib/production";

export const metadata: Metadata = { title: "Tilbudseditor" };
export const dynamic = "force-dynamic";

export default async function QuotePage({ params }: { params: Promise<{ quoteId: string }> }) {
  const { quoteId } = await params;
  const [quote, catalog] = await Promise.all([orNotFound(getQuote(quoteId)), getCatalog()]);
  const project = await productionProjectForQuote(quoteId);
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
      <QuoteAcceptance quoteId={quote.id} status={quote.status} projectId={project?.id ?? null} />
      <QuoteEditor initialQuote={quote} catalog={catalog} agencyName={process.env.AGENCY_NAME ?? "AI Agency"} aiAvailable={isAiConfigured()} />
    </>
  );
}
