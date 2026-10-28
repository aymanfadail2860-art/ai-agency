import type { Quote, QuoteContent, QuoteVersion, ServiceCatalogItem } from "@agency/core";
import { formatDkk } from "@agency/shared";
import { calculateQuoteTotals } from "./pricing";

/**
 * SKABELONBASERET TILBUDSTEKST
 * Bruges når AI ikke er konfigureret. Teksten bygger udelukkende på data fra
 * research og tilbuddet — ingen garantier og ingen udokumenterede tal.
 */
export function buildTemplateContent(
  quote: Pick<Quote, "company" | "researchSummary" | "researchInsights" | "mode">,
  version: Pick<QuoteVersion, "lineItems" | "discount" | "vatRate" | "validityDays">,
  catalog: readonly ServiceCatalogItem[],
): QuoteContent {
  const name = quote.company.name;
  const items = version.lineItems;
  const totals = calculateQuoteTotals(version);
  const minWeeks = items.reduce((s, i) => s + i.estimatedWeeks.min, 0);
  const maxWeeks = items.reduce((s, i) => s + i.estimatedWeeks.max, 0);
  const benefits = Array.from(
    new Set(items.flatMap((i) => catalog.find((c) => c.id === i.catalogItemId)?.expectedBenefits ?? [])),
  ).slice(0, 8);

  const opportunities =
    quote.researchInsights.length > 0
      ? quote.researchInsights
          .map((ins) => {
            const findings = ins.keyFindings.slice(0, 2).map((f) => `  – ${f}`).join("\n");
            return `• ${ins.serviceName}: ${ins.rationale}${findings ? `\n${findings}` : ""}`;
          })
          .join("\n")
      : "Mulighederne afklares nærmere i dialog med jer.";

  let week = 1;
  const plan = items
    .map((i) => {
      const line = `• Uge ${week}–${week + i.estimatedWeeks.max - 1}: ${i.name} (estimeret ${i.estimatedWeeks.min}–${i.estimatedWeeks.max} uger)`;
      week += i.estimatedWeeks.max;
      return line;
    })
    .join("\n");

  return {
    title: `Tilbud på AI-løsninger til ${name}`,
    introduction: `Tak for muligheden for at præsentere et forslag til, hvordan AI og automatisering kan understøtte ${name}. Tilbuddet bygger på vores indledende research og beskriver de løsninger, vi anbefaler, de konkrete leverancer, en implementeringsplan og priser.`,
    situation: quote.researchSummary
      ? `Baseret på vores research:\n${quote.researchSummary}`
      : `Vi har endnu ikke gennemført en detaljeret analyse af ${name}. Situationen afklares på et indledende møde.`,
    opportunities,
    solutions: items.map((i) => `• ${i.name}: ${i.description}`).join("\n"),
    implementationPlan: `${plan}\n\nSamlet estimeret forløb: ${minWeeks}–${maxWeeks} uger, hvis løsningerne implementeres efter hinanden. Flere spor kan køres parallelt efter aftale. Forløbet starter med en opstartsworkshop, hvor forudsætninger og succeskriterier afklares.`,
    benefits:
      benefits.length > 0
        ? `${benefits.map((b) => `• ${b}`).join("\n")}\n\nFordelene er kvalitative forventninger. Den konkrete effekt afhænger af jeres processer, data og brug af løsningerne og måles i fællesskab efter implementering.`
        : "Forventede fordele afklares i fællesskab.",
    terms: [
      "• Alle priser er angivet i DKK ekskl. moms, medmindre andet er anført.",
      `• Implementering faktureres med 50 % ved opstart og 50 % ved levering (${formatDkk(totals.implementation.exclVat)} ekskl. moms i alt).`,
      "• Abonnementer faktureres månedligt forud og kan opsiges med 3 måneders varsel.",
      `• Tilbuddet er gyldigt i ${version.validityDays} dage fra udstedelse.`,
      "• Behandling af personoplysninger reguleres i en særskilt databehandleraftale.",
      "• V1-bemærkning: Priserne i dette tilbud er fiktive demopriser.",
    ].join("\n"),
    nextSteps: "1. Gennemgang af tilbuddet på et kort møde.\n2. Afklaring af forudsætninger og eventuelle justeringer.\n3. Accept af tilbud og planlægning af opstart.",
  };
}
