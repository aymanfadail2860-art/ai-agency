import {
  COMPLEXITY_LABELS,
  INDUSTRY_SEGMENT_LABELS,
  OPPORTUNITY_AREA_LABELS,
  type Finding,
  type IndustrySegment,
  type Opportunity,
  type OpportunityScore,
  type Priority,
  type ScoreCriterion,
  type ServiceCatalogItem,
  type ServiceRecommendation,
} from "@agency/core";
import { newId } from "@agency/shared";
import type { DetectedSignal } from "./signals";

/**
 * ANBEFALINGSMOTOR OG AI OPPORTUNITY SCORE (V2)
 * ---------------------------------------------
 * Scoren (0-100) er et vægtet gennemsnit af fire gennemsigtige kriterier:
 *
 *  - relevance (30 %): branchefit kombineret med observerede behovssignaler
 *  - business_value (25 %): servicens typiske forretningsværdi, når behovet er dokumenteret
 *  - evidence (25 %): antal og styrke af kilder bag signalerne
 *  - implementation_ease (20 %): omvendt implementeringskompleksitet
 *
 * Scoren er deterministisk, reproducerbar og ikke et økonomisk afkast. AI kan
 * forbedre formuleringer, men ændrer aldrig scoren.
 */

export const SCORE_WEIGHTS = {
  relevance: 0.3,
  business_value: 0.25,
  evidence: 0.25,
  implementation_ease: 0.2,
} as const;

export const SCORE_METHOD =
  "Vægtet gennemsnit: relevans 30 %, sandsynlig forretningsværdi 25 %, dokumentationens styrke 25 %, implementerbarhed 20 %. Scoren er en prioritering — ikke et garanteret afkast.";

const EASE: Record<ServiceCatalogItem["complexity"], number> = { low: 90, medium: 60, high: 30 };

/** Gør første bogstav småt, men bevarer forkortelser som "AI" og "CRM". */
function lowerFirst(text: string): string {
  return /^[A-ZÆØÅ]{2}/.test(text) ? text : text.charAt(0).toLowerCase() + text.slice(1);
}

export interface ScoreInput {
  item: ServiceCatalogItem;
  segment: IndustrySegment;
  matchedSignals: DetectedSignal[];
}

export function scoreService({ item, segment, matchedSignals }: ScoreInput): OpportunityScore {
  const fit = item.industryFit[segment] ?? 0.4;
  const needed = Math.min(2, Math.max(1, item.signals.length));
  const gap = Math.min(1, matchedSignals.length / needed);
  const factSignals = matchedSignals.filter((s) => s.classification === "fact").length;
  const distinctSources = new Set(matchedSignals.flatMap((s) => s.sourceIds)).size;

  const relevance = Math.round(fit * 60 + gap * 40);
  const valueBase = item.valueBase ?? 55;
  const externalFact = matchedSignals.some((s) => s.classification === "fact") ? 10 : 0;
  const businessValue = Math.min(100, Math.round(valueBase * (0.6 + 0.4 * gap) + externalFact));
  const evidence = matchedSignals.length === 0 ? 15 : Math.min(100, 35 + distinctSources * 12 + factSignals * 12);

  const criteria: ScoreCriterion[] = [
    {
      key: "relevance",
      label: "Relevans",
      weight: SCORE_WEIGHTS.relevance,
      value: relevance,
      rationale:
        matchedSignals.length > 0
          ? `Branchefit for "${INDUSTRY_SEGMENT_LABELS[segment]}" (${Math.round(fit * 100)}) og ${matchedSignals.length} af ${item.signals.length} behovssignaler observeret: ${matchedSignals.map((s) => s.label.toLowerCase()).join("; ")}.`
          : `Kun branchefit for "${INDUSTRY_SEGMENT_LABELS[segment]}" (${Math.round(fit * 100)}); ingen behovssignaler observeret.`,
    },
    {
      key: "business_value",
      label: "Sandsynlig forretningsværdi",
      weight: SCORE_WEIGHTS.business_value,
      value: businessValue,
      rationale: `Kvalitativ vurdering af servicens typiske værdi (${valueBase}/100), justeret efter hvor godt behovet er dokumenteret${externalFact ? " og eksterne fakta (fx anmeldelser/stillingsopslag)" : ""}. Ikke et beregnet afkast.`,
    },
    {
      key: "evidence",
      label: "Dokumentationens styrke",
      weight: SCORE_WEIGHTS.evidence,
      value: evidence,
      rationale:
        matchedSignals.length > 0
          ? `${distinctSources} kilde(r) understøtter signalerne, heraf ${factSignals} direkte observation(er) af fakta.`
          : "Anbefalingen bygger alene på branche — svagt kildegrundlag.",
    },
    {
      key: "implementation_ease",
      label: "Implementerbarhed",
      weight: SCORE_WEIGHTS.implementation_ease,
      value: EASE[item.complexity],
      rationale: `Kompleksitet: ${COMPLEXITY_LABELS[item.complexity].toLowerCase()} (${item.estimatedWeeks.min}-${item.estimatedWeeks.max} uger).`,
    },
  ];

  const total = Math.round(criteria.reduce((sum, c) => sum + c.value * c.weight, 0));
  return { total: Math.max(0, Math.min(100, total)), criteria, method: SCORE_METHOD };
}

