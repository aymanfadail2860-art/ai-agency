import { z } from "zod";

/**
 * FÆLLES DATAMODEL
 * ----------------
 * Alle entiteter, som deles mellem moduler, defineres her som Zod-skemaer.
 * Typerne udledes af skemaerne, så runtime-validering og TypeScript-typer
 * altid er i sync. Alle entiteter har stabile id'er og tidsstempler.
 */

export const IsoDate = z.string().datetime({ offset: true });

export const Timestamps = {
  createdAt: IsoDate,
  updatedAt: IsoDate,
};

/** Demo-data og verificerede (live) data holdes strengt adskilt. */
export const ModeSchema = z.enum(["demo", "live"]);
export type Mode = z.infer<typeof ModeSchema>;

export const CvrNumberSchema = z.string().regex(/^\d{8}$/, "CVR-nummer skal være 8 cifre");

/* -------------------------------------------------------------------------- */
/* Company — fælles kundeidentitet                                            */
/* -------------------------------------------------------------------------- */

export const CompanyAddressSchema = z.object({
  street: z.string().nullable(),
  postalCode: z.string().nullable(),
  city: z.string().nullable(),
  municipality: z.string().nullable().optional(),
  country: z.string().default("DK"),
});
export type CompanyAddress = z.infer<typeof CompanyAddressSchema>;

export const RegistrySourceSchema = z.object({
  provider: z.enum(["cvr.dev", "virk.dk", "demo"]),
  retrievedAt: IsoDate,
  reference: z.string().nullable(),
});

export const CompanySchema = z.object({
  id: z.string().startsWith("cmp_"),
  cvr: CvrNumberSchema,
  name: z.string().min(1),
  mode: ModeSchema,
  address: CompanyAddressSchema.nullable(),
  industry: z.object({ code: z.string().nullable(), text: z.string() }).nullable(),
  companyForm: z.object({ code: z.string().nullable(), text: z.string() }).nullable(),
  status: z.string().nullable(),
  foundedAt: z.string().nullable(),
  employees: z
    .object({
      count: z.number().int().nullable(),
      interval: z.string().nullable(),
      year: z.number().int().nullable(),
    })
    .nullable(),
  /** Kun offentlige (ikke-hemmelige) kontaktoplysninger lagres — dataminimering. */
  contact: z.object({
    phone: z.string().nullable(),
    email: z.string().nullable(),
    website: z.string().nullable(),
  }),
  /** Reklamebeskyttelse fra CVR — skal respekteres i salgsarbejdet. */
  adProtected: z.boolean(),
  registrySource: RegistrySourceSchema,
  ...Timestamps,
});
export type Company = z.infer<typeof CompanySchema>;

/** Minimal reference til en virksomhed, som bruges i kontrakter mellem moduler. */
export const CompanyRefSchema = z.object({
  companyId: z.string().startsWith("cmp_"),
  cvr: CvrNumberSchema,
  name: z.string().min(1),
});
export type CompanyRef = z.infer<typeof CompanyRefSchema>;

/* -------------------------------------------------------------------------- */
/* Research                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Skelnen mellem verificerede fakta, vurderinger og hypoteser.
 * - fact: direkte observeret i en navngiven kilde (kræver mindst én kilde)
 * - assessment: AI- eller regelbaseret vurdering på baggrund af kilder
 * - hypothesis: antagelse, som skal verificeres med kunden
 */
export const ClaimClassificationSchema = z.enum(["fact", "assessment", "hypothesis"]);
export type ClaimClassification = z.infer<typeof ClaimClassificationSchema>;

export const SourceKindSchema = z.enum([
  "registry",
  "website",
  "search",
  "news",
  "jobs",
  "reviews",
  "social",
  "competitor",
]);
export type SourceKind = z.infer<typeof SourceKindSchema>;

