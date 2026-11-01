import { z } from "zod";
import {
  CompanyRefSchema,
  ComplexitySchema,
  IsoDate,
  ModeSchema,
  PrioritySchema,
  QuoteLineItemSchema,
} from "./models";

/**
 * API-KONTRAKTER MELLEM MODULER
 * -----------------------------
 * Moduler kommunikerer udelukkende gennem versionerede kontrakter.
 * Et modul må aldrig læse et andet moduls interne datalagring direkte.
 *
 * Navngivning: `<afsender>.<formål>` + heltalsversion. Brydende ændringer
 * kræver en ny version; gamle versioner understøttes indtil alle afsendere
 * er migreret.
 */

/* -------------------------------------------------------------------------- */
/* AKTIV i V1: Research → Tilbud                                              */
/* -------------------------------------------------------------------------- */

export const HandoffServiceSchema = z.object({
  recommendationId: z.string(),
  catalogItemId: z.string(),
  serviceName: z.string().min(1),
  /** Beskrivelse — brugerens redigerede tekst, hvis den findes. */
  description: z.string(),
  rationale: z.string(),
  keyFindings: z.array(z.string()).max(10),
  priority: PrioritySchema,
  complexity: ComplexitySchema,
  score: z.number().int().min(0).max(100),
  note: z.string().nullable(),
});
export type HandoffService = z.infer<typeof HandoffServiceSchema>;

export const ResearchQuoteHandoffSchema = z.object({
  contract: z.literal("research.quote-handoff"),
  version: z.literal(1),
  handoffId: z.string().startsWith("hnd_"),
  createdAt: IsoDate,
  mode: ModeSchema,
  company: CompanyRefSchema.extend({ address: z.string().nullable() }),
  researchReportId: z.string().startsWith("rrep_"),
  researchSummary: z.string(),
  services: z.array(HandoffServiceSchema).min(1, "Vælg mindst én service, før der oprettes et tilbud."),
  userNotes: z.string(),
});
export type ResearchQuoteHandoff = z.infer<typeof ResearchQuoteHandoffSchema>;

/* -------------------------------------------------------------------------- */
/* AKTIV i V2: Research → Tilbud (brand-first, CVR valgfrit)                  */
/* -------------------------------------------------------------------------- */

export const HandoffOpportunitySchema = z.object({
  title: z.string(),
  observed: z.string(),
  potentialProblem: z.string(),
  solution: z.string(),
});

export const ResearchQuoteHandoffV2Schema = z.object({
  contract: z.literal("research.quote-handoff"),
  version: z.literal(2),
  handoffId: z.string().startsWith("hnd_"),
  createdAt: IsoDate,
  mode: ModeSchema,
  brand: z.object({ brandId: z.string().startsWith("brd_"), name: z.string().min(1), website: z.string().nullable() }),
  /** Kun bekræftede juridiske enheder overføres. */
  legalEntity: CompanyRefSchema.extend({ address: z.string().nullable() }).nullable(),
  researchReportId: z.string().startsWith("rrep_"),
  researchSummary: z.string(),
  overallRecommendation: z.string(),
  opportunities: z.array(HandoffOpportunitySchema).max(12),
  services: z.array(HandoffServiceSchema.extend({ proposedSolution: z.string().nullable(), customerQuestions: z.array(z.string()).max(8) })).min(1, "Vælg mindst én service, før der oprettes et tilbud."),
  userNotes: z.string(),
});
export type ResearchQuoteHandoffV2 = z.infer<typeof ResearchQuoteHandoffV2Schema>;

/** Tilbud modtager både v1 og v2 af kontrakten. */
export const AnyResearchQuoteHandoffSchema = z.discriminatedUnion("version", [ResearchQuoteHandoffSchema, ResearchQuoteHandoffV2Schema]);
export type AnyResearchQuoteHandoff = z.infer<typeof AnyResearchQuoteHandoffSchema>;

