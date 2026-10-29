import type { Quote, QuoteContent, QuoteVersion, ServiceCatalogItem } from "@agency/core";
import { formatDkk } from "@agency/shared";
import { calculateQuoteTotals } from "./pricing";
import { quoteRecipient } from "./recipient";

/**
 * SKABELONBASERET TILBUDSTEKST
 * Bruges når AI ikke er konfigureret. Teksten bygger udelukkende på data fra
 * research og tilbuddet — ingen garantier og ingen udokumenterede tal.
 */
export function buildTemplateContent(
  quote: Pick<Quote, "company" | "brand" | "researchSummary" | "researchInsights" | "mode" | "overallRecommendation" | "researchOpportunities">,
  version: Pick<QuoteVersion, "lineItems" | "discount" | "vatRate" | "validityDays">,
  catalog: readonly ServiceCatalogItem[],
): QuoteContent {
  const recipient = quoteRecipient(quote);
  const name = recipient.displayName;
  const items = version.lineItems;
  const services = items.filter((i) => i.kind !== "one_time");
  const oneTime = items.filter((i) => i.kind === "one_time");
  const totals = calculateQuoteTotals(version);
  const minWeeks = items.reduce((s, i) => s + i.estimatedWeeks.min, 0);
  const maxWeeks = items.reduce((s, i) => s + i.estimatedWeeks.max, 0);
  const benefits = Array.from(new Set(items.flatMap((i) => catalog.find((c) => c.id === i.catalogItemId)?.expectedBenefits ?? []))).slice(0, 8);
  const prerequisites = Array.from(new Set(items.flatMap((i) => catalog.find((c) => c.id === i.catalogItemId)?.prerequisites ?? []))).slice(0, 6);

  const opportunities =
    quote.researchOpportunities && quote.researchOpportunities.length > 0
      ? quote.researchOpportunities
          .slice(0, 6)
          .map((o) => `• ${o.title}: ${o.observed}${o.solution ? `\n  – Mulig løsning: ${o.solution}` : ""}`)
          .join("\n")
      : quote.researchInsights.length > 0
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

  const legalLine = recipient.legalName
    ? `Tilbuddet udstedes til ${recipient.legalName}${recipient.cvr ? ` (CVR ${recipient.cvr})` : ""}.`
    : "Den juridiske modtager (CVR) er endnu ikke bekræftet og aftales før accept.";

  return {
    title: `Tilbud på AI-løsninger til ${name}`,
    introduction: `Tak for muligheden for at præsentere et forslag til, hvordan AI og automatisering kan understøtte ${name}. Tilbuddet bygger på vores indledende research og beskriver de løsninger, vi anbefaler, de konkrete leverancer, en implementeringsplan og priser.${quote.overallRecommendation ? `\n\n${quote.overallRecommendation}` : ""}`,
    situation: quote.researchSummary
      ? `Baseret på vores research:\n${quote.researchSummary}`
      : `Vi har endnu ikke gennemført en detaljeret analyse af ${name}. Situationen afklares på et indledende møde.`,
    opportunities,
    solutions: [
      ...services.map((i) => `• ${i.name}: ${i.description}`),
      ...oneTime.map((i) => `• ${i.name} (engangsydelse): ${i.description}`),
    ].join("\n"),
    implementationPlan: `${plan}\n\nSamlet estimeret forløb: ${minWeeks}–${maxWeeks} uger, hvis løsningerne implementeres efter hinanden. Flere spor kan køres parallelt efter aftale. Forløbet starter med en opstartsworkshop, hvor forudsætninger og succeskriterier afklares.`,
    benefits:
      benefits.length > 0
        ? `${benefits.map((b) => `• ${b}`).join("\n")}\n\nFordelene er kvalitative forventninger. Den konkrete effekt afhænger af jeres processer, data og brug af løsningerne og måles i fællesskab efter implementering.`
        : "Forventede fordele afklares i fællesskab.",
    assumptions: [
      ...prerequisites.map((p) => `• ${p}`),
      "• Researchen bygger på offentligt tilgængelige oplysninger og skal bekræftes på et møde, før omfang og priser låses.",
      "• Der gives ingen garanti for besparelser eller omsætning; effekten afhænger af implementering og anvendelse.",
      `• ${legalLine}`,
    ].join("\n"),
    terms: [
      "• Alle priser er angivet i DKK ekskl. moms, medmindre andet er anført.",
      `• Implementering og engangsydelser faktureres med 50 % ved opstart og 50 % ved levering (${formatDkk(totals.implementation.exclVat)} ekskl. moms i alt).`,
      "• Abonnementer faktureres månedligt forud og kan opsiges med 3 måneders varsel.",
      `• Tilbuddet er gyldigt i ${version.validityDays} dage fra udstedelse.`,
      "• Behandling af personoplysninger reguleres i en særskilt databehandleraftale.",
      "• V1/V2-bemærkning: Priserne i dette tilbud er fiktive demopriser.",
    ].join("\n"),
    nextSteps: "1. Gennemgang af tilbuddet på et kort møde.\n2. Afklaring af forudsætninger og eventuelle justeringer.\n3. Accept af tilbud og planlægning af opstart.",
  };
}
