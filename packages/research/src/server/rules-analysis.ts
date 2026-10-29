import {
  INDUSTRY_SEGMENT_LABELS,
  type Company,
  type CompanyProfile,
  type Competitor,
  type Finding,
  type IndustrySegment,
} from "@agency/core";
import { newId, truncate } from "@agency/shared";
import type { ObservedFeature, PageWithSource, SignalAnalysis } from "./signals";

/**
 * REGELBASERET ANALYSE
 * Bruges når ingen AI-nøgle er konfigureret. Alt indhold er afledt direkte af
 * kilderne; antagelser om målgruppe og forretningsmodel mærkes som hypoteser.
 */

const f = (text: string, classification: Finding["classification"], sourceIds: string[]): Finding => ({
  id: newId("finding"),
  text,
  classification,
  sourceIds,
});

const TARGET_GROUP_HYPOTHESES: Partial<Record<IndustrySegment, string>> = {
  trades: "Private husstande, boligforeninger og erhvervskunder i virksomhedens geografiske område.",
  health: "Private patienter/klienter i lokalområdet samt eventuelt forsikringsdækkede forløb.",
  beauty: "Private kunder i lokalområdet med tilbagevendende behandlinger.",
  retail: "Private forbrugere — i butik og eventuelt online.",
  ecommerce: "Private forbrugere, som handler online — nationalt og eventuelt internationalt.",
  hospitality: "Lokale gæster, turister og erhvervsarrangementer.",
  professional_services: "Erhvervskunder (SMV'er) og eventuelt private klienter.",
  real_estate: "Boligkøbere, sælgere, lejere og ejendomsinvestorer.",
  manufacturing: "Erhvervskunder (B2B), forhandlere og distributører.",
  transport: "Erhvervskunder med transport- og logistikbehov.",
  it: "Erhvervskunder med behov for IT-ydelser eller software.",
  auto: "Private bilejere og erhvervsflåder i lokalområdet.",
  fitness: "Private medlemmer i lokalområdet.",
  education: "Elever/kursister og eventuelt virksomheder, der efteruddanner medarbejdere.",
};

const BUSINESS_MODEL_HYPOTHESES: Partial<Record<IndustrySegment, string>> = {
  trades: "Opgave- og timebaseret fakturering, eventuelt suppleret med serviceaftaler.",
  health: "Betaling pr. behandling/konsultation, eventuelt med tilskud.",
  beauty: "Betaling pr. behandling samt produktsalg.",
  retail: "Varesalg med avance.",
  ecommerce: "Onlinesalg af varer med fragt- og returhåndtering.",
  hospitality: "Salg af overnatninger, måltider og arrangementer.",
  professional_services: "Time- eller projektbaseret rådgivning, eventuelt abonnementsaftaler.",
  real_estate: "Salærer, provision eller lejeindtægter.",
  manufacturing: "Produktion og salg af varer til erhvervskunder.",
  transport: "Fragt- og kontraktbaseret fakturering.",
  it: "Projekter, licenser og/eller abonnementer.",
  auto: "Værkstedsydelser, reservedele og eventuelt bilsalg.",
  fitness: "Medlemskaber og holdbetaling.",
  education: "Kursusgebyrer og/eller offentligt tilskud.",
};

export interface RulesAnalysisInput {
  brandName: string;
  /** V2: juridisk enhed er valgfri — kun bekræftede relationer bruges. */
  company: Company | null;
  segment: IndustrySegment;
  segmentBasis: "registry" | "website" | "unknown";
  registrySourceId: string | null;
  pages: PageWithSource[];
  analysis: SignalAnalysis;
  competitorPages: Array<{ sourceId: string; name: string; url: string; features: ObservedFeature[] }>;
}

