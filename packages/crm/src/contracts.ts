import { z } from "zod";
import { CompanyRefSchema, IsoDate, ModeSchema } from "@agency/core";

/**
 * FREMTIDIGE KONTRAKTER — CRM (ikke implementeret i V1)
 * CRM bruger platformens fælles kundeidentitet (companyId) og modtager
 * aktiviteter via `crm.activity-sync@1`.
 */

export const CRMContactSchema = z.object({
  id: z.string().startsWith("con_"),
  companyId: z.string().startsWith("cmp_"),
  mode: ModeSchema,
  name: z.string(),
  role: z.string().nullable(),
  email: z.string().email().nullable(),
  phone: z.string().nullable(),
  /** Samtykke registreres eksplicit (GDPR / reklamebeskyttelse). */
  marketingConsent: z.object({ given: z.boolean(), at: IsoDate.nullable(), source: z.string().nullable() }),
  createdAt: IsoDate,
  updatedAt: IsoDate,
});
export type CRMContact = z.infer<typeof CRMContactSchema>;

export const SalesStageSchema = z.enum(["lead", "qualified", "quote_sent", "negotiation", "won", "lost"]);

export const SalesOpportunitySchema = z.object({
  id: z.string().startsWith("opy_"),
  mode: ModeSchema,
  company: CompanyRefSchema,
  stage: SalesStageSchema,
  primaryContactId: z.string().nullable(),
  quoteIds: z.array(z.string()),
  researchReportIds: z.array(z.string()),
  estimatedValue: z.object({ implementation: z.number(), monthly: z.number() }).nullable(),
  nextFollowUpAt: IsoDate.nullable(),
  ownerId: z.string().nullable(),
  createdAt: IsoDate,
  updatedAt: IsoDate,
});
export type SalesOpportunity = z.infer<typeof SalesOpportunitySchema>;