export function priorityForScore(total: number): Priority {
  if (total >= 70) return "high";
  if (total >= 55) return "medium";
  return "low";
}

export interface RecommendInput {
  brandName: string;
  industryText: string | null;
  segment: IndustrySegment;
  segmentBasis: "registry" | "website" | "unknown";
  catalog: readonly ServiceCatalogItem[];
  signals: DetectedSignal[];
  /** Kilde for branchen (CVR-register eller hjemmeside), hvis kendt. */
  basisSourceIds: string[];
  limitations: string[];
  maxRecommendations?: number;
}

function finding(text: string, classification: Finding["classification"], sourceIds: string[]): Finding {
  return { id: newId("finding"), text, classification, sourceIds };
}

const SIGNAL_QUESTIONS: Partial<Record<DetectedSignal["key"], string>> = {
  no_online_booking: "Vi kunne ikke se online booking på hjemmesiden — tilbyder I booking et andet sted, fx via telefon eller en app?",
  no_chat_widget: "Vi kunne ikke se en chatfunktion — hvordan får besøgende i dag hurtige svar uden for åbningstid?",
  phone_centric_contact: "Hvor stor en del af jeres kundekontakt foregår via telefon?",
  review_mentions_response_time: "Anmeldelser nævner svartid — genkender I det, og hvad er årsagen?",
  hiring_admin: "I søger administrativ hjælp — hvilke opgaver skal den nye medarbejder primært løse?",
  hiring_customer_service: "I søger kundeservicefolk — hvilke henvendelser fylder mest?",
  hiring_sales: "I søger sælgere — hvordan ser jeres salgsproces ud fra lead til ordre?",
  has_ecommerce: "Hvilke systemer bruger webshoppen til ordrer, lager og økonomi?",
};

export function buildRecommendations(input: RecommendInput): ServiceRecommendation[] {
  const { catalog, signals, segment } = input;
  const max = Math.min(10, input.maxRecommendations ?? 10);
  const industryText = input.industryText ? `"${input.industryText}"` : `segmentet "${INDUSTRY_SEGMENT_LABELS[segment]}"`;

  const candidates = catalog.map((item) => {
    const matched = signals.filter((s) => item.signals.includes(s.key));
    return { item, matched, score: scoreService({ item, segment, matchedSignals: matched }), fit: item.industryFit[segment] ?? 0 };
  });

  // Kvalitet frem for antal: dokumenterede behov først; branchebaserede hypoteser kun med høj branchefit.
  const documented = candidates.filter((c) => c.matched.length > 0 && c.score.total >= 45 && c.fit >= 0.35);
  const hypotheses = candidates.filter((c) => c.matched.length === 0 && c.score.total >= 45 && c.fit >= (segment === "other" ? 2 : 0.8));
  const eligible = [...documented, ...hypotheses].sort((a, b) => b.score.total - a.score.total).slice(0, max);

  return eligible.map(({ item, matched, score }) => {
    const findings: Finding[] = [];
    if (input.industryText && input.basisSourceIds.length > 0) {
      findings.push(finding(`Branche: ${input.industryText}${input.segmentBasis === "website" ? " (vurderet ud fra hjemmesiden)" : ""}.`, input.segmentBasis === "registry" ? "fact" : "assessment", input.basisSourceIds));
    }
    findings.push(...matched.map((s) => finding(s.evidence, s.classification, s.sourceIds)));
    if (matched.length === 0) {
      findings.push(finding("Behovet er ikke observeret i kilderne. Anbefalingen bygger på branchen og skal afklares med virksomheden.", "hypothesis", input.basisSourceIds));
    }

    const relevance =
      matched.length > 0
        ? `${input.brandName} arbejder inden for ${industryText}, hvor ${lowerFirst(item.name)} typisk er relevant. Researchen observerede: ${matched.map((s) => s.label.toLowerCase()).join("; ")}.`
        : `${input.brandName} arbejder inden for ${industryText}, hvor ${lowerFirst(item.name)} ofte er relevant. Der er ikke observeret konkrete signaler — relevansen er en hypotese.`;

    const questions = Array.from(new Set([...matched.map((s) => SIGNAL_QUESTIONS[s.key]).filter((q): q is string => Boolean(q)), ...(item.customerQuestions ?? [])])).slice(0, 5);

    const uncertainties = [
      "Omfanget af behovet (fx antal henvendelser eller timer brugt) er ikke kendt og skal afklares med virksomheden.",
      ...matched.filter((s) => s.classification === "assessment").map((s) => `Usikkert signal: ${s.label.toLowerCase()} er udledt af fravær på de undersøgte sider.`),
      ...input.limitations.slice(0, 2),
    ];

    return {
      id: newId("recommendation"),
      catalogItemId: item.id,
      serviceName: item.name,
      problem: item.problemStatement,
      relevance,
      findings,
      expectedBenefits: [...item.expectedBenefits],
      complexity: item.complexity,
      priority: priorityForScore(score.total),
      prerequisites: [...item.prerequisites],
      uncertainties,
      score,
      proposedSolution: item.proposedSolution ?? item.description,
      businessBenefit: item.expectedBenefits.join("; "),
      customerQuestions: questions,
      selected: false,
      editedDescription: null,
      note: null,
    };
  });
}

