import { z } from "zod";
import { json, rateLimit, readJson, route } from "@/lib/http";
import { getDashboardDemoStatus, loadDashboardDemo, resetDashboardDemo, runSixModuleFlow } from "@/lib/dashboard-demo";
import { ensureExecutors } from "@/lib/orchestrator";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const GET = route(async () => json(await getDashboardDemoStatus()));

/** Dashboard Demo Mode (kun Demo Mode): indlæs porteføljen, kør det samlede forløb eller nulstil. */
export const POST = route(async (req) => {
  ensureExecutors();
  await rateLimit(req, "dashboard-demo", { limit: 10, windowMs: 60_000 });
  const { action } = z.object({ action: z.enum(["load", "flow", "reset"]) }).parse(await readJson(req));
  return json(action === "load" ? await loadDashboardDemo() : action === "flow" ? await runSixModuleFlow() : await resetDashboardDemo());
});
