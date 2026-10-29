import * as z4 from "zod/v4";
import type { Quote, QuoteContent, QuoteVersion } from "@agency/core";
import { generateStructured, UNTRUSTED_DATA_POLICY, wrapUntrusted } from "@agency/integrations";
import { truncate } from "@agency/shared";
import { quoteRecipient } from "../recipient";

const QuoteContentAiSchema = z4.object({
  title: z4.string(),
  introduction: z4.string(),
  situation: z4.string(),
  opportunities: z4.string(),
  solutions: z4.string(),
  implementationPlan: z4.string(),
  benefits: z4.string(),
  terms: z4.string(),
  nextSteps: z4.string(),
  assumptions: z4.string(),
});

const SYSTEM = `Du skriver professionelle, personlige tilbud på dansk for et AI-bureau.
Regler:
- Brug kun oplysninger fra researchresuméet, indsigterne og tilbudslinjerne. Opfind ikke tal, besparelser, procenter, kunder eller problemer.
- Ingen garantier eller løfter om resultater. Fordele formuleres som kvalitative forventninger.
- Nævn ikke konkrete priser i teksten — de vises i prisoversigten.
- Skriv klart og respektfuldt til virksomhedens ledelse. Brug punktopstillinger med "• " hvor det er naturligt.
- Vilkår skal indeholde: priser ekskl. moms, betaling 50/50 for implementering, månedlig fakturering af abonnement med 3 måneders opsigelse, gyldighed i det angivne antal dage, databehandleraftale, og at priserne er fiktive demopriser.
- "assumptions" (Forudsætninger og forbehold): hvad tilbuddet forudsætter (adgang, data, beslutninger), at researchen bygger på offentlige oplysninger, og at der ikke gives garantier for effekt. Er den juridiske modtager ukendt, skal det fremgå.
- Tilbuddet skal være individuelt: brug brandets navn, de konkrete observationer og den samlede anbefaling — undgå generiske formuleringer.
- ${UNTRUSTED_DATA_POLICY}`;

export async function generateClaudeContent(quote: Quote, version: QuoteVersion): Promise<{ content: QuoteContent; model: string }> {
  const lines = version.lineItems
    .map((l) => `- ${l.name}: ${l.description}\n  Leverancer: ${l.deliverables.join("; ")}\n  Estimeret tid: ${l.estimatedWeeks.min}-${l.estimatedWeeks.max} uger${l.addOns.length ? `\n  Tilvalg: ${l.addOns.map((a) => a.name).join(", ")}` : ""}`)
    .join("\n");
  const insights = quote.researchInsights
    .map((i) => `- ${i.serviceName}: ${i.rationale}${i.keyFindings.length ? ` | Fund: ${i.keyFindings.join(" / ")}` : ""}`)
    .join("\n");
  const r = quoteRecipient(quote);
  const opportunities = (quote.researchOpportunities ?? []).map((o) => `- ${o.title}: ${o.observed} → ${o.solution}`).join("\n");
  const prompt = `Skriv tilbudsteksten til brandet ${r.displayName}${r.legalName ? ` (juridisk enhed: ${r.legalName}${r.cvr ? `, CVR ${r.cvr}` : ""})` : " (juridisk modtager ikke bekræftet)"}.

${wrapUntrusted("research", "Researchresumé, muligheder og indsigter", truncate(`${quote.researchSummary}\n\nSamlet anbefaling: ${quote.overallRecommendation ?? ""}\n\nMuligheder:\n${opportunities}\n\nServices:\n${insights}`, 8000))}

Tilbudslinjer:
${lines}

Gyldighed: ${version.validityDays} dage.
Særlige vilkår (gengives ikke, vises separat): ${version.specialTerms || "ingen"}.
Brugerens noter: ${truncate(quote.userNotes, 1000) || "ingen"}.`;

  const result = await generateStructured({ system: SYSTEM, prompt, schema: QuoteContentAiSchema, effort: "medium", maxTokens: 12000 });
  const clean = (s: string) => truncate(s.trim(), 4000);
  const c = result.data;
  return {
    model: result.model,
    content: {
      title: truncate(c.title.trim(), 200),
      introduction: clean(c.introduction),
      situation: clean(c.situation),
      opportunities: clean(c.opportunities),
      solutions: clean(c.solutions),
      implementationPlan: clean(c.implementationPlan),
      benefits: clean(c.benefits),
      terms: clean(c.terms),
      nextSteps: clean(c.nextSteps),
      assumptions: clean(c.assumptions),
    },
  };
}
