import { after } from "next/server";
import { json, rateLimit, readJson, route } from "@/lib/http";
import { requestEchoTask } from "@/lib/crm";
import { ensureExecutors } from "@/lib/orchestrator";

export const dynamic = "force-dynamic";

/** Echo-opgave i AOS' Job Center. Opgavetyperne er planlagte → routeren blokerer med en begrundelse. */
export const POST = route<{ params: Promise<{ accountId: string }> }>(async (req, { params }) => {
  ensureExecutors();
  await rateLimit(req, "crm-ai", { limit: 10, windowMs: 60_000 });
  return json(await requestEchoTask((await params).accountId, await readJson(req), after), 202);
});
