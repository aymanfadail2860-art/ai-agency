import { getSettings } from "@agency/core/server";
import { listJobs } from "@agency/orchestrator/server";
import { json, route } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Job Center: opgaver for den aktuelle tilstand, med valgfrie filtre. */
export const GET = route(async (req) => {
  const p = req.nextUrl.searchParams;
  const { mode } = await getSettings();
  return json(
    await listJobs({
      mode,
      module: p.get("module") ?? undefined,
      status: p.get("status") ?? undefined,
      agentId: p.get("agentId") ?? undefined,
      brandId: p.get("brandId") ?? undefined,
      taskType: p.get("taskType") ?? undefined,
      limit: Math.min(Number(p.get("limit") ?? 200) || 200, 500),
    }),
  );
});
