import type { Quote } from "@agency/core";

/**
 * Hvem tilbuddet er til (V2): brandet er altid kendt; den juridiske enhed
 * (CVR) kun, når en relation er bekræftet i Research.
 */
export function quoteRecipient(quote: Pick<Quote, "brand" | "company">) {
  const displayName = quote.brand?.name ?? quote.company?.name ?? "Ukendt kunde";
  const legalName = quote.company?.name ?? null;
  return {
    displayName,
    legalName,
    showLegalName: Boolean(legalName && legalName.toLowerCase() !== displayName.toLowerCase()),
    cvr: quote.company?.cvr ?? null,
    address: quote.company?.address ?? null,
    website: quote.brand?.website ?? null,
  };
}
