import { moveStage } from "@agency/crm/server";
import { json, readJson, route } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Flyt mellem pipeline-stadier (Kanban). "Tabt" kræver en årsag. "Vundet" med tilbud går via /win. */
export const POST = route<{ params: Promise<{ opportunityId: string }> }>(async (req, { params }) => json(await moveStage((await params).opportunityId, await readJson(req))));
