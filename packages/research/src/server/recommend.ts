import {
  COMPLEXITY_LABELS,
  INDUSTRY_SEGMENT_LABELS,
  OPPORTUNITY_AREA_LABELS,
  type Company,
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
 * ANBEFALINGSMOTOR OG AI OPPORTUNITY SCORE
 * ----------------------------------------
 * Scoren (0-100) er et vægtet gennemsnit af fire gennemsigtige kriterier:
 *
 *  - observed_gap (35 %): andel af servicens behovssignaler, som blev observeret
 *  - industry_fit (30 %): servicens relevans for virksomhedens branchesegment
 *  - evidence (20 %): antal uafhængige kilder bag de observerede signaler
 *  - implementation_ease (15 %): omvendt implementeringskompleksitet
 *
 * Scoren er deterministisk og reproducerbar. AI kan forbedre formuleringer,
 * men ændrer aldrig scoren.
 */

/** Gør første bogstav småt, men bevarer forkortelser som "AI" og "CRM". */
function lowerFirst(text: string): string {
  return /^[A-ZÆØÅ]{2}/.test(text) ? text : text.charAt(0).toLowerCase() + text.slice(1);
}

export const SCORE_WEIGHTS = {
  observed_gap: 0.35,
  industry_fit: 0.3,
  evidence: 0.2,
  implementation_ease: 0.15,
} as const;

export const SCORE_METHOD =
  "Vægtet gennemsnit: observerede behovssignaler 35 %, branchefit 30 %, kildegrundlag 20 %, implementeringsenkelhed 15 %.";

const EASE: Record<ServiceCatalogItem["complexity"], number> = { low: 90, medium: 60, high: 30 };

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
  const evidence =
    matchedSignals.length === 0 ? 15 : Math.min(100, 35 + distinctSources * 15 + factSignals * 10);

  const criteria: ScoreCriterion[] = [
    {
      key: "observed_gap",
      label: "Observerede behovssignaler",
      weight: SCORE_WEIGHTS.observed_gap,
      value: Math.round(gap * 100),
      rationale:
        matchedSignals.length > 0
          ? `${matchedSignals.length} af servicens ${item.signals.length} behovssignaler blev observeret: ${matchedSignals.map((s) => s.label.toLowerCase()).join("; ")}.`
          : "Ingen af servicens behovssignaler blev observeret i kilderne.",
    },
    {
      key: "industry_fit",
      label: "Branchefit",
      weight: SCORE_WEIGHTS.industry_fit,
      value: Math.round(fit * 100),
      rationale: `Katalogets relevansvurdering for segmentet "${INDUSTRY_SEGMENT_LABELS[segment]}".`,
    },
    {
      key: "evidence",
      label: "Kildegrundlag",
      weight: SCORE_WEIGHTS.evidence,
      value: evidence,
      rationale:
        matchedSignals.length > 0
          ? `${distinctSources} kilde(r) understøtter signalerne, heraf ${factSignals} direkte observation(er).`
          : "Anbefalingen bygger alene på branche — lavt kildegrundlag.",
    },
    {
      key: "implementation_ease",
      label: "Implementeringsenkelhed",
      weight: SCORE_WEIGHTS.implementation_ease,
      value: EASE[item.complexity],
      rationale: `Kompleksitet: ${COMPLEXITY_LABELS[item.complexity].toLowerCase()}.`,
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
  company: Company;
  segment: IndustrySegment;
  catalog: readonly ServiceCatalogItem[];
  signals: DetectedSignal[];
  registrySourceId: string;
  limitations: string[];
  maxRecommendations?: number;
}

function finding(text: string, classification: Finding["classification"], sourceIds: string[]): Finding {
  return { id: newId("finding"), text, classification, sourceIds };
}

export function buildRecommendations(input: RecommendInput): ServiceRecommendation[] {
  const { company, segment, catalog, signals, registrySourceId } = input;
  const industryText = company.industry?.text ? `"${company.industry.text}"` : "ukendt branche";

  const candidates = catalog.map((item) => {
    const matched = signals.filter((s) => item.signals.includes(s.key));
    const score = scoreService({ item, segment, matchedSignals: matched });
    return { item, matched, score };
  });

  const eligible = candidates
    .filter(({ matched, score, item }) => {
      const fit = item.industryFit[segment] ?? 0;
      // Services med meget lav branchefit anbefales ikke, selv om et signal matcher.
      return (matched.length > 0 && score.total >= 45 && fit >= 0.35) || fit >= 0.85;
    })
    .sort((a, b) => b.score.total - a.score.total)
    .slice(0, input.maxRecommendations ?? 6);

  return eligible.map(({ item, matched, score }) => {
    const findings: Finding[] = [
      finding(`Registreret branche: ${company.industry?.text ?? "ikke oplyst"}${company.industry?.code ? ` (${company.industry.code})` : ""}.`, "fact", [registrySourceId]),
      ...matched.map((s) => finding(s.evidence, s.classification, s.sourceIds)),
    ];
    if (matched.length === 0) {
      findings.push(
        finding(
          `Anbefalingen bygger på branchen alene. Behovet er ikke observeret i kilderne og skal afklares med virksomheden.`,
          "hypothesis",
          [registrySourceId],
        ),
      );
    }

    const relevance =
      matched.length > 0
        ? `Virksomheden er registreret under ${industryText}, hvor ${lowerFirst(item.name)} typisk er relevant. Researchen observerede: ${matched.map((s) => s.label.toLowerCase()).join("; ")}.`
        : `Virksomheden er registreret under ${industryText}, hvor ${lowerFirst(item.name)} ofte er relevant. Der er ikke observeret konkrete signaler — relevansen er en hypotese.`;

    const uncertainties = [
      "Omfanget af det adresserede behov (fx antal henvendelser eller timer brugt) er ikke kendt og skal afklares med virksomheden.",
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
      selected: false,
      editedDescription: null,
      note: null,
    };
  });
}

/** Samler anbefalinger i forbedringsområder (en mulighed pr. område). */
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
      const observed = best.findings.filter((f) => f.classification !== "hypothesis" && !f.text.startsWith("Registreret branche"));
      const sourceIds = Array.from(new Set(observed.flatMap((f) => f.sourceIds)));
      return {
        id: newId("opportunity"),
        area: area as Opportunity["area"],
        title: OPPORTUNITY_AREA_LABELS[area as Opportunity["area"]],
        description:
          observed.length > 0
            ? `${observed.map((f) => f.text).join(" ")} Mulige løsninger: ${recs.map((r) => r.serviceName).join(", ")}.`
            : `Branchen indikerer et potentiale, men det er ikke observeret i kilderne. Mulige løsninger: ${recs.map((r) => r.serviceName).join(", ")}.`,
        classification: observed.length > 0 ? ("assessment" as const) : ("hypothesis" as const),
        sourceIds,
        score: best.score,
      };
    })
    .sort((a, b) => b.score.total - a.score.total);
}
