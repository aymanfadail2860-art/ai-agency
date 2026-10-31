import { getSettings } from "@agency/core/server";
import { getCrmDashboard } from "@agency/crm/server";
import { json, route } from "@/lib/http";

export const dynamic = "force-dynamic";

export const GET = route(async (req) => {
  const period = Number(req.nextUrl.searchParams.get("period"));
  return json(await getCrmDashboard((await getSettings()).mode, Number.isFinite(period) && period > 0 ? period : null));
});
