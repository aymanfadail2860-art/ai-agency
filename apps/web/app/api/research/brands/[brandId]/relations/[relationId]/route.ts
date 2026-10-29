import { DecideRelationSchema, decideRelation } from "@agency/research/server";
import { json, readJson, route } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Brugerens beslutning: bekræft eller afvis en relation mellem brand og juridisk enhed. */
export const PATCH = route<{ params: Promise<{ brandId: string; relationId: string }> }>(async (req, { params }) => {
  const { brandId, relationId } = await params;
  const { decision } = DecideRelationSchema.parse(await readJson(req));
  return json(await decideRelation(brandId, relationId, decision));
});
