import * as z4 from "zod/v4";
import {
  OpportunityAreaSchema,
  type Company,
  type CompanyProfile,
  type Competitor,
  type Finding,
  type ResearchSource,
  type ServiceRecommendation,
} from "@agency/core";
import { generateStructured, UNTRUSTED_DATA_POLICY, wrapUntrusted } from "@agency/integrations";
import { newId, truncate } from "@agency/shared";
import type { DetectedSignal, ObservedFeature } from "./signals";

/**
 * AI-VIRKSOMHEDSANALYSE (Claude)
 * Claude modtager registerdata, kildeuddrag og de deterministisk beregnede
 * signaler/anbefalinger. Output valideres, og påstande uden gyldige kilder
 * nedgraderes — AI'en kan ikke skabe "fakta" uden kildehenvisning.
 */

const Claim = z4.object({
  text: z4.string(),
  classification: z4.enum(["fact", "assessment", "hypothesis"]),
  sourceIds: z4.array(z4.string()),
});

export const ClaudeAnalysisSchema = z4.object({
  summary: z4.string(),
  profile: z4.object({
    activities: z4.array(Claim),
    productsAndServices: z4.array(Claim),
    targetGroups: z4.array(Claim),
    businessModel: z4.array(Claim),
    digitalPresence: z4.array(Claim),
    strengths: z4.array(Claim),
    weaknesses: z4.array(Claim),
  }),
  competitors: z4.array(
    z4.object({
      name: z4.string(),
      url: z4.string().nullable(),
      observedFeatures: z4.array(z4.string()),
      comparison: z4.string(),
      sourceIds: z4.array(z4.string()),
    }),
  ),
  opportunityNotes: z4.array(
    z4.object({
      area: z4.enum(OpportunityAreaSchema.options),
      description: z4.string(),
      classification: z4.enum(["assessment", "hypothesis"]),
      sourceIds: z4.array(z4.string()),
    }),
  ),
  recommendationNotes: z4.array(
    z4.object({
      catalogItemId: z4.string(),
      relevance: z4.string(),
    }),
  ),
});
export type ClaudeAnalysis = z4.infer<typeof ClaudeAnalysisSchema>;

const SYSTEM_PROMPT = `Du er senior forretningsanalytiker i et dansk AI-bureau. Du analyserer en potentiel kundes virksomhed ud fra de kilder, du får udleveret, og skriver på professionelt dansk.

Regler:
- Brug KUN oplysninger fra de udleverede kilder og registerdata. Opfind aldrig tal, besparelser, omsætningsforbedringer, kunder, konkurrenter eller konkrete problemer.
- Hver påstand skal klassificeres: "fact" (står direkte i en kilde — angiv kildens id i sourceIds), "assessment" (din vurdering på baggrund af kilderne — angiv de kilder, vurderingen bygger på), "hypothesis" (antagelse, der skal verificeres med virksomheden).
- Konkurrenter må kun nævnes, hvis de fremgår af en udleveret kilde; angiv kildens id.
- Hvis kilderne er utilstrækkelige, så sig det hellere end at gætte.
- Ingen garantier eller løfter om resultater.
- ${UNTRUSTED_DATA_POLICY}`;

export interface ClaudeAnalysisInput {
  company: Company;
  sources: ResearchSource[];
  features: ObservedFeature[];
  signals: DetectedSignal[];
  recommendations: ServiceRecommendation[];
}

