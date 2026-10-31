import { recordCustomerApproval } from "@agency/production/server";
import { json, readJson, route } from "@/lib/http";

export const dynamic = "force-dynamic";

export const POST = route<{ params: Promise<{ projectId: string }> }>(async (req, { params }) => json(await recordCustomerApproval((await params).projectId, await readJson(req))));
