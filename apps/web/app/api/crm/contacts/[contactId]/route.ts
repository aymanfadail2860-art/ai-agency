import { updateContact } from "@agency/crm/server";
import { json, readJson, route } from "@/lib/http";

export const dynamic = "force-dynamic";

export const PATCH = route<{ params: Promise<{ contactId: string }> }>(async (req, { params }) => json(await updateContact((await params).contactId, await readJson(req))));
