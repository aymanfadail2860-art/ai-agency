import { z } from "zod";
import { json, rateLimit, readJson, route } from "@/lib/http";
import { resetProductionDemo, seedProductionDemo } from "@/lib/production";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Indlæs (`{}`) eller nulstil (`{ reset: true }`) demoporteføljen med Restaurant Nord. Kun i Demo Mode. */
export const POST = route(async (req) => {
  await rateLimit(req, "production-demo", { limit: 6, windowMs: 60_000 });
  const { reset } = z.object({ reset: z.boolean().default(false) }).parse(await readJson(req));
  const result = reset ? await resetProductionDemo() : await seedProductionDemo();
  return json({ restaurantNordId: result.restaurantNordId, projects: result.projects.length, created: result.created }, result.created ? 201 : 200);
});
