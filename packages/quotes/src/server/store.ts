import { z } from "zod";
import { QuoteSchema } from "@agency/core";
import { createCollectionStore } from "@agency/core/server";

/** Tilbudsmodulets interne lagring — tilgås kun gennem modulets service. */
export const quoteStore = createCollectionStore("quotes", "quotes", QuoteSchema);

export const CatalogOverrideSchema = z.object({
  id: z.string().startsWith("svc_"),
  implementationPrice: z.number().min(0).optional(),
  monthlyPrice: z.number().min(0).optional(),
  description: z.string().optional(),
  deliverables: z.array(z.string()).optional(),
  updatedAt: z.string(),
});
export type CatalogOverride = z.infer<typeof CatalogOverrideSchema>;

export const catalogOverrideStore = createCollectionStore("quotes", "catalog-overrides", CatalogOverrideSchema);
