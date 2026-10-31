import { getSettings } from "@agency/core/server";
import { createAccount, listAccounts, type CreateAccountInput } from "@agency/crm/server";
import { json, readJson, route } from "@/lib/http";

export const dynamic = "force-dynamic";

export const GET = route(async () => json(await listAccounts((await getSettings()).mode)));

/** Opretter en virksomhed — eller returnerer den eksisterende (samme brand/domæne/navn). */
export const POST = route(async (req) => {
  const { mode } = await getSettings();
  // Body valideres med CreateAccountSchema i createAccount.
  const result = await createAccount((await readJson(req)) as CreateAccountInput, { mode });
  return json(result, result.created ? 201 : 200);
});
