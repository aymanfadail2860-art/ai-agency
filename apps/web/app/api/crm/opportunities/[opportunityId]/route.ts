import { updateOpportunity } from "@agency/crm/server";
import { json, readJson, route } from "@/lib/http";

export const dynamic = "force-dynamic";

export const PATCH = route<{ params: Promise<{ opportunityId: string }> }>(async (req, { params }) => json(await updateOpportunity((await params).opportunityId, await readJson(req))));