export const ResearchSourceSchema = z.object({
  id: z.string().startsWith("src_"),
  kind: SourceKindSchema,
  title: z.string(),
  url: z.string().nullable(),
  provider: z.string(),
  retrievedAt: IsoDate,
  /** Uddrag af det hentede indhold (begrænset længde — dataminimering). */
  excerpt: z.string().max(4000),
  isDemo: z.boolean(),
});
export type ResearchSource = z.infer<typeof ResearchSourceSchema>;

export const FindingSchema = z.object({
  id: z.string().startsWith("fnd_"),
  text: z.string().min(1),
  classification: ClaimClassificationSchema,
  sourceIds: z.array(z.string()),
});
export type Finding = z.infer<typeof FindingSchema>;

export const ScoreCriterionSchema = z.object({
  key: z.enum(["evidence", "industry_fit", "observed_gap", "implementation_ease"]),
  label: z.string(),
  weight: z.number().min(0).max(1),
  value: z.number().min(0).max(100),
  rationale: z.string(),
});
export type ScoreCriterion = z.infer<typeof ScoreCriterionSchema>;

/** AI Opportunity Score (0-100) med gennemsigtige, vægtede kriterier. */
export const OpportunityScoreSchema = z.object({
  total: z.number().int().min(0).max(100),
  criteria: z.array(ScoreCriterionSchema),
  method: z.string(),
});
export type OpportunityScore = z.infer<typeof OpportunityScoreSchema>;

export const OpportunityAreaSchema = z.enum([
  "manual_work",
  "admin_automation",
  "customer_service",
  "lead_conversion",
  "sales_efficiency",
  "booking_contact",
  "integrations",
  "marketing",
  "reporting",
]);
export type OpportunityArea = z.infer<typeof OpportunityAreaSchema>;

export const OpportunitySchema = z.object({
  id: z.string().startsWith("opp_"),
  area: OpportunityAreaSchema,
  title: z.string(),
  description: z.string(),
  classification: ClaimClassificationSchema,
  sourceIds: z.array(z.string()),
  score: OpportunityScoreSchema,
});
export type Opportunity = z.infer<typeof OpportunitySchema>;

export const CompetitorSchema = z.object({
  id: z.string().startsWith("cmpt_"),
  name: z.string(),
  url: z.string().nullable(),
  observedFeatures: z.array(z.string()),
  comparison: z.string(),
  classification: ClaimClassificationSchema,
  sourceIds: z.array(z.string()),
});
export type Competitor = z.infer<typeof CompetitorSchema>;

export const ComplexitySchema = z.enum(["low", "medium", "high"]);
export type Complexity = z.infer<typeof ComplexitySchema>;
export const PrioritySchema = z.enum(["high", "medium", "low"]);
export type Priority = z.infer<typeof PrioritySchema>;

export const ServiceRecommendationSchema = z.object({
  id: z.string().startsWith("rec_"),
  catalogItemId: z.string(),
  serviceName: z.string(),
  problem: z.string(),
  relevance: z.string(),
  findings: z.array(FindingSchema),
  expectedBenefits: z.array(z.string()),
  complexity: ComplexitySchema,
  priority: PrioritySchema,
  prerequisites: z.array(z.string()),
  uncertainties: z.array(z.string()),
  score: OpportunityScoreSchema,
  /** Brugerens valg og redigeringer — bevares ved genindlæsning. */
  selected: z.boolean(),
  editedDescription: z.string().nullable(),
  note: z.string().nullable(),
});
export type ServiceRecommendation = z.infer<typeof ServiceRecommendationSchema>;

export const CompanyProfileSchema = z.object({
  activities: z.array(FindingSchema),
  productsAndServices: z.array(FindingSchema),
  targetGroups: z.array(FindingSchema),
  businessModel: z.array(FindingSchema),
  digitalPresence: z.array(FindingSchema),
  strengths: z.array(FindingSchema),
  weaknesses: z.array(FindingSchema),
});
export type CompanyProfile = z.infer<typeof CompanyProfileSchema>;

