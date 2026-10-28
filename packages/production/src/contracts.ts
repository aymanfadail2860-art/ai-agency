import { z } from "zod";
import { CompanyRefSchema, IsoDate, ModeSchema } from "@agency/core";

/**
 * FREMTIDIGE KONTRAKTER — PRODUKTION & LEVERING (ikke implementeret i V1)
 * Produktion modtager `quotes.production-intake@1` (se @agency/core/contracts)
 * og opretter et ProductionProject. Hver servicetype kan få sit eget
 * produktionsflow (ProductionFlowTemplate), fx er en AI-receptionist ikke
 * nødvendigvis bygget på samme måde som et CRM-system.
 */

export const ProductionStageSchema = z.enum(["intake", "planning", "build", "qa", "customer_approval", "deployment", "operations"]);

export const ProductionFlowTemplateSchema = z.object({
  id: z.string(),
  catalogItemId: z.string(),
  name: z.string(),
  stages: z.array(z.object({ stage: ProductionStageSchema, tasks: z.array(z.string()), automatedBy: z.enum(["human", "ai_agent", "hybrid"]) })),
});

export const ProductionProjectSchema = z.object({
  id: z.string().startsWith("prj_"),
  intakeId: z.string(),
  mode: ModeSchema,
  company: CompanyRefSchema,
  quoteId: z.string(),
  quoteVersionId: z.string(),
  status: z.enum(["planned", "in_progress", "awaiting_customer", "delivered", "maintenance", "cancelled"]),
  stage: ProductionStageSchema,
  ownerId: z.string().nullable(),
  startDate: z.string().nullable(),
  targetDate: z.string().nullable(),
  createdAt: IsoDate,
  updatedAt: IsoDate,
});
export type ProductionProject = z.infer<typeof ProductionProjectSchema>;

export const ProductionTaskSchema = z.object({
  id: z.string().startsWith("ptk_"),
  projectId: z.string().startsWith("prj_"),
  lineItemId: z.string(),
  title: z.string(),
  stage: ProductionStageSchema,
  assignee: z.object({ kind: z.enum(["human", "ai_agent"]), id: z.string() }).nullable(),
  status: z.enum(["todo", "in_progress", "blocked", "review", "done"]),
  dueDate: z.string().nullable(),
  createdAt: IsoDate,
  updatedAt: IsoDate,
});
export type ProductionTask = z.infer<typeof ProductionTaskSchema>;

export const DeliverableSchema = z.object({
  id: z.string().startsWith("dlv_"),
  projectId: z.string().startsWith("prj_"),
  lineItemId: z.string(),
  name: z.string(),
  status: z.enum(["pending", "in_review", "approved", "deployed", "retired"]),
  approvedByCustomerAt: IsoDate.nullable(),
  deployedAt: IsoDate.nullable(),
  monitoring: z.object({ healthy: z.boolean(), lastCheckedAt: IsoDate }).nullable(),
  createdAt: IsoDate,
  updatedAt: IsoDate,
});
export type Deliverable = z.infer<typeof DeliverableSchema>;