/** Samler anbefalinger i forbedringsområder: observation → problem → løsning → værdi → manglende oplysninger. */
export function buildOpportunities(recommendations: ServiceRecommendation[], catalog: readonly ServiceCatalogItem[]): Opportunity[] {
  const byArea = new Map<string, ServiceRecommendation[]>();
  for (const rec of recommendations) {
    const area = catalog.find((c) => c.id === rec.catalogItemId)?.opportunityArea;
    if (!area) continue;
    byArea.set(area, [...(byArea.get(area) ?? []), rec]);
  }
  return Array.from(byArea.entries())
    .map(([area, recs]) => {
      const best = recs.reduce((a, b) => (b.score.total > a.score.total ? b : a));
      const observed = best.findings.filter((f) => f.classification !== "hypothesis" && !f.text.startsWith("Branche:"));
      const sourceIds = Array.from(new Set(observed.flatMap((f) => f.sourceIds)));
      const observedText = observed.length > 0 ? observed.map((f) => f.text).join(" ") : "Intet konkret observeret — området er udledt af branchen.";
      return {
        id: newId("opportunity"),
        area: area as Opportunity["area"],
        title: OPPORTUNITY_AREA_LABELS[area as Opportunity["area"]],
        description: `${observedText} Mulige løsninger: ${recs.map((r) => r.serviceName).join(", ")}.`,
        observed: observedText,
        potentialProblem: `Kan indikere: ${lowerFirst(best.problem)}`,
        solution: best.proposedSolution ?? best.serviceName,
        value: best.expectedBenefits.join("; "),
        missingInformation: (best.customerQuestions ?? []).slice(0, 3),
        classification: observed.length > 0 ? ("assessment" as const) : ("hypothesis" as const),
        sourceIds,
        score: best.score,
      };
    })
    .sort((a, b) => b.score.total - a.score.total);
}

/** Spørgsmål til kundemødet — samlet og uden dubletter. */
export function buildMeetingQuestions(recommendations: ServiceRecommendation[], extra: string[] = []): string[] {
  const top = [...recommendations].sort((a, b) => b.score.total - a.score.total).slice(0, 5);
  return Array.from(new Set([...extra, ...top.flatMap((r) => (r.customerQuestions ?? []).slice(0, 2))])).slice(0, 10);
}

export function buildOverallRecommendation(brandName: string, recommendations: ServiceRecommendation[]): string {
  if (recommendations.length === 0) return `Datagrundlaget er for begrænset til at anbefale konkrete services til ${brandName}. Næste skridt bør være en indledende samtale.`;
  const top = [...recommendations].sort((a, b) => b.score.total - a.score.total);
  const first = top.slice(0, 2).map((r) => lowerFirst(r.serviceName));
  const later = top.slice(2, 4).map((r) => lowerFirst(r.serviceName));
  return `Vi anbefaler at starte med ${first.join(" samt ")}, som har det stærkeste grundlag i researchen${later.length ? `. Derefter bør ${later.join(" samt ")} vurderes` : ""}. Behovenes omfang skal bekræftes på et kundemøde, før der kan sættes forventninger til effekt.`;
}