export const QuoteIntakeResultSchema = z.object({
  quoteId: z.string().startsWith("qte_"),
  quoteNumber: z.string(),
  versionId: z.string().startsWith("qver_"),
});
export type QuoteIntakeResult = z.infer<typeof QuoteIntakeResultSchema>;

/**
 * V3: CRM → Tilbud. En salgsmulighed beder Tilbud om et udkast med valgte
 * services og kundens brand. Idempotent pr. requestId.
 */
export const CrmQuoteRequestSchema = z.object({
  contract: z.literal("crm.quote-request"),
  version: z.literal(1),
  requestId: z.string().startsWith("crq_"),
  createdAt: IsoDate,
  mode: ModeSchema,
  brand: z.object({ brandId: z.string().startsWith("brd_"), name: z.string().min(1), website: z.string().nullable() }),
  legalEntity: CompanyRefSchema.extend({ address: z.string().nullable() }).nullable(),
  opportunity: z.object({ opportunityId: z.string().startsWith("sop_"), title: z.string().min(1) }),
  services: z.array(z.object({ catalogItemId: z.string().min(1), note: z.string().max(500).nullable() })).min(1, "Vælg mindst én service.").max(10),
  researchReportId: z.string().startsWith("rrep_").nullable(),
  researchSummary: z.string().max(4000),
  overallRecommendation: z.string().max(2000),
  notes: z.string().max(4000),
});
export type CrmQuoteRequest = z.infer<typeof CrmQuoteRequestSchema>;

/* -------------------------------------------------------------------------- */
/* FREMTIDIG (dokumenteret, ikke implementeret): Tilbud → Produktion          */
/* -------------------------------------------------------------------------- */

/**
 * Når et tilbud accepteres, sender Tilbud denne kontrakt til Produktion &
 * Levering, som opretter et produktionsprojekt. Produktion kan også modtage
 * den samme kontrakt fra CRM (fx ved genkøb) — derfor er afsenderen angivet.
 */
export const ProductionIntakeSchema = z.object({
  contract: z.literal("quotes.production-intake"),
  version: z.literal(1),
  intakeId: z.string(),
  sentBy: z.enum(["quotes", "crm"]),
  acceptedAt: IsoDate,
  mode: ModeSchema,
  company: CompanyRefSchema,
  quote: z.object({
    quoteId: z.string().startsWith("qte_"),
    quoteNumber: z.string(),
    versionId: z.string().startsWith("qver_"),
    versionNumber: z.number().int().min(1),
  }),
  lineItems: z.array(QuoteLineItemSchema).min(1),
  totals: z.object({
    implementationExclVat: z.number(),
    monthlyExclVat: z.number(),
    firstYearExclVat: z.number(),
  }),
  specialTerms: z.string(),
  requestedStartDate: z.string().nullable(),
});
export type ProductionIntake = z.infer<typeof ProductionIntakeSchema>;

/**
 * V3: brand-first intake — tilbud kan være uden bekræftet CVR (som handoff v2).
 * Kunden refereres via brand og evt. juridisk enhed; kundedata kopieres ikke.
 */
export const ProductionIntakeV2Schema = ProductionIntakeSchema.omit({ version: true, company: true }).extend({
  version: z.literal(2),
  customer: z.object({
    brandId: z.string().startsWith("brd_").nullable(),
    legalEntity: CompanyRefSchema.nullable(),
    name: z.string().min(1),
  }),
});
export type ProductionIntakeV2 = z.infer<typeof ProductionIntakeV2Schema>;
export const AnyProductionIntakeSchema = z.discriminatedUnion("version", [ProductionIntakeSchema, ProductionIntakeV2Schema]);
export type AnyProductionIntake = z.infer<typeof AnyProductionIntakeSchema>;

/* -------------------------------------------------------------------------- */
/* FREMTIDIG: Tilbud/Research → CRM                                           */
/* -------------------------------------------------------------------------- */

