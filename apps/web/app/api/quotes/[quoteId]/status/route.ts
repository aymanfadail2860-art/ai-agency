import { z } from "zod";
import { json, readJson, route } from "@/lib/http";
import { setQuoteStatus } from "@/lib/crm";

export const dynamic = "force-dynamic";

/** Tilbudsstatus (sendt/afvist) registreres manuelt — platformen sender intet. Tilknyttede CRM-muligheder opdateres. */
export const POST = route<{ params: Promise<{ quoteId: string }> }>(async (req, { params }) => {
  const { status } = z.object({ status: z.enum(["sent", "rejected"]) }).parse(await readJson(req));
  const { quote, opportunities } = await setQuoteStatus((await params).quoteId, status);
  return json({ quoteId: quote.id, status: quote.status, updatedOpportunities: opportunities.map((o) => ({ id: o.id, stage: o.stage })) });
});
