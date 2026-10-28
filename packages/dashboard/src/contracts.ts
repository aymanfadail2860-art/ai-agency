import { z } from "zod";
import { IsoDate, ModeSchema } from "@agency/core";

/**
 * FREMTIDIGE KONTRAKTER — DASHBOARD (ikke implementeret i V1)
 * Dashboard ejer ingen forretningsdata; det aggregerer datapunkter, som
 * modulerne leverer via `dashboard.metric-datapoint@1`.
 */
export const DashboardMetricKeySchema = z.enum([
  "leads_count",
  "customers_count",
  "active_quotes",
  "quote_conversion_rate",
  "pipeline_value",
  "implementation_revenue",
  "mrr",
  "active_production_projects",
  "delivery_on_time_rate",
  "customer_lifetime_value",
  "service_performance",
]);

export const DashboardMetricSchema = z.object({
  key: DashboardMetricKeySchema,
  label: z.string(),
  unit: z.enum(["count", "dkk", "percent", "days"]),
  value: z.number(),
  previousValue: z.number().nullable(),
  periodStart: IsoDate,
  periodEnd: IsoDate,
  mode: ModeSchema,
  sources: z.array(z.enum(["research", "quotes", "production", "crm"])),
});
export type DashboardMetric = z.infer<typeof DashboardMetricSchema>;
