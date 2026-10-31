import { updateActivity } from "@agency/crm/server";
import { json, readJson, route } from "@/lib/http";

export const dynamic = "force-dynamic";

export const PATCH = route<{ params: Promise<{ activityId: string }> }>(async (req, { params }) => json(await updateActivity((await params).activityId, await readJson(req))));