export function buildRulesProfile(input: RulesAnalysisInput): CompanyProfile {
  const { company, segment, registrySourceId, pages, analysis } = input;
  const profile: CompanyProfile = {
    activities: [],
    productsAndServices: [],
    targetGroups: [],
    businessModel: [],
    digitalPresence: [],
    strengths: [],
    weaknesses: [],
  };
  const basis = registrySourceId ? [registrySourceId] : pages.slice(0, 1).map((p) => p.sourceId);

  if (company?.industry && registrySourceId) {
    profile.activities.push(
      f(`Registreret hovedbranche i CVR: ${company.industry.text}${company.industry.code ? ` (${company.industry.code})` : ""}.`, "fact", [registrySourceId]),
    );
  }
  if (company && registrySourceId && (company.companyForm || company.employees?.count != null)) {
    const parts = [
      company.companyForm ? `virksomhedsform: ${company.companyForm.text}` : null,
      company.employees?.count != null ? `${company.employees.count} ansatte (${company.employees.year ?? "seneste opgørelse"})` : company.employees?.interval ? `ansatte-interval ${company.employees.interval}` : null,
      company.foundedAt ? `stiftet ${company.foundedAt}` : null,
    ].filter(Boolean);
    profile.activities.push(f(`CVR oplyser ${parts.join(", ")}.`, "fact", [registrySourceId]));
  }

  const home = pages[0];
  if (home?.page.description) {
    profile.activities.push(f(`Hjemmesiden beskriver virksomheden: "${truncate(home.page.description, 240)}"`, "fact", [home.sourceId]));
  }

  const headingSources = pages.filter((p) => p.page.headings.length > 0);
  const headings = Array.from(new Set(headingSources.flatMap((p) => p.page.headings))).slice(0, 8);
  if (headings.length > 0) {
    profile.productsAndServices.push(
      f(`Overskrifter på hjemmesiden: ${headings.map((h) => `"${truncate(h, 60)}"`).join(", ")}.`, "fact", headingSources.map((p) => p.sourceId)),
    );
    profile.productsAndServices.push(
      f("Ud fra overskrifterne vurderes ovenstående at afspejle virksomhedens primære ydelser. Bør bekræftes med virksomheden.", "assessment", headingSources.map((p) => p.sourceId)),
    );
  }

  const tg = TARGET_GROUP_HYPOTHESES[segment];
  if (tg) profile.targetGroups.push(f(`${tg} (Udledt af branchesegmentet "${INDUSTRY_SEGMENT_LABELS[segment]}".)`, "hypothesis", basis));
  const bm = BUSINESS_MODEL_HYPOTHESES[segment];
  if (bm) profile.businessModel.push(f(`${bm} (Typisk for branchen — ikke verificeret.)`, "hypothesis", basis));
  if (!tg) profile.targetGroups.push(f("Målgruppen kan ikke afgøres ud fra kilderne.", "unknown", []));
  if (!bm) profile.businessModel.push(f("Forretningsmodellen kan ikke afgøres ud fra kilderne.", "unknown", []));
  const ecommerce = analysis.features.find((x) => x.key === "ecommerce");
  if (ecommerce) profile.businessModel.push(f(`Der drives webshop: ${ecommerce.evidence}`, "fact", ecommerce.sourceIds));

  if (pages.length > 0) {
    profile.digitalPresence.push(f(`Officiel hjemmeside undersøgt: ${pages.length} side(r) på ${new URL(pages[0].page.url).hostname}.`, "fact", pages.map((p) => p.sourceId)));
  } else {
    profile.digitalPresence.push(f("Ingen hjemmeside blev undersøgt — digital tilstedeværelse er ukendt.", "unknown", []));
  }
  for (const feature of analysis.features) {
    profile.digitalPresence.push(f(feature.evidence, "fact", feature.sourceIds));
  }

  const strengthLabels: Record<string, string> = {
    online_booking: "Tilbyder online booking, så kunder kan bestille uden at ringe.",
    chat_widget: "Har chatfunktion til hurtig kontakt.",
    social_links: "Er synlig på sociale medier.",
    newsletter: "Har kanal for nyhedsbreve til eksisterende kunder.",
    contact_form: "Har kontaktformular, så henvendelser kan sendes skriftligt.",
    analytics: "Måler trafik på hjemmesiden.",
    ecommerce: "Har etableret onlinesalg.",
  };
  for (const feature of analysis.features) {
    const label = strengthLabels[feature.key];
    if (label) profile.strengths.push(f(label, "assessment", feature.sourceIds));
  }
  for (const signal of analysis.signals) {
    if (signal.key === "has_ecommerce" || signal.key === "large_workforce") continue;
    profile.weaknesses.push(f(`${signal.label}: ${signal.evidence}`, signal.classification === "fact" ? "fact" : "assessment", signal.sourceIds));
  }
  return profile;
}

export function buildRulesCompetitors(input: RulesAnalysisInput): Competitor[] {
  const own = new Set(input.analysis.features.map((x) => x.key));
  return input.competitorPages.map((c) => {
    const theirs = c.features.map((x) => x.label);
    const advantages = c.features.filter((x) => !own.has(x.key)).map((x) => x.label.toLowerCase());
    const comparison =
      advantages.length > 0
        ? `Har ${advantages.join(", ")}, som ikke blev observeret hos ${input.brandName}. Det siger intet om konkurrentens interne systemer.`
        : `Ingen observerbare digitale funktioner, som ${input.brandName} ikke også har.`;
    return {
      id: newId("competitor"),
      name: c.name,
      url: c.url,
      observedFeatures: theirs,
      comparison,
      classification: "fact" as const,
      sourceIds: [c.sourceId],
    };
  });
}

export function buildRulesSummary(input: RulesAnalysisInput, recommendationCount: number): string {
  const { company, segment, analysis, pages, brandName } = input;
  const industry = company?.industry?.text ? `er registreret i CVR under "${company.industry.text}"` : `vurderes ud fra ${pages.length > 0 ? "hjemmesiden" : "det tilgængelige grundlag"} at høre til segmentet "${INDUSTRY_SEGMENT_LABELS[segment].toLowerCase()}"`;
  const parts = [
    `${brandName} ${industry}${company ? ` (juridisk enhed: ${company.name}, CVR ${company.cvr})` : " (juridisk enhed ikke bekræftet)"}.`,
    pages.length > 0
      ? `Researchen undersøgte ${pages.length} side(r) på hjemmesiden og observerede ${analysis.features.length} digitale funktioner samt ${analysis.signals.length} signaler om mulige forbedringsområder.`
      : "Hjemmesiden blev ikke undersøgt, så vurderingen bygger primært på registerdata.",
    `Der er udvalgt ${recommendationCount} relevante services fra bureauets katalog. Analysen er regelbaseret (uden AI) og skelner mellem fakta, vurderinger, hypoteser og ukendte forhold.`,
  ];
  return parts.join(" ");
}
