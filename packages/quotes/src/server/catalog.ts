import { z } from "zod";
import { DEFAULT_SERVICE_CATALOG, type ServiceCatalogItem } from "@agency/core";
import { publishEvent } from "@agency/core/server";
import { AppError, nowIso } from "@agency/shared";
import { catalogOverrideStore } from "./store";

/**
 * SERVICEKATALOG MED REDIGERBARE DEMOPRISER
 * Standardkataloget ligger i platformkernen; Tilbud ejer prisoverstyringerne.
 */
export async function getCatalog(): Promise<ServiceCatalogItem[]> {
  const overrides = await catalogOverrideStore.list();
  return DEFAULT_SERVICE_CATALOG.map((item) => {
    const o = overrides.find((x) => x.id === item.id);
    if (!o) return { ...item };
    return {
      ...item,
      implementationPrice: o.implementationPrice ?? item.implementationPrice,
      monthlyPrice: o.monthlyPrice ?? item.monthlyPrice,
      description: o.description ?? item.description,
      deliverables: o.deliverables ?? item.deliverables,
      updatedAt: o.updatedAt,
    };
  });
}

export const CatalogUpdateSchema = z.object({
  implementationPrice: z.number().min(0).max(10_000_000).optional(),
  monthlyPrice: z.number().min(0).max(1_000_000).optional(),
  description: z.string().min(1).max(2000).optional(),
  deliverables: z.array(z.string().min(1).max(300)).max(20).optional(),
});

export async function updateCatalogItem(id: string, update: z.infer<typeof CatalogUpdateSchema>): Promise<ServiceCatalogItem> {
  const parsed = CatalogUpdateSchema.parse(update);
  if (!DEFAULT_SERVICE_CATALOG.some((i) => i.id === id)) throw new AppError("not_found", "Servicen findes ikke i kataloget.");
  const existing = await catalogOverrideStore.get(id);
  await catalogOverrideStore.upsert({ ...(existing ?? {}), ...parsed, id, updatedAt: nowIso() });
  await publishEvent({ type: "catalog.updated", source: "quotes", mode: null, subject: {}, payload: { id, fields: Object.keys(parsed) } });
  return (await getCatalog()).find((i) => i.id === id)!;
}

export async function resetCatalogItem(id: string): Promise<ServiceCatalogItem> {
  await catalogOverrideStore.remove(id);
  const item = (await getCatalog()).find((i) => i.id === id);
  if (!item) throw new AppError("not_found", "Servicen findes ikke i kataloget.");
  return item;
}
