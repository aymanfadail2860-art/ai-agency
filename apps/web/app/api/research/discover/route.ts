import { DiscoverSchema, discover } from "@agency/research/server";
import { json, rateLimit, readJson, route } from "@/lib/http";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Identificerer brand, juridiske enheder og P-numre ud fra CVR eller URL (henter offentlige sider/CVR). */
export const POST = route(async (req) => {
  await rateLimit(req, "discover", { limit: 20, windowMs: 60_000 });
  return json(await discover(DiscoverSchema.parse(await readJson(req))));
});