export const AnalysisEngineSchema = z.enum(["claude", "rules", "demo"]);
export type AnalysisEngine = z.infer<typeof AnalysisEngineSchema>;

export const ResearchStepSchema = z.object({
  key: z.string(),
  label: z.string(),
  status: z.enum(["pending", "running", "done", "skipped", "failed"]),
  detail: z.string().nullable(),
});
export type ResearchStep = z.infer<typeof ResearchStepSchema>;

export const ResearchJobSchema = z.object({
  id: z.string().startsWith("rjob_"),
  companyId: z.string().startsWith("cmp_"),
  mode: ModeSchema,
  status: z.enum(["queued", "running", "completed", "failed"]),
  steps: z.array(ResearchStepSchema),
  websiteUrl: z.string().nullable(),
  startedAt: IsoDate.nullable(),
  finishedAt: IsoDate.nullable(),
  error: z.string().nullable(),
  reportId: z.string().nullable(),
  ...Timestamps,
});
export type ResearchJob = z.infer<typeof ResearchJobSchema>;

export const ResearchReportSchema = z.object({
  id: z.string().startsWith("rrep_"),
  companyId: z.string().startsWith("cmp_"),
  jobId: z.string().startsWith("rjob_"),
  mode: ModeSchema,
  analysisEngine: AnalysisEngineSchema,
  analysisModel: z.string().nullable(),
  summary: z.string(),
  profile: CompanyProfileSchema,
  opportunities: z.array(OpportunitySchema),
  competitors: z.array(CompetitorSchema),
  recommendations: z.array(ServiceRecommendationSchema),
  sources: z.array(ResearchSourceSchema),
  limitations: z.array(z.string()),
  notes: z.string(),
  status: z.enum(["draft", "saved", "handed_off"]),
  handoffs: z.array(z.object({ handoffId: z.string(), quoteId: z.string(), at: IsoDate })),
  ...Timestamps,
});
export type ResearchReport = z.infer<typeof ResearchReportSchema>;

/* -------------------------------------------------------------------------- */
/* Servicekatalog                                                             */
/* -------------------------------------------------------------------------- */

export const IndustrySegmentSchema = z.enum([
  "trades",
  "health",
  "beauty",
  "retail",
  "ecommerce",
  "hospitality",
  "professional_services",
  "real_estate",
  "manufacturing",
  "transport",
  "it",
  "education",
  "auto",
  "fitness",
  "public",
  "other",
]);
export type IndustrySegment = z.infer<typeof IndustrySegmentSchema>;

/** Observerbare signaler, som researchmodulet kan registrere. */
export const SignalKeySchema = z.enum([
  "no_chat_widget",
  "no_online_booking",
  "no_contact_form",
  "no_newsletter",
  "phone_centric_contact",
  "no_social_links",
  "no_analytics",
  "has_ecommerce",
  "hiring_admin",
  "hiring_sales",
  "hiring_customer_service",
  "many_locations",
  "review_mentions_response_time",
  "no_website",
  "large_workforce",
]);
export type SignalKey = z.infer<typeof SignalKeySchema>;

export const ServiceAddOnSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  implementationPrice: z.number().min(0),
  monthlyPrice: z.number().min(0),
});
export type ServiceAddOn = z.infer<typeof ServiceAddOnSchema>;

