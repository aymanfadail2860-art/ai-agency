import { addFile } from "@agency/production/server";
import { json, readJson, route } from "@/lib/http";

export const dynamic = "force-dynamic";

export const POST = route<{ params: Promise<{ projectId: string }> }>(async (req, { params }) => json(await addFile((await params).projectId, await readJson(req)), 201));
