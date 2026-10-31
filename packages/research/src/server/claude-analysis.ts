import * as z4 from "zod/v4";
import {
  OpportunityAreaSchema,
  type Company,
  type CompanyProfile,
  type Competitor,
  type Finding,
  type ResearchSource,
  type ServiceRecommendation,
  type WebsiteAnalysis,
} from "@agency/core";
import { generateStructured, UNTRUSTED_DATA_POLICY, wrapUntrusted } from "@agency/integrations";
import { newId, truncate } from "@agency/shared";
import type { DetectedSignal } from "./signals";

/**
 * AI-VIRKSOMHEDSANALYSE (Claude, V2)
 * Claude modtager strukturerede researchresultater og analyserer dem som en
 * erfaren B2B-konsulent. Output valideres; påstande uden gyldige kilder
 * nedgraderes, og konkurrenter uden kilde kasseres. Scoren beregnes ikke af AI.
 */

const Claim = z4.object({
  text: z4.string(),
  classification: z4.enum(["fact", "assessment", "hypothesis", "unknown"]),
  sourceIds: z4.array(z4.string()),
});

export const ClaudeAnalysisSchema = z4.object({
  summary: z4.string(),
  brandUnderstanding: z4.object({
    whatTheyDo: z4.array(Claim),
    valueCreation: z4.array(Claim),
    customers: z4.array(Claim),
    contactChannels: z4.array(Claim),
    digitalProcesses: z4.array(Claim),
    productsAndServices: z4.array(Claim),
    businessModel: z4.array(Claim),
    strengths: z4.array(Claim),
    weaknesses: z4.array(Claim),
  }),
  opportunities: z4.array(
    z4.object({
      area: z4.enum(OpportunityAreaSchema.options),
      observed: z4.string(),
      potentialProblem: z4.string(),
      solution: z4.string(),
      value: z4.string(),
      missingInformation: z4.array(z4.string()),
      classification: z4.enum(["assessment", "hypothesis"]),
      sourceIds: z4.array(z4.string()),
    }),
  ),
  recommendationNotes: z4.array(
    z4.object({
      catalogItemId: z4.string(),
      relevance: z4.string(),
      proposedSolution: z4.string(),
      businessBenefit: z4.string(),
      uncertainties: z4.array(z4.string()),
      customerQuestions: z4.array(z4.string()),
    }),
  ),
  competitors: z4.array(
    z4.object({
      name: z4.string(),
      url: z4.string().nullable(),
      observedFeatures: z4.array(z4.string()),
      comparison: z4.string(),
      sourceIds: z4.array(z4.string()),
    }),
  ),
  digitalMaturityRationale: z4.string(),
  meetingQuestions: z4.array(z4.string()),
  overallRecommendation: z4.string(),
});
export type ClaudeAnalysis = z4.infer<typeof ClaudeAnalysisSchema>;

const SYSTEM_PROMPT = `Du er en erfaren B2B-konsulent i et dansk AI-bureau. Du analyserer et brand ud fra de kilder, du får udleveret, og identificerer konkrete, kommercielt relevante muligheder for AI, automatisering og software. Du skriver på professionelt dansk.

Regler:
- Brug KUN oplysninger fra de udleverede kilder og registerdata. Opfind aldrig omsætning, medarbejderantal, besparelser, kunder, interne arbejdsgange, systemer eller konkurrenter.
- Klassificér hver påstand: "fact" (står direkte i en kilde — angiv kildens id), "assessment" (din vurdering på baggrund af kilderne — angiv kilderne), "hypothesis" (antagelse, der skal verificeres med kunden), "unknown" (kan ikke afgøres ud fra kilderne).
- Manglende synlig funktionalitet på hjemmesiden er IKKE bevis for, at virksomheden mangler løsningen — formulér det som en hypotese eller et spørgsmål.
- Konkurrenter må kun nævnes, hvis de fremgår af en udleveret kilde. Konkludér aldrig noget om konkurrenters interne systemer.
- Ingen garantier, procenter eller beløb for effekt. Værdi beskrives kvalitativt.
- Undgå generiske anbefalinger: knyt hver mulighed til konkrete observationer.
- ${UNTRUSTED_DATA_POLICY}`;

export interface ClaudeAnalysisInput {
  brandName: string;
  websites: string[];
  legalEntity: Company | null;
  sources: ResearchSource[];
  websiteAnalysis: WebsiteAnalysis;
  signals: DetectedSignal[];
  recommendations: ServiceRecommendation[];
}

/** Begrænser datamængden til AI (AI_MAX_INPUT_CHARS, standard 60.000 tegn). */
function maxChars(): number {
  const v = Number(process.env.AI_MAX_INPUT_CHARS);
  return Number.isFinite(v) && v >= 10_000 ? v : 60_000;
}

