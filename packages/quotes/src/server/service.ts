import { z } from "zod";
import {
  DiscountSchema,
  QuoteContentSchema,
  AnyResearchQuoteHandoffSchema,
  QuoteLineItemSchema,
  type Quote,
  type QuoteIntakeResult,
  type QuoteLineItem,
  type QuoteVersion,
} from "@agency/core";
import { publishEvent } from "@agency/core/server";
import { isAiConfigured } from "@agency/integrations";
import { AppError, isAppError, newId, nowIso } from "@agency/shared";
import { buildTemplateContent } from "../content-template";
import { DEFAULT_VAT_RATE, calculateQuoteTotals } from "../pricing";
import { getCatalog } from "./catalog";
import { generateClaudeContent } from "./claude-content";
import { renderQuotePdf } from "./pdf";
import { quoteRecipient } from "../recipient";
import { quoteStore } from "./store";

/**
 * TILBUDSMODULETS OFFENTLIGE SERVICE-API
 */

export const VersionPatchSchema = z.object({
  lineItems: z.array(QuoteLineItemSchema).max(30).optional(),
  discount: DiscountSchema.optional(),
  specialTerms: z.string().max(5000).optional(),
  validityDays: z.number().int().min(1).max(365).optional(),
  content: QuoteContentSchema.optional(),
  contentEngine: z.enum(["claude", "template", "manual"]).nullable().optional(),
});
export type VersionPatch = z.infer<typeof VersionPatchSchema>;

export const SaveDraftSchema = z.object({ versionId: z.string().startsWith("qver_"), patch: VersionPatchSchema });

function currentVersion(quote: Quote): QuoteVersion {
  const v = quote.versions.find((x) => x.id === quote.currentVersionId);
  if (!v) throw new AppError("internal_error", "Tilbuddet mangler en aktuel version.");
  return v;
}

async function nextQuoteNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `T-${year}-`;
  const max = (await quoteStore.list())
    .map((q) => (q.number.startsWith(prefix) ? Number(q.number.slice(prefix.length)) : 0))
    .reduce((a, b) => Math.max(a, b), 0);
  return `${prefix}${String(max + 1).padStart(4, "0")}`;
}

/** Modtager kontrakten `research.quote-handoff` (v1 eller v2) og opretter et tilbudsudkast. */
export async function intakeFromHandoff(input: unknown): Promise<QuoteIntakeResult> {
  const handoff = AnyResearchQuoteHandoffSchema.parse(input);
  const existing = await quoteStore.find((q) => q.handoffId === handoff.handoffId);
  if (existing) return { quoteId: existing.id, quoteNumber: existing.number, versionId: existing.currentVersionId };

  const catalog = await getCatalog();
  const lineItems: QuoteLineItem[] = handoff.services.map((service) => {
    const item = catalog.find((c) => c.id === service.catalogItemId);
    return {
      id: newId("quoteLineItem"),
      kind: "service",
      catalogItemId: item?.id ?? null,
      sourceRecommendationId: service.recommendationId,
      name: service.serviceName,
      description: service.description || item?.shortDescription || "",
      deliverables: item ? [...item.deliverables] : [],
      implementationPrice: item?.implementationPrice ?? 0,
      monthlyPrice: item?.monthlyPrice ?? 0,
      quantity: 1,
      addOns: [],
      estimatedWeeks: item?.estimatedWeeks ?? { min: 1, max: 4 },
      rationale: service.rationale,
    };
  });

  const now = nowIso();
  const quoteBase =
    handoff.version === 2
      ? {
          company: handoff.legalEntity,
          brand: handoff.brand,
          researchSummary: handoff.researchSummary,
          overallRecommendation: handoff.overallRecommendation,
          researchOpportunities: handoff.opportunities,
          researchInsights: handoff.services.map((s) => ({ serviceName: s.serviceName, rationale: s.rationale, keyFindings: s.keyFindings, note: s.note, proposedSolution: s.proposedSolution, customerQuestions: s.customerQuestions })),
          mode: handoff.mode,
        }
      : {
          company: handoff.company,
          brand: undefined,
          researchSummary: handoff.researchSummary,
          overallRecommendation: undefined,
          researchOpportunities: undefined,
          researchInsights: handoff.services.map((s) => ({ serviceName: s.serviceName, rationale: s.rationale, keyFindings: s.keyFindings, note: s.note })),
          mode: handoff.mode,
        };
  const versionBase = {
    lineItems,
    discount: { kind: "none" as const, value: 0, scope: "all" as const, label: null },
    vatRate: DEFAULT_VAT_RATE,
    validityDays: 30,
  };
  const version: QuoteVersion = {
    id: newId("quoteVersion"),
    versionNumber: 1,
    status: "draft",
    ...versionBase,
    currency: "DKK",
    specialTerms: "",
    content: buildTemplateContent(quoteBase, versionBase, catalog),
    contentEngine: "template",
    contentGeneratedAt: now,
    createdAt: now,
    updatedAt: now,
  };
  const quote: Quote = {
    id: newId("quote"),
    number: await nextQuoteNumber(),
    ...quoteBase,
    sourceReportId: handoff.researchReportId,
    handoffId: handoff.handoffId,
    userNotes: handoff.userNotes,
    status: "draft",
    currentVersionId: version.id,
    versions: [version],
    createdAt: now,
    updatedAt: now,
  };
  await quoteStore.upsert(quote);
  await publishEvent({
    type: "quote.created",
    source: "quotes",
    mode: quote.mode,
    subject: { companyId: quote.company?.companyId, quoteId: quote.id, reportId: handoff.researchReportId },
    payload: { number: quote.number, services: lineItems.length, handoffId: handoff.handoffId, contractVersion: handoff.version, brandId: quote.brand?.brandId ?? null },
  });
  return { quoteId: quote.id, quoteNumber: quote.number, versionId: version.id };
}

