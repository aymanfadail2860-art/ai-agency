import { intakeFromHandoff } from "@agency/quotes/server";
import { buildQuoteHandoff, recordHandoff } from "@agency/research/server";
import { json, route } from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * Research → Tilbud.
 * 1. Research bygger kontrakten `research.quote-handoff@1` (valideret).
 * 2. Kontrakten afleveres til Tilbuds offentlige intake (samme kontrakt som POST /api/quotes/intake).
 * 3. Research registrerer overførslen på rapporten.
 * Ingen af modulerne læser den andens lagring.
 */
export const POST = route<{ params: Promise<{ reportId: string }> }>(async (_req, { params }) => {
  const { reportId } = await params;
  const handoff = await buildQuoteHandoff(reportId);
  const result = await intakeFromHandoff(handoff);
  await recordHandoff(reportId, handoff.handoffId, result.quoteId);
  return json({ ...result, handoffId: handoff.handoffId }, 201);
});
