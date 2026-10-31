import { z } from "zod";
import { agentRegistry } from "@agency/orchestrator/server";
import { json, readJson, route } from "@/lib/http";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ agentId: string }> };

export const GET = route<Ctx>(async (_req, { params }) => {
  const { agentId } = await params;
  return json({ agent: await agentRegistry.require(agentId), versions: await agentRegistry.versions(agentId) });
});

/** Aktivér eller deaktivér en agent. Instruktioner ændres kun via nye versioner. */
export const PATCH = route<Ctx>(async (req, { params }) => {
  const body = z.object({ enabled: z.boolean() }).parse(await readJson(req));
  return json(await agentRegistry.setEnabled((await params).agentId, body.enabled));
});
