import { json, readJson, route } from "@/lib/http";
import { winOpportunity } from "@/lib/crm";

export const dynamic = "force-dynamic";

/** Vundet: med tilbud accepteres det og overføres til Produktion (idempotent). */
export const POST = route<{ params: Promise<{ opportunityId: string }> }>(async (req, { params }) => json(await winOpportunity((await params).opportunityId, await readJson(req))));
