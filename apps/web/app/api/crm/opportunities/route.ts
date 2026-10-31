import { getSettings } from "@agency/core/server";
import { createOpportunity, listOpportunities, requireAccount } from "@agency/crm/server";
import { AppError } from "@agency/shared";
import { json, readJson, route } from "@/lib/http";

export const dynamic = "force-dynamic";

export const GET = route(async () => json(await listOpportunities((await getSettings()).mode)));

export const POST = route(async (req) => {
  const body = (await readJson(req)) as { accountId?: string };
  const { mode } = await getSettings();
  if (body.accountId && (await requireAccount(body.accountId)).mode !== mode) throw new AppError("mode_mismatch", "Virksomheden tilhører en anden tilstand.");
  // Body valideres med CreateOpportunitySchema i createOpportunity.
  return json(await createOpportunity(body as Parameters<typeof createOpportunity>[0]), 201);
});
