import { getSettings } from "@agency/core/server";
import { DashboardFilterSchema } from "@agency/dashboard";
import { json, route } from "@/lib/http";
import { getDashboardData } from "@/lib/dashboard";

export const dynamic = "force-dynamic";

/** Dashboardets beregnede data (samme som siderne). Filtre som query-parametre; valideres server-side (400 ved ugyldige). */
export const GET = route(async (req) => {
  const filter = DashboardFilterSchema.parse(Object.fromEntries(req.nextUrl.searchParams.entries()));
  return json(await getDashboardData((await getSettings()).mode, filter));
});
