import { getSettings } from "@agency/core/server";
import { createActivity, listActivities, requireAccount } from "@agency/crm/server";
import { AppError } from "@agency/shared";
import { json, readJson, route } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Aktiviteter (opkald, e-mails, møder, opgaver, opfølgninger, noter, påmindelser). Intet sendes eksternt. */
export const GET = route(async (req) => {
  const p = req.nextUrl.searchParams;
  const view = p.get("view");
  return json(
    await listActivities({
      mode: (await getSettings()).mode,
      accountId: p.get("accountId") ?? undefined,
      kind: p.get("kind") ?? undefined,
      view: view === "planned" || view === "overdue" || view === "upcoming" || view === "done" ? view : "all",
    }),
  );
});

export const POST = route(async (req) => {
  const body = (await readJson(req)) as { accountId?: string };
  const { mode } = await getSettings();
  if (body.accountId && (await requireAccount(body.accountId)).mode !== mode) throw new AppError("mode_mismatch", "Virksomheden tilhører en anden tilstand.");
  // Body valideres med CreateActivitySchema i createActivity.
  return json(await createActivity(body as Parameters<typeof createActivity>[0]), 201);
});
