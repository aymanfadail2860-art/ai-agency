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
    endpoint: "POST /api/crm/activities (svarer 501 i V1)",
    description: "Registrerer salgsaktiviteter på kunden i CRM.",
  },
  {
    name: "dashboard.metric-datapoint",
    version: 1,
    from: "alle moduler",
    to: "dashboard",
    status: "planned",
    endpoint: "POST /api/dashboard/metrics (svarer 501 i V1)",
    description: "Leverer KPI-datapunkter til Dashboard.",
  },
] as const;
