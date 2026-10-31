import { testIntegration } from "@agency/orchestrator/server";
import { json, rateLimit, route } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Omkostningsfri forbindelsestest (kun hvor en sådan findes). */
export const POST = route<{ params: Promise<{ key: string }> }>(async (req, { params }) => {
  await rateLimit(req, "integration-test", { limit: 10, windowMs: 60_000 });
  return json(await testIntegration((await params).key));
});
