import { SaveDraftSchema, getQuote, saveDraft } from "@agency/quotes/server";
import { json, readJson, route } from "@/lib/http";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ quoteId: string }> };

export const GET = route<Ctx>(async (_req, { params }) => json(await getQuote((await params).quoteId)));

/** Gemmer udkast af den aktuelle version. */
export const PUT = route<Ctx>(async (req, { params }) => {
  const body = SaveDraftSchema.parse(await readJson(req));
  return json(await saveDraft((await params).quoteId, body.versionId, body.patch));
});
