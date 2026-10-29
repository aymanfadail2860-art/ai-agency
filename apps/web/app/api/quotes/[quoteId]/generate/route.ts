import { z } from "zod";
import { generateContent } from "@agency/quotes/server";
import { json, rateLimit, readJson, route } from "@/lib/http";

export const dynamic = "force-dynamic";

const Body = z.object({ versionId: z.string().startsWith("qver_") });

export const POST = route<{ params: Promise<{ quoteId: string }> }>(async (req, { params }) => {
  await rateLimit(req, "quote-generate", { limit: 10, windowMs: 60_000 });
  const { versionId } = Body.parse(await readJson(req));
  return json(await generateContent((await params).quoteId, versionId));
});
