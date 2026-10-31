import { agentRegistry, NewAgentVersionSchema } from "@agency/orchestrator/server";
import { json, readJson, route } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Opretter en ny, valideret agentversion. Den aktiveres først efter godkendelse. */
export const POST = route<{ params: Promise<{ agentId: string }> }>(async (req, { params }) =>
  json(await agentRegistry.proposeVersion((await params).agentId, NewAgentVersionSchema.parse(await readJson(req))), 201),
);
