import { intakeFromHandoff } from "@agency/quotes/server";
import { json, readJson, route } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Offentligt kontraktendepunkt: modtager `research.quote-handoff@1`. Idempotent pr. handoffId. */
export const POST = route(async (req) => json(await intakeFromHandoff(await readJson(req)), 201));
