import { getSettings } from "@agency/core/server";
import { getAgentStates, getCommandCenter } from "@agency/orchestrator/server";
import { json, route } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Command Center + agentstatus til Agent Office (polles af brugerfladen). */
export const GET = route(async () => {
  const { mode } = await getSettings();
  const [stats, agents] = await Promise.all([getCommandCenter(mode), getAgentStates(mode)]);
  return json({ stats, agents });
});
