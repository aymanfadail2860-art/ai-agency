import { PlatformSettingsUpdateSchema } from "@agency/core";
import { getSettings, updateSettings } from "@agency/core/server";
import { json, readJson, route } from "@/lib/http";

export const dynamic = "force-dynamic";

export const GET = route(async () => json(await getSettings()));

export const PUT = route(async (req) => {
  const body = PlatformSettingsUpdateSchema.parse(await readJson(req));
  return json(await updateSettings(body));
});
