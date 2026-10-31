import { createContact } from "@agency/crm/server";
import { json, readJson, route } from "@/lib/http";

export const dynamic = "force-dynamic";

export const POST = route<{ params: Promise<{ accountId: string }> }>(async (req, { params }) => {
  const result = await createContact((await params).accountId, await readJson(req));
  return json(result, result.created ? 201 : 200);
});
