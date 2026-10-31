import { listIntegrations } from "@agency/orchestrator/server";
import { json, route } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Integration Manager — status og påkrævede miljøvariabler (kun navne, aldrig værdier). */
export const GET = route(async () => json(listIntegrations()));
