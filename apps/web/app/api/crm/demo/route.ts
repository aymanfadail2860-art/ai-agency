import { z } from "zod";
import { json, rateLimit, readJson, route } from "@/lib/http";
import { getDemoState, resetCrmDemo, runNextDemoStep } from "@/lib/crm-demo";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const GET = route(async () => json(await getDemoState()));

/** Guidet CRM-demo (kun Demo Mode): `{ action: "step" | "reset" }`. */
export const POST = route(async (req) => {
  await rateLimit(req, "crm-demo", { limit: 30, windowMs: 60_000 });
  const { action } = z.object({ action: z.enum(["step", "reset"]) }).parse(await readJson(req));
  return json(action === "step" ? await runNextDemoStep() : { state: await resetCrmDemo(), message: "Demoen er nulstillet." });
});
