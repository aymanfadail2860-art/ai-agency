import { getSettings } from "@agency/core/server";
import { getAgentStates } from "@agency/orchestrator/server";
import { json, route } from "@/lib/http";

export const dynamic = "force-dynamic";

export const GET = route(async () => json(await getAgentStates((await getSettings()).mode)));
