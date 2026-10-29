import { ProposeRelationSchema, proposeLegalEntity } from "@agency/research/server";
import { json, rateLimit, readJson, route } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Foreslår en juridisk enhed (CVR) for brandet — oprettes altid som "suggested". */
export const POST = route<{ params: Promise<{ brandId: string }> }>(async (req, { params }) => {
  await rateLimit(req, "cvr-lookup", { limit: 20, windowMs: 60_000 });
  const { cvr } = ProposeRelationSchema.parse(await readJson(req));
  return json(await proposeLegalEntity((await params).brandId, cvr), 201);
});