export const ServiceCatalogItemSchema = z.object({
  id: z.string().startsWith("svc_"),
  name: z.string(),
  category: z.enum(["customer_contact", "sales_marketing", "automation", "data_software"]),
  shortDescription: z.string(),
  description: z.string(),
  implementationPrice: z.number().min(0),
  monthlyPrice: z.number().min(0),
  deliverables: z.array(z.string()),
  estimatedWeeks: z.object({ min: z.number().int().min(1), max: z.number().int().min(1) }),
  addOns: z.array(ServiceAddOnSchema),
  complexity: ComplexitySchema,
  problemStatement: z.string(),
  expectedBenefits: z.array(z.string()),
  prerequisites: z.array(z.string()),
  /** Branchesegmenter og deres relevans (0-1) for anbefalingsmotoren. */
  industryFit: z.record(IndustrySegmentSchema, z.number().min(0).max(1)),
  /** Signaler, som indikerer et observeret behov for servicen. */
  signals: z.array(SignalKeySchema),
  opportunityArea: OpportunityAreaSchema,
  /** Alle priser i V1 er fiktive demopriser. */
  isDemoPrice: z.literal(true),
  updatedAt: IsoDate,
});
export type ServiceCatalogItem = z.infer<typeof ServiceCatalogItemSchema>;

/* -------------------------------------------------------------------------- */
/* Tilbud                                                                     */
/* -------------------------------------------------------------------------- */

export const QuoteLineItemSchema = z.object({
  id: z.string().startsWith("qli_"),
  catalogItemId: z.string().nullable(),
  sourceRecommendationId: z.string().nullable(),
  name: z.string().min(1),
  description: z.string(),
  deliverables: z.array(z.string()),
  implementationPrice: z.number().min(0),
  monthlyPrice: z.number().min(0),
  quantity: z.number().int().min(1),
  addOns: z.array(ServiceAddOnSchema),
  estimatedWeeks: z.object({ min: z.number().int().min(1), max: z.number().int().min(1) }),
  rationale: z.string().nullable(),
});
export type QuoteLineItem = z.infer<typeof QuoteLineItemSchema>;

export const DiscountSchema = z.object({
  kind: z.enum(["none", "percent", "amount"]),
  value: z.number().min(0),
  scope: z.enum(["implementation", "monthly", "all"]),
  label: z.string().nullable(),
});
export type Discount = z.infer<typeof DiscountSchema>;

export const QuoteContentSchema = z.object({
  title: z.string(),
  introduction: z.string(),
  situation: z.string(),
  opportunities: z.string(),
  solutions: z.string(),
  implementationPlan: z.string(),
  benefits: z.string(),
  terms: z.string(),
  nextSteps: z.string(),
});
export type QuoteContent = z.infer<typeof QuoteContentSchema>;

export const QuoteVersionSchema = z.object({
  id: z.string().startsWith("qver_"),
  versionNumber: z.number().int().min(1),
  status: z.enum(["draft", "superseded"]),
  lineItems: z.array(QuoteLineItemSchema),
  discount: DiscountSchema,
  vatRate: z.number().min(0).max(1),
  currency: z.literal("DKK"),
  specialTerms: z.string(),
  validityDays: z.number().int().min(1).max(365),
  content: QuoteContentSchema,
  contentEngine: z.enum(["claude", "template", "manual"]).nullable(),
  contentGeneratedAt: IsoDate.nullable(),
  ...Timestamps,
});
export type QuoteVersion = z.infer<typeof QuoteVersionSchema>;

export const QuoteSchema = z.object({
  id: z.string().startsWith("qte_"),
  number: z.string(),
  mode: ModeSchema,
  company: CompanyRefSchema.extend({ address: z.string().nullable() }),
  sourceReportId: z.string().nullable(),
  handoffId: z.string().nullable(),
  researchSummary: z.string(),
  /** Snapshot af researchindsigter fra overførslen — bruges i tilbudsteksten. */
  researchInsights: z.array(
    z.object({ serviceName: z.string(), rationale: z.string(), keyFindings: z.array(z.string()), note: z.string().nullable() }),
  ),
  userNotes: z.string(),
  /** V1 understøtter kun udkast; accept/afvisning hører til senere versioner. */
  status: z.enum(["draft", "sent", "accepted", "rejected"]),
  currentVersionId: z.string().startsWith("qver_"),
  versions: z.array(QuoteVersionSchema).min(1),
  ...Timestamps,
});
export type Quote = z.infer<typeof QuoteSchema>;
