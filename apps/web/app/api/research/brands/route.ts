import { getSettings } from "@agency/core/server";
import { CreateBrandSchema, createBrand, listBrandOverviews } from "@agency/research/server";
import { json, readJson, route } from "@/lib/http";

export const dynamic = "force-dynamic";

export const GET = route(async () => {
  const { mode } = await getSettings();
  return json({ mode, brands: await listBrandOverviews(mode) });
});

/** Opretter et brand (genbruger eksisterende med samme domæne) og registrerer relationer med korrekt status. */
export const POST = route(async (req) => {
  const result = await createBrand(CreateBrandSchema.parse(await readJson(req)));
  return json(result, result.created ? 201 : 200);
});
