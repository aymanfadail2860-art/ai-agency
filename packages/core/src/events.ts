import { z } from "zod";
import { IsoDate, ModeSchema } from "./models";

/**
 * FÆLLES HÆNDELSESMODEL
 * Hændelser beskriver noget, der allerede er sket. De logges i V1 og danner
 * grundlag for fremtidige workflows (fx CRM-aktiviteter og dashboard-KPI'er).
 */
export const ModuleKeySchema = z.enum(["research", "quotes", "production", "crm", "dashboard", "aos", "platform"]);
export type ModuleKey = z.infer<typeof ModuleKeySchema>;

export const EVENT_TYPES = [
  "company.registered",
  "brand.created",
  "brand.relation.updated",
  "api.usage.recorded",
  "research.job.started",
  "research.completed",
  "research.failed",
  "research.report.updated",
  "research.handoff.created",
  "quote.created",
  "quote.draft.saved",
  "quote.version.created",
  "quote.content.generated",
  "quote.pdf.exported",
  "catalog.updated",
  "settings.updated",
  "quote.accepted",
  "production.project.created",
  "production.phase.changed",
  "ai.job.created",
  "ai.job.completed",
  "ai.job.failed",
  "approval.decided",
  "agent.version.created",
] as const;

export const DomainEventSchema = z.object({
  id: z.string().startsWith("evt_"),
  type: z.enum(EVENT_TYPES),
  version: z.literal(1),
  source: ModuleKeySchema,
  occurredAt: IsoDate,
  mode: ModeSchema.nullable(),
  subject: z.object({
    companyId: z.string().optional(),
    reportId: z.string().optional(),
    quoteId: z.string().optional(),
    jobId: z.string().optional(),
    aiJobId: z.string().optional(),
    projectId: z.string().optional(),
  }),
  payload: z.record(z.unknown()),
});
export type DomainEvent = z.infer<typeof DomainEventSchema>;
export type DomainEventType = DomainEvent["type"];