export function buildClaudePrompt(input: ClaudeAnalysisInput): string {
  const { company } = input;
  const registry = {
    navn: company.name,
    cvr: company.cvr,
    branche: company.industry,
    virksomhedsform: company.companyForm?.text ?? null,
    status: company.status,
    stiftet: company.foundedAt,
    ansatte: company.employees,
    adresse: company.address,
    hjemmeside: company.contact.website,
  };
  const sources = input.sources.map((s) => wrapUntrusted(s.id, `${s.kind}: ${s.title}`, truncate(s.excerpt, 3000))).join("\n\n");
  const signals = input.signals.map((s) => `- [${s.classification}] ${s.label}: ${s.evidence} (kilder: ${s.sourceIds.join(", ")})`).join("\n");
  const features = input.features.map((f) => `- ${f.label}: ${f.evidence} (kilder: ${f.sourceIds.join(", ")})`).join("\n");
  const recs = input.recommendations
    .map((r) => `- ${r.catalogItemId}: ${r.serviceName} (score ${r.score.total}) — ${r.relevance}`)
    .join("\n");

  return `Analysér virksomheden og returnér JSON i det angivne format.

## Registerdata (verificeret, kilde-id: ${input.sources.find((s) => s.kind === "registry")?.id ?? "ingen"})
${JSON.stringify(registry, null, 2)}

## Automatisk observerede digitale funktioner
${features || "- Ingen"}

## Automatisk observerede signaler
${signals || "- Ingen"}

## Foreslåede services (beregnet af platformen — skriv en kort, konkret relevansbegrundelse for hver, baseret på kilderne)
${recs || "- Ingen"}

## Kilder
${sources}

Krav til output:
- summary: 3-5 sætninger om virksomheden og de vigtigste muligheder.
- profile: 1-4 påstande pr. felt. Felter uden grundlag må være tomme lister.
- competitors: kun konkurrenter, der fremgår af kilderne.
- opportunityNotes: vurderinger af forbedringsområder, med kilder.
- recommendationNotes: én pr. foreslået service (brug præcis catalogItemId).`;
}

export function sanitizeClaudeAnalysis(
  raw: ClaudeAnalysis,
  input: ClaudeAnalysisInput,
): {
  summary: string;
  profile: CompanyProfile;
  competitors: Competitor[];
  opportunityNotes: ClaudeAnalysis["opportunityNotes"];
  relevanceByCatalogId: Map<string, string>;
  downgraded: number;
} {
  const validIds = new Set(input.sources.map((s) => s.id));
  let downgraded = 0;

  const toFinding = (claim: z4.infer<typeof Claim>): Finding | null => {
    const text = truncate(claim.text.trim(), 600);
    if (!text) return null;
    const sourceIds = claim.sourceIds.filter((id) => validIds.has(id));
    let classification = claim.classification;
    if (classification === "fact" && sourceIds.length === 0) {
      classification = "assessment";
      downgraded++;
    }
    return { id: newId("finding"), text, classification, sourceIds };
  };
  const list = (claims: z4.infer<typeof Claim>[]) => claims.slice(0, 6).map(toFinding).filter((x): x is Finding => x !== null);

  const profile: CompanyProfile = {
    activities: list(raw.profile.activities),
    productsAndServices: list(raw.profile.productsAndServices),
    targetGroups: list(raw.profile.targetGroups),
    businessModel: list(raw.profile.businessModel),
    digitalPresence: list(raw.profile.digitalPresence),
    strengths: list(raw.profile.strengths),
    weaknesses: list(raw.profile.weaknesses),
  };

  // Konkurrenter uden gyldig kilde kasseres — ingen opdigtede konkurrenter.
  const competitors: Competitor[] = raw.competitors
    .map((c) => ({ ...c, sourceIds: c.sourceIds.filter((id) => validIds.has(id)) }))
    .filter((c) => c.sourceIds.length > 0 && c.name.trim().length > 0)
    .slice(0, 6)
    .map((c) => ({
      id: newId("competitor"),
      name: truncate(c.name.trim(), 120),
      url: c.url && /^https?:\/\//.test(c.url) ? c.url : null,
      observedFeatures: c.observedFeatures.slice(0, 8).map((x) => truncate(x, 120)),
      comparison: truncate(c.comparison, 500),
      classification: "assessment" as const,
      sourceIds: c.sourceIds,
    }));

  const allowed = new Set(input.recommendations.map((r) => r.catalogItemId));
  const relevanceByCatalogId = new Map(
    raw.recommendationNotes.filter((n) => allowed.has(n.catalogItemId) && n.relevance.trim()).map((n) => [n.catalogItemId, truncate(n.relevance.trim(), 700)]),
  );

  const opportunityNotes = raw.opportunityNotes.map((n) => ({ ...n, sourceIds: n.sourceIds.filter((id) => validIds.has(id)), description: truncate(n.description, 700) }));

  return { summary: truncate(raw.summary.trim(), 1500), profile, competitors, opportunityNotes, relevanceByCatalogId, downgraded };
}

export async function runClaudeAnalysis(input: ClaudeAnalysisInput) {
  const result = await generateStructured({
    system: SYSTEM_PROMPT,
    prompt: buildClaudePrompt(input),
    schema: ClaudeAnalysisSchema,
    effort: "medium",
  });
  return { ...sanitizeClaudeAnalysis(result.data, input), model: result.model };
}