export function buildClaudePrompt(input: ClaudeAnalysisInput): string {
  const { legalEntity } = input;
  const registry = legalEntity
    ? {
        navn: legalEntity.name,
        cvr: legalEntity.cvr,
        branche: legalEntity.industry,
        virksomhedsform: legalEntity.companyForm?.text ?? null,
        status: legalEntity.status,
        stiftet: legalEntity.foundedAt,
        ansatte: legalEntity.employees,
        adresse: legalEntity.address,
      }
    : "Ingen bekræftet juridisk enhed — analysér brandet ud fra hjemmeside og øvrige kilder.";
  const features = input.websiteAnalysis.features.map((f) => `- ${f.label}: ${f.status === "observed" ? "observeret" : f.status === "not_observed" ? "ikke observeret på de undersøgte sider" : "ukendt"} (${f.evidence})`).join("\n");
  const signals = input.signals.map((s) => `- [${s.classification}] ${s.label}: ${s.evidence} (kilder: ${s.sourceIds.join(", ")})`).join("\n");
  const recs = input.recommendations.map((r) => `- ${r.catalogItemId}: ${r.serviceName} (score ${r.score.total}) — ${r.relevance}`).join("\n");

  const budget = maxChars();
  const perSource = Math.max(800, Math.floor((budget * 0.7) / Math.max(1, Math.min(25, input.sources.length))));
  const sources = input.sources.slice(0, 25).map((s) => wrapUntrusted(s.id, `${s.kind}: ${s.title}`, truncate(s.excerpt, perSource))).join("\n\n");

  const prompt = `Analysér brandet "${input.brandName}" (${input.websites.join(", ") || "ingen hjemmeside"}) og returnér JSON i det angivne format.

## Juridisk enhed (verificeret registerdata)
${typeof registry === "string" ? registry : JSON.stringify(registry, null, 2)}

## Hjemmesidens digitale funktioner (automatisk opgjort)
${features || "- Hjemmesiden er ikke undersøgt"}

## Observerede signaler
${signals || "- Ingen"}

## Foreslåede services fra kataloget (scoren er beregnet af platformen og må ikke ændres)
${recs || "- Ingen"}

## Kilder
${sources}

Krav til output:
- summary: 3-5 sætninger om brandet og de vigtigste muligheder.
- brandUnderstanding: 1-4 påstande pr. felt; tomme lister er tilladt, når der ikke er grundlag.
- opportunities: konkrete muligheder inden for salg, marketing, kundeservice, administration, booking, interne arbejdsgange, data, rapportering, integration og AI-agenter — kun hvor kilderne giver grundlag.
- recommendationNotes: én pr. foreslået service (brug præcis catalogItemId) med konkret relevans, løsning, forretningsmæssig fordel (kvalitativt), usikkerheder og 2-4 spørgsmål til kunden.
- competitors: kun konkurrenter, der fremgår af kilderne.
- meetingQuestions: 5-10 skarpe spørgsmål til det første kundemøde.
- overallRecommendation: 2-4 sætninger om, hvor brandet bør starte og hvorfor.`;
  return prompt.length > budget ? prompt.slice(0, budget) : prompt;
}

export function sanitizeClaudeAnalysis(raw: ClaudeAnalysis, input: ClaudeAnalysisInput) {
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
  const list = (...groups: z4.infer<typeof Claim>[][]) => groups.flat().slice(0, 6).map(toFinding).filter((x): x is Finding => x !== null);
  const b = raw.brandUnderstanding;

  const profile: CompanyProfile = {
    activities: list(b.whatTheyDo, b.valueCreation),
    productsAndServices: list(b.productsAndServices),
    targetGroups: list(b.customers),
    businessModel: list(b.businessModel),
    digitalPresence: list(b.contactChannels, b.digitalProcesses),
    strengths: list(b.strengths),
    weaknesses: list(b.weaknesses),
  };

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
  const notesByCatalogId = new Map(
    raw.recommendationNotes
      .filter((n) => allowed.has(n.catalogItemId) && n.relevance.trim())
      .map((n) => [
        n.catalogItemId,
        {
          relevance: truncate(n.relevance.trim(), 700),
          proposedSolution: truncate(n.proposedSolution.trim(), 500),
          businessBenefit: truncate(n.businessBenefit.trim(), 500),
          uncertainties: n.uncertainties.slice(0, 4).map((u) => truncate(u, 300)),
          customerQuestions: n.customerQuestions.slice(0, 5).map((q) => truncate(q, 300)),
        },
      ]),
  );

  const opportunities = raw.opportunities.slice(0, 10).map((o) => ({
    ...o,
    observed: truncate(o.observed, 600),
    potentialProblem: truncate(o.potentialProblem, 500),
    solution: truncate(o.solution, 500),
    value: truncate(o.value, 500),
    missingInformation: o.missingInformation.slice(0, 4).map((m) => truncate(m, 300)),
    sourceIds: o.sourceIds.filter((id) => validIds.has(id)),
  }));

  return {
    summary: truncate(raw.summary.trim(), 1500),
    profile,
    competitors,
    opportunities,
    notesByCatalogId,
    digitalMaturityRationale: truncate(raw.digitalMaturityRationale.trim(), 800),
    meetingQuestions: raw.meetingQuestions.slice(0, 10).map((q) => truncate(q.trim(), 300)).filter(Boolean),
    overallRecommendation: truncate(raw.overallRecommendation.trim(), 1200),
    downgraded,
  };
}

export async function runClaudeAnalysis(input: ClaudeAnalysisInput) {
  const result = await generateStructured({
    system: SYSTEM_PROMPT,
    prompt: buildClaudePrompt(input),
    schema: ClaudeAnalysisSchema,
    effort: "medium",
  });
  return { ...sanitizeClaudeAnalysis(result.data, input), model: result.model, costUsd: result.estimatedCostUsd, inputTokens: result.inputTokens, outputTokens: result.outputTokens };
}
