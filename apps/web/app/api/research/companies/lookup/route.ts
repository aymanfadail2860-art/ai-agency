import { z } from "zod";
import { lookupCompanyByCvr } from "@agency/research/server";
import { json, rateLimit, readJson, route } from "@/lib/http";

export const dynamic = "force-dynamic";

const Body = z.object({ cvr: z.string().min(8).max(16) });

/** Live Mode: rigtigt CVR-opslag. */
export const POST = route(async (req) => {
  await rateLimit(req, "cvr-lookup", { limit: 20, windowMs: 60_000 });
  const { cvr } = Body.parse(await readJson(req));
  return json(await lookupCompanyByCvr(cvr), 201);
});
