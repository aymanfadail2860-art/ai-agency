import Link from "next/link";
import type { Quote, QuoteVersion } from "@agency/core";
import { Button, Card, EmptyState, ModeBadge, Table, TBody, TD, TH, THead, TR } from "@agency/ui";
import { formatDateTime, formatDkk } from "@agency/shared";
import { ArrowRight, FileText } from "lucide-react";
import type { QuoteTotals } from "../pricing";
import { quoteRecipient } from "../recipient";

export function QuoteList({ items }: { items: Array<{ quote: Quote; currentVersion: QuoteVersion; totals: QuoteTotals }> }) {
  if (items.length === 0) {
    return (
      <EmptyState
        icon={<FileText className="h-8 w-8" />}
        title="Ingen tilbud endnu"
        description="Tilbud oprettes fra en researchrapport: vælg services og klik “Opret tilbud”."
        action={
          <Button asChild variant="outline">
            <Link href="/research">Gå til Research</Link>
          </Button>
        }
      />
    );
  }
  return (
    <Card>
      <Table>
        <THead>
          <TR>
            <TH>Tilbud</TH>
            <TH>Kunde</TH>
            <TH>Version</TH>
            <TH className="text-right">Implementering</TH>
            <TH className="text-right">Pr. måned</TH>
            <TH>Opdateret</TH>
            <TH />
          </TR>
        </THead>
        <TBody>
          {items.map(({ quote, currentVersion, totals }) => (
            <TR key={quote.id}>
              <TD className="font-medium">{quote.number}</TD>
              <TD>
                <div className="flex items-center gap-2">
                  <span>
                    {quoteRecipient(quote).displayName}
                    {quoteRecipient(quote).showLegalName && <span className="block text-xs text-muted-foreground">{quoteRecipient(quote).legalName}</span>}
                  </span>
                  <ModeBadge mode={quote.mode} />
                </div>
              </TD>
              <TD className="text-muted-foreground">v{currentVersion.versionNumber}</TD>
              <TD className="text-right tabular-nums">{formatDkk(totals.implementation.exclVat)}</TD>
              <TD className="text-right tabular-nums">{formatDkk(totals.monthly.exclVat)}</TD>
              <TD className="text-muted-foreground">{formatDateTime(quote.updatedAt)}</TD>
              <TD className="text-right">
                <Button asChild variant="ghost" size="sm">
                  <Link href={`/quotes/${quote.id}`} data-testid={`open-quote-${quote.number}`}>
                    Åbn <ArrowRight />
                  </Link>
                </Button>
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </Card>
  );
}
