import { json, readJson, route } from "@/lib/http";
import { createQuoteForOpportunity } from "@/lib/crm";

export const dynamic = "force-dynamic";

/** CRM → Tilbud via kontrakten crm.quote-request@1 (genbruger et åbent tilbud — ingen dubletter). */
export const POST = route<{ params: Promise<{ opportunityId: string }> }>(async (req, { params }) => {
  const result = await createQuoteForOpportunity((await params).opportunityId, await readJson(req));
  return json(result, result.created ? 201 : 200);
});
