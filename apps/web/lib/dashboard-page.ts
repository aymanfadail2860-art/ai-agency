import { getSettings } from "@agency/core/server";
import { parseFilter } from "@agency/dashboard";
import { getDashboardData } from "./dashboard";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** Fælles for Dashboardets sider: filtre fra URL'en (valideret server-side) → beregnede data. */
export async function loadDashboard(searchParams: SearchParams) {
  const { mode } = await getSettings();
  const { filter, error } = parseFilter(await searchParams);
  const data = await getDashboardData(mode, filter);
  return { mode, data, error };
}