export const CrmActivitySyncSchema = z.object({
  contract: z.literal("crm.activity-sync"),
  version: z.literal(1),
  company: CompanyRefSchema,
  activity: z.discriminatedUnion("type", [
    z.object({ type: z.literal("research_completed"), reportId: z.string(), at: IsoDate }),
    z.object({ type: z.literal("quote_created"), quoteId: z.string(), at: IsoDate }),
    z.object({ type: z.literal("quote_version_created"), quoteId: z.string(), versionNumber: z.number(), at: IsoDate }),
    z.object({ type: z.literal("quote_accepted"), quoteId: z.string(), at: IsoDate }),
  ]),
});
export type CrmActivitySync = z.infer<typeof CrmActivitySyncSchema>;

/* -------------------------------------------------------------------------- */
/* FREMTIDIG: Alle moduler → Dashboard                                        */
/* -------------------------------------------------------------------------- */

export const MetricDatapointSchema = z.object({
  contract: z.literal("dashboard.metric-datapoint"),
  version: z.literal(1),
  metricKey: z.string(),
  source: z.enum(["research", "quotes", "production", "crm"]),
  value: z.number(),
  unit: z.enum(["count", "dkk", "percent", "days"]),
  periodStart: IsoDate,
  periodEnd: IsoDate,
  mode: ModeSchema,
});
export type MetricDatapoint = z.infer<typeof MetricDatapointSchema>;

/** Oversigt over alle kontrakter — bruges i dokumentation og Indstillinger. */
export const CONTRACT_REGISTRY = [
  {
    name: "research.quote-handoff",
    version: 2,
    from: "research",
    to: "quotes",
    status: "active",
    endpoint: "POST /api/quotes/intake",
    description: "Brand-first overførsel (CVR valgfrit) af valgte services, researchindsigter og anbefaling fra Research til Tilbud.",
  },
  {
    name: "research.quote-handoff",
    version: 1,
    from: "research",
    to: "quotes",
    status: "active",
    endpoint: "POST /api/quotes/intake",
    description: "V1: Overfører valgte services, kundeidentitet og researchresumé fra Research til Tilbud (understøttes fortsat).",
  },
  {
    name: "crm.quote-request",
    version: 1,
    from: "crm",
    to: "quotes",
    status: "active",
    endpoint: "POST /api/crm/opportunities/:id/quote",
    description: "V3: Salgsmulighed → tilbudsudkast med valgte services og kundens brand (CVR valgfrit). Idempotent pr. requestId.",
  },
  {
    name: "quotes.production-intake",
    version: 2,
    from: "quotes",
    to: "production",
    status: "active",
    endpoint: "POST /api/production/intake",
    description: "V3: Accepteret tilbud → produktionsprojekt (brand-first, CVR valgfrit). Idempotent pr. intakeId.",
  },
  {
    name: "quotes.production-intake",
    version: 1,
    from: "quotes",
    to: "production",
    status: "active",
    endpoint: "POST /api/production/intake",
    description: "Accepteret tilbud med bekræftet CVR → produktionsprojekt.",
  },
  {
    name: "crm.activity-sync",
    version: 1,
    from: "research, quotes",
    to: "crm",
    status: "planned",
    endpoint: "(hændelsesbaseret synk — ikke i brug)",
    description: "Planlagt hændelsesbaseret aktivitetssynk. I V3.3 læser CRM research, tilbud og projekter direkte via brandet og opdateres af tilbudsstatus; POST /api/crm/activities er CRM's egen aktivitets-API.",
  },
  {
    name: "dashboard.metric-datapoint",
    version: 1,
    from: "alle moduler",
    to: "dashboard",
    status: "planned",
    endpoint: "(ikke i brug — svarer 501)",
    description: "Oprindeligt push af KPI-datapunkter. I V3.4 læser Dashboard modulerne direkte og beregner nøgletallene deterministisk (GET /api/dashboard).",
  },
] as const;
