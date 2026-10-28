import type { Metadata } from "next";
import Link from "next/link";
import { isAiConfigured } from "@agency/integrations";
import { QuoteEditor } from "@agency/quotes";
import { getCatalog, getQuote } from "@agency/quotes/server";
import { PageHeader } from "@agency/ui";
import { orNotFound } from "@/lib/page";

export const metadata: Metadata = { title: "Tilbudseditor" };
export const dynamic = "force-dynamic";

export default async function QuotePage({ params }: { params: Promise<{ quoteId: string }> }) {
  const { quoteId } = await params;
  const [quote, catalog] = await Promise.all([orNotFound(getQuote(quoteId)), getCatalog()]);
  return (
    <>
      <PageHeader
        eyebrow={`Tilbud ${quote.number}`}
        title={quote.company.name}
        description={
          <Link href="/quotes" className="text-accent hover:underline">
            ← Alle tilbud
          </Link>
        }
      />
      <QuoteEditor initialQuote={quote} catalog={catalog} agencyName={process.env.AGENCY_NAME ?? "AI Agency"} aiAvailable={isAiConfigured()} />
    </>
  );
}
