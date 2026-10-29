import { exportQuotePdf } from "@agency/quotes/server";
import { rateLimit, route } from "@/lib/http";

export const dynamic = "force-dynamic";

export const GET = route<{ params: Promise<{ quoteId: string }> }>(async (req, { params }) => {
  // PDF-generering er tung og logger en hændelse — begræns den som en skrivning.
  await rateLimit(req, "quote-pdf", { limit: 20, windowMs: 60_000 });
  const { bytes, filename } = await exportQuotePdf((await params).quoteId, req.nextUrl.searchParams.get("version"));
  return new Response(Buffer.from(bytes), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="${filename.replace(/[^\w.-]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "cache-control": "no-store",
    },
  });
});
