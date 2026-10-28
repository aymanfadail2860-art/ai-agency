import { ModeSchema } from "@agency/core";
import { getSettings } from "@agency/core/server";
import { listQuotes } from "@agency/quotes/server";
import { json, route } from "@/lib/http";

export const dynamic = "force-dynamic";

export const GET = route(async (req) => {
  const requested = ModeSchema.safeParse(req.nextUrl.searchParams.get("mode"));
  const mode = requested.success ? requested.data : (await getSettings()).mode;
  return json({ mode, quotes: await listQuotes(mode) });
});
