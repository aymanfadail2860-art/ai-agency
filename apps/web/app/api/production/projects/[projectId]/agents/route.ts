import { setAgents } from "@agency/production/server";
import { json, readJson, route } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Tilknyt AOS-agenter (fra Agent Manager) som planlagte ressourcer. */
export const PUT = route<{ params: Promise<{ projectId: string }> }>(async (req, { params }) => json(await setAgents((await params).projectId, await readJson(req))));
