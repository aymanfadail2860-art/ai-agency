import { z } from "zod";
import { IsoDate, ModeSchema } from "@agency/core";

/**
 * CRM — DATAMODEL (V3, etape 3)
 * -----------------------------
 * En CRM-virksomhed ER platformens brand: kontoen nøgles deterministisk på
 * brandets id (`acc_<brand>`), så samme kunde aldrig får to kort, og så
 * Research-rapporter, tilbud og produktionsprojekter (som alle refererer til
 * brandet) vises direkte uden kopier. CRM gemmer kun sine egne felter.
 *
 * Engangsomsætning (implementering) og tilbagevendende omsætning (måned)
 * holdes adskilt overalt og lægges aldrig sammen til ét tal uden at sige det.
 */

export const AccountStatusSchema = z.enum(["new_lead", "working", "qualified", "customer", "former_customer", "disqualified"]);
export type AccountStatus = z.infer<typeof AccountStatusSchema>;
export const ACCOUNT_STATUS_LABELS: Record<AccountStatus, string> = {
  new_lead: "Nyt lead",
  working: "Under bearbejdning",
  qualified: "Kvalificeret",
  customer: "Aktiv kunde",
  former_customer: "Tidligere kunde",
  disqualified: "Ikke relevant",
};
export const LEAD_STATUSES: readonly AccountStatus[] = ["new_lead", "working", "qualified"];

export const LeadSourceSchema = z.enum(["research", "website", "referral", "network", "inbound", "event", "outbound", "other"]);
export type LeadSource = z.infer<typeof LeadSourceSchema>;
export const LEAD_SOURCE_LABELS: Record<LeadSource, string> = {
  research: "Research",
  website: "Hjemmeside",
  referral: "Anbefaling",
  network: "Netværk",
  inbound: "Indgående henvendelse",
  event: "Arrangement",
  outbound: "Opsøgende salg",
  other: "Andet",
};

export const CompanySizeSchema = z.enum(["unknown", "1-9", "10-49", "50-249", "250+"]);
export type CompanySize = z.infer<typeof CompanySizeSchema>;
export const COMPANY_SIZE_LABELS: Record<CompanySize, string> = { unknown: "Ukendt", "1-9": "1-9 ansatte", "10-49": "10-49 ansatte", "50-249": "50-249 ansatte", "250+": "250+ ansatte" };

const Cvr = z.string().regex(/^\d{8}$/, "CVR skal være 8 cifre.");

export const CrmAccountSchema = z.object({
  id: z.string().startsWith("acc_"),
  /** Platformens fælles kundeidentitet. */
  brandId: z.string().startsWith("brd_"),
  mode: ModeSchema,
  isDemo: z.boolean(),
  name: z.string().min(1).max(200),
  website: z.string().max(500).nullable(),
  /** Angivet CVR — "verificeret" kun, hvis brandet har en bekræftet juridisk enhed. */
  cvr: Cvr.nullable(),
  industry: z.string().max(120),
  address: z.string().max(300),
  phone: z.string().max(40),
  email: z.string().max(200),
  size: CompanySizeSchema,
  source: LeadSourceSchema,
  status: AccountStatusSchema,
  owner: z.string().max(80),
  notes: z.string().max(8000),
  tags: z.array(z.string().max(40)).max(20),
  /** Research-rapporter fra andre brands, som er tilknyttet manuelt. */
  linkedReportIds: z.array(z.string().startsWith("rrep_")).max(50),
  documents: z.array(z.object({ id: z.string(), title: z.string().max(200), url: z.string().url().max(2000), addedAt: IsoDate })).max(50),
  statusHistory: z.array(z.object({ at: IsoDate, from: AccountStatusSchema.nullable(), to: AccountStatusSchema, note: z.string().max(300) })).max(100),
  createdAt: IsoDate,
  updatedAt: IsoDate,
});
export type CrmAccount = z.infer<typeof CrmAccountSchema>;

export const ContactSchema = z.object({
  id: z.string().startsWith("con_"),
  accountId: z.string().startsWith("acc_"),
  name: z.string().min(1).max(120),
  title: z.string().max(120),
  email: z.string().max(200),
  phone: z.string().max(40),
  isPrimary: z.boolean(),
  /** Samtykke til markedsføring registreres eksplicit (reklamebeskyttelse/GDPR). */
  marketingConsent: z.boolean(),
  notes: z.string().max(2000),
  createdAt: IsoDate,
  updatedAt: IsoDate,
});
export type Contact = z.infer<typeof ContactSchema>;

export const STAGES = [
  { key: "new_lead", label: "Nyt lead", probability: 5 },
  { key: "research", label: "Research", probability: 10 },
  { key: "contacted", label: "Kontaktet", probability: 15 },
  { key: "qualified", label: "Kvalificeret", probability: 25 },
  { key: "meeting_booked", label: "Møde booket", probability: 35 },
  { key: "needs_identified", label: "Behov afdækket", probability: 50 },
  { key: "quote_sent", label: "Tilbud sendt", probability: 65 },
  { key: "negotiation", label: "Forhandling", probability: 80 },
  { key: "won", label: "Vundet", probability: 100 },
  { key: "lost", label: "Tabt", probability: 0 },
] as const;
export const StageSchema = z.enum(["new_lead", "research", "contacted", "qualified", "meeting_booked", "needs_identified", "quote_sent", "negotiation", "won", "lost"]);
export type Stage = z.infer<typeof StageSchema>;
export const STAGE_KEYS = STAGES.map((s) => s.key) as Stage[];
export const stageLabel = (s: Stage) => STAGES.find((x) => x.key === s)!.label;
export const stageIndex = (s: Stage) => STAGE_KEYS.indexOf(s);
export const defaultProbability = (s: Stage) => STAGES.find((x) => x.key === s)!.probability;