export async function listQuotes(mode?: Quote["mode"]) {
  const quotes = (await quoteStore.list()).filter((q) => !mode || q.mode === mode);
  return quotes
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .map((q) => {
      const v = currentVersion(q);
      return { quote: q, currentVersion: v, totals: calculateQuoteTotals(v) };
    });
}

export async function getQuote(quoteId: string): Promise<Quote> {
  const quote = await quoteStore.get(quoteId);
  if (!quote) throw new AppError("not_found", "Tilbuddet blev ikke fundet.");
  return quote;
}

/** Gemmer udkast af den aktuelle version. Tidligere versioner er låste. */
export async function saveDraft(quoteId: string, versionId: string, patch: VersionPatch): Promise<Quote> {
  const parsed = VersionPatchSchema.parse(patch);
  const quote = await getQuote(quoteId);
  if (quote.currentVersionId !== versionId) {
    throw new AppError("conflict", "Kun den aktuelle version kan redigeres. Opret en ny version for at ændre tilbuddet.");
  }
  const updated = await quoteStore.update(quoteId, (q) => ({
    ...q,
    versions: q.versions.map((v) =>
      v.id === versionId
        ? {
            ...v,
            ...Object.fromEntries(Object.entries(parsed).filter(([, value]) => value !== undefined)),
            updatedAt: nowIso(),
          }
        : v,
    ),
    updatedAt: nowIso(),
  }));
  await publishEvent({ type: "quote.draft.saved", source: "quotes", mode: quote.mode, subject: { quoteId, companyId: quote.company?.companyId }, payload: { versionId } });
  return updated!;
}

/** Opretter en ny version som kopi af den aktuelle; den tidligere låses. */
export async function createVersion(quoteId: string): Promise<Quote> {
  const quote = await getQuote(quoteId);
  const current = currentVersion(quote);
  const now = nowIso();
  const next: QuoteVersion = {
    ...structuredClone(current),
    id: newId("quoteVersion"),
    versionNumber: Math.max(...quote.versions.map((v) => v.versionNumber)) + 1,
    status: "draft",
    lineItems: current.lineItems.map((l) => ({ ...structuredClone(l), id: newId("quoteLineItem") })),
    createdAt: now,
    updatedAt: now,
  };
  const updated = await quoteStore.update(quoteId, (q) => ({
    ...q,
    versions: [...q.versions.map((v) => (v.id === current.id ? { ...v, status: "superseded" as const } : v)), next],
    currentVersionId: next.id,
    updatedAt: now,
  }));
  await publishEvent({ type: "quote.version.created", source: "quotes", mode: quote.mode, subject: { quoteId, companyId: quote.company?.companyId }, payload: { versionNumber: next.versionNumber } });
  return updated!;
}

/** Genererer tilbudstekst med Claude (hvis konfigureret) eller den gennemsigtige skabelon. */
export async function generateContent(quoteId: string, versionId: string): Promise<{ quote: Quote; engine: "claude" | "template"; warning: string | null }> {
  const quote = await getQuote(quoteId);
  if (quote.currentVersionId !== versionId) throw new AppError("conflict", "Kun den aktuelle version kan genereres.");
  const version = currentVersion(quote);
  let engine: "claude" | "template" = "template";
  let warning: string | null = null;
  let content = buildTemplateContent(quote, version, await getCatalog());

  if (quote.mode === "live" && isAiConfigured()) {
    try {
      content = (await generateClaudeContent(quote, version)).content;
      engine = "claude";
    } catch (err) {
      warning = `AI-generering fejlede (${isAppError(err) ? err.message : "ukendt fejl"}). Skabelonteksten er brugt i stedet.`;
    }
  } else if (quote.mode === "live") {
    warning = "ANTHROPIC_API_KEY er ikke konfigureret — tilbudsteksten er genereret ud fra skabelon.";
  } else {
    warning = "Demo Mode — tilbudsteksten er genereret ud fra skabelon og fiktive data.";
  }

  const updated = await saveDraft(quoteId, versionId, { content, contentEngine: engine });
  await quoteStore.update(quoteId, (q) => ({
    ...q,
    versions: q.versions.map((v) => (v.id === versionId ? { ...v, contentGeneratedAt: nowIso() } : v)),
  }));
  await publishEvent({ type: "quote.content.generated", source: "quotes", mode: quote.mode, subject: { quoteId }, payload: { engine } });
  return { quote: (await quoteStore.get(updated.id))!, engine, warning };
}

export async function exportQuotePdf(quoteId: string, versionId?: string | null): Promise<{ bytes: Uint8Array; filename: string }> {
  const quote = await getQuote(quoteId);
  const version = versionId ? quote.versions.find((v) => v.id === versionId) : currentVersion(quote);
  if (!version) throw new AppError("not_found", "Versionen blev ikke fundet.");
  const bytes = await renderQuotePdf(quote, version);
  await publishEvent({ type: "quote.pdf.exported", source: "quotes", mode: quote.mode, subject: { quoteId }, payload: { versionNumber: version.versionNumber } });
  const safeName = quoteRecipient(quote).displayName.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "");
  return { bytes, filename: `Tilbud-${quote.number}-v${version.versionNumber}-${safeName}${quote.mode === "demo" ? "-DEMO" : ""}.pdf` };
}
