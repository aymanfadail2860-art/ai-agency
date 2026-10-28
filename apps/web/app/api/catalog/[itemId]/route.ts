import { CatalogUpdateSchema, resetCatalogItem, updateCatalogItem } from "@agency/quotes/server";
import { json, readJson, route } from "@/lib/http";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ itemId: string }> };

export const PUT = route<Ctx>(async (req, { params }) => json(await updateCatalogItem((await params).itemId, CatalogUpdateSchema.parse(await readJson(req)))));

/** Nulstiller servicen til standardkatalogets værdier. */
export const DELETE = route<Ctx>(async (_req, { params }) => json(await resetCatalogItem((await params).itemId)));