export const OpportunitySchema = z.object({
  id: z.string().startsWith("sop_"),
  accountId: z.string().startsWith("acc_"),
  mode: ModeSchema,
  isDemo: z.boolean(),
  title: z.string().min(1).max(200),
  /** Servicekatalog-id'er (fx svc_ai_receptionist). */
  services: z.array(z.string().max(60)).max(10),
  /** Engangsbeløb ekskl. moms (DKK). */
  implementationValue: z.number().min(0).max(100_000_000),
  /** Tilbagevendende beløb pr. måned ekskl. moms (DKK). */
  monthlyValue: z.number().min(0).max(10_000_000),
  expectedCloseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  probability: z.number().int().min(0).max(100),
  owner: z.string().max(80),
  stage: StageSchema,
  status: z.enum(["open", "won", "lost"]),
  lostReason: z.string().max(500),
  primaryContactId: z.string().startsWith("con_").nullable(),
  /** Referencer til de andre moduler — aldrig kopier. */
  reportId: z.string().startsWith("rrep_").nullable(),
  quoteId: z.string().startsWith("qte_").nullable(),
  projectId: z.string().startsWith("prj_").nullable(),
  history: z.array(z.object({ at: IsoDate, kind: z.enum(["created", "stage", "value", "won", "lost", "quote", "project", "note"]), message: z.string().max(400), from: StageSchema.nullable(), to: StageSchema.nullable() })).max(200),
  closedAt: IsoDate.nullable(),
  createdAt: IsoDate,
  updatedAt: IsoDate,
});
export type Opportunity = z.infer<typeof OpportunitySchema>;

export const ActivityKindSchema = z.enum(["call", "email", "meeting", "task", "follow_up", "note", "reminder"]);
export type ActivityKind = z.infer<typeof ActivityKindSchema>;
export const ACTIVITY_KIND_LABELS: Record<ActivityKind, string> = {
  call: "Telefonopkald",
  email: "E-mail",
  meeting: "Møde",
  task: "Opgave",
  follow_up: "Opfølgning",
  note: "Note",
  reminder: "Påmindelse",
};

export const ActivitySchema = z.object({
  id: z.string().startsWith("act_"),
  accountId: z.string().startsWith("acc_"),
  contactId: z.string().startsWith("con_").nullable(),
  opportunityId: z.string().startsWith("sop_").nullable(),
  mode: ModeSchema,
  isDemo: z.boolean(),
  kind: ActivityKindSchema,
  subject: z.string().min(1).max(200),
  description: z.string().max(4000),
  /** Planlagt tidspunkt (opgaver/møder/opfølgninger) eller tidspunkt for registreringen. */
  dueAt: IsoDate,
  owner: z.string().max(80),
  priority: z.enum(["low", "normal", "high"]),
  status: z.enum(["planned", "done", "cancelled"]),
  outcome: z.string().max(2000),
  nextStep: z.string().max(500),
  completedAt: IsoDate.nullable(),
  createdAt: IsoDate,
  updatedAt: IsoDate,
});
export type Activity = z.infer<typeof ActivitySchema>;

/** Guidet demo — 12 trin fra lead til mersalg. */
export const DEMO_STEPS = [
  { key: "lead", title: "Nyt lead oprettes", detail: "Bryggeriet Nordlys registreres som lead (kilde: netværk)." },
  { key: "research", title: "Research tilknyttes", detail: "Brandresearch køres gennem AOS' Job Center (Scout) på demodata." },
  { key: "contact", title: "Kontaktperson oprettes", detail: "Fiktiv driftschef med registreret samtykke." },
  { key: "first_contact", title: "Første kontakt registreres", detail: "Opkald logges med resultat og næste skridt — der ringes ikke." },
  { key: "meeting", title: "Møde planlægges", detail: "Behovsmøde i kalenderen om 3 dage." },
  { key: "needs", title: "Behov afdækkes", detail: "Mødet afsluttes med noter; leadet kvalificeres." },
  { key: "opportunity", title: "Salgsmulighed oprettes", detail: "Services fra researchens anbefalinger; implementering og månedspris adskilt." },
  { key: "quote", title: "Tilbud tilknyttes", detail: "Tilbud oprettes via kontrakten crm.quote-request og markeres som sendt (ingen e-mail)." },
  { key: "won", title: "Aftalen markeres som vundet", detail: "Kunden accepterer tilbuddet — først nu bliver salgsmuligheden vundet." },
  { key: "project", title: "Projekt oprettes i Produktion", detail: "Det accepterede tilbud overføres via quotes.production-intake." },
  { key: "customer", title: "Kunden bliver aktiv kunde", detail: "Status ændres, og et velkomstopkald planlægges." },
  { key: "upsell", title: "Opfølgning og mersalg", detail: "Kvartalsopfølgning og en ny mulighed for mersalg registreres." },
] as const;

export const CrmDemoStateSchema = z.object({
  id: z.literal("crm-demo"),
  run: z.number().int().min(1),
  step: z.number().int().min(0).max(DEMO_STEPS.length),
  accountId: z.string().nullable(),
  contactId: z.string().nullable(),
  opportunityId: z.string().nullable(),
  meetingId: z.string().nullable(),
  quoteId: z.string().nullable(),
  projectId: z.string().nullable(),
  upsellId: z.string().nullable(),
  updatedAt: IsoDate,
});
export type CrmDemoState = z.infer<typeof CrmDemoStateSchema>;
