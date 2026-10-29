import type {
  ClaimClassification,
  Complexity,
  IndustrySegment,
  OpportunityArea,
  Priority,
  SourceKind,
} from "./models";

/** Danske visningsnavne for enums — bruges af alle moduler og PDF'en. */
export const CLASSIFICATION_LABELS: Record<ClaimClassification, string> = {
  fact: "Verificeret fakta",
  assessment: "Vurdering",
  hypothesis: "Hypotese",
  unknown: "Ukendt",
};

export const COMPLEXITY_LABELS: Record<Complexity, string> = {
  low: "Lav",
  medium: "Middel",
  high: "Høj",
};

export const PRIORITY_LABELS: Record<Priority, string> = {
  high: "Høj",
  medium: "Middel",
  low: "Lav",
};

export const SOURCE_KIND_LABELS: Record<SourceKind, string> = {
  registry: "Offentligt register",
  website: "Officiel hjemmeside",
  search: "Indekseret webside",
  news: "Nyhed",
  jobs: "Stillingsopslag",
  reviews: "Kundeanmeldelser",
  social: "Social profil",
  competitor: "Konkurrent",
};

export const OPPORTUNITY_AREA_LABELS: Record<OpportunityArea, string> = {
  manual_work: "Reducere manuelle arbejdsopgaver",
  admin_automation: "Automatisere administrative processer",
  customer_service: "Forbedre kundeservice",
  lead_conversion: "Øge leadkonvertering",
  sales_efficiency: "Effektivisere salgsarbejdet",
  booking_contact: "Forbedre booking og kundekontakt",
  integrations: "Integrere eksisterende software",
  marketing: "Optimere marketing",
  reporting: "Forbedre intern rapportering",
};

export const INDUSTRY_SEGMENT_LABELS: Record<IndustrySegment, string> = {
  trades: "Håndværk og byggeri",
  health: "Sundhed og klinikker",
  beauty: "Skønhed og velvære",
  retail: "Detailhandel",
  ecommerce: "E-handel",
  hospitality: "Hotel og restauration",
  professional_services: "Rådgivning og liberale erhverv",
  real_estate: "Ejendom",
  manufacturing: "Produktion og industri",
  transport: "Transport og logistik",
  it: "IT og software",
  education: "Undervisning",
  auto: "Autobranchen",
  fitness: "Fitness og sport",
  public: "Offentlig sektor",
  other: "Øvrige brancher",
};
