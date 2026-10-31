import { getSettings } from "@agency/core/server";
import { getActivity } from "@agency/orchestrator/server";
import { json, route } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Live Activity: kun registrerede hændelser fra Job Center. */
export const GET = route(async (req) => {
  const { mode } = await getSettings();
  const since = req.nextUrl.searchParams.get("since") ?? undefined;
  return json({ mode, items: await getActivity(mode, 150, since) });
});
