import { addDocument } from "@agency/crm/server";
import { json, readJson, route } from "@/lib/http";

export const dynamic = "force-dynamic";

export const POST = route<{ params: Promise<{ accountId: string }> }>(async (req, { params }) => json(await addDocument((await params).accountId, await readJson(req)), 201));
