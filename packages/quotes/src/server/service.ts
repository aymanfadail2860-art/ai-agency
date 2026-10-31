import { z } from "zod";
import {
  DiscountSchema,
  QuoteContentSchema,
  AnyResearchQuoteHandoffSchema,
  CrmQuoteRequestSchema,
  QuoteLineItemSchema,
  type ProductionIntakeV2,
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

  const quoteBase: QuoteBase =
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
  return persistNewQuote(quoteBase, lineItems, catalog, {
    sourceReportId: handoff.researchReportId,
    handoffId: handoff.handoffId,
    userNotes: handoff.userNotes,
    eventPayload: { contractVersion: handoff.version },
  });
}

type QuoteBase = Pick<Quote, "company" | "brand" | "researchSummary" | "overallRecommendation" | "researchOpportunities" | "researchInsights" | "mode">;

async function persistNewQuote(
  quoteBase: QuoteBase,
  lineItems: QuoteLineItem[],
  catalog: Awaited<ReturnType<typeof getCatalog>>,
  meta: { sourceReportId: string | null; handoffId: string; userNotes: string; eventPayload: Record<string, unknown> },
): Promise<QuoteIntakeResult> {
  const now = nowIso();
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
    sourceReportId: meta.sourceReportId,
    handoffId: meta.handoffId,
    userNotes: meta.userNotes,
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
    subject: { companyId: quote.company?.companyId, quoteId: quote.id, reportId: meta.sourceReportId ?? undefined },
    payload: { number: quote.number, services: lineItems.length, handoffId: meta.handoffId, brandId: quote.brand?.brandId ?? null, ...meta.eventPayload },
  });
  return { quoteId: quote.id, quoteNumber: quote.number, versionId: version.id };
}

/** CRM → Tilbud (`crm.quote-request@1`): tilbudsudkast for en salgsmulighed. Idempotent pr. requestId. */
export async function intakeFromCrmRequest(input: unknown): Promise<QuoteIntakeResult> {
  const request = CrmQuoteRequestSchema.parse(input);
  const existing = await quoteStore.find((q) => q.handoffId === request.requestId);
  if (existing) return { quoteId: existing.id, quoteNumber: existing.number, versionId: existing.currentVersionId };
  const catalog = await getCatalog();
  const lineItems: QuoteLineItem[] = request.services.map((service) => {
    const item = catalog.find((c) => c.id === service.catalogItemId);
    if (!item) throw new AppError("validation_error", `Ukendt service: ${service.catalogItemId}`);
    return {
      id: newId("quoteLineItem"),
      kind: "service",
      catalogItemId: item.id,
      sourceRecommendationId: null,
      name: item.name,
      description: item.shortDescription,
      deliverables: [...item.deliverables],
      implementationPrice: item.implementationPrice,
      monthlyPrice: item.monthlyPrice,
      quantity: 1,
      addOns: [],
      estimatedWeeks: item.estimatedWeeks,
      rationale: service.note,
    };
  });
  return persistNewQuote(
    {
      company: request.legalEntity,
      brand: request.brand,
      researchSummary: request.researchSummary,
      overallRecommendation: request.overallRecommendation || undefined,
      researchOpportunities: undefined,
      researchInsights: lineItems.map((li) => ({ serviceName: li.name, rationale: li.rationale ?? "Valgt i CRM-salgsmuligheden.", keyFindings: [], note: null })),
      mode: request.mode,
    },
    lineItems,
    catalog,
    { sourceReportId: request.researchReportId, handoffId: request.requestId, userNotes: request.notes, eventPayload: { contract: "crm.quote-request@1", opportunityId: request.opportunity.opportunityId } },
  );
}

/** Tilbuddet er sendt til kunden (registreres manuelt — platformen sender ingen e-mails). */
export async function markQuoteSent(quoteId: string): Promise<Quote> {
  const quote = await getQuote(quoteId);
  if (quote.status === "sent") return quote;
  if (quote.status !== "draft") throw new AppError("conflict", "Kun udkast kan markeres som sendt.");
  const updated = await quoteStore.update(quoteId, (q) => ({ ...q, status: "sent" as const, updatedAt: nowIso() }));
  await publishEvent({ type: "quote.sent", source: "quotes", mode: quote.mode, subject: { quoteId, companyId: quote.company?.companyId }, payload: { versionId: quote.currentVersionId } });
  return updated!;
}

/** Kunden har afvist tilbuddet. Idempotent. */
export async function rejectQuote(quoteId: string): Promise<Quote> {
  const quote = await getQuote(quoteId);
  if (quote.status === "rejected") return quote;
  if (quote.status === "accepted") throw new AppError("conflict", "Tilbuddet er allerede accepteret.");
  const updated = await quoteStore.update(quoteId, (q) => ({ ...q, status: "rejected" as const, updatedAt: nowIso() }));
  await publishEvent({ type: "quote.rejected", source: "quotes", mode: quote.mode, subject: { quoteId, companyId: quote.company?.companyId }, payload: {} });
  return updated!;
}

/** Fjerner et tilbud oprettet af CRM-demoen (kun Demo Mode). */
export async function removeDemoQuote(quoteId: string): Promise<void> {
  const quote = await quoteStore.get(quoteId);
  if (!quote) return;
  if (quote.mode !== "demo" || !quote.handoffId?.startsWith("crq_demo")) throw new AppError("conflict", "Kun CRM-demotilbud kan fjernes.");
  await quoteStore.remove(quoteId);
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

/**
 * Kunden har accepteret tilbuddet (registreres af en medarbejder). Den aktuelle
 * version låses som grundlag for produktionen. Idempotent.
 */
export async function acceptQuote(quoteId: string): Promise<Quote> {
  const quote = await getQuote(quoteId);
  if (quote.status === "accepted") return quote;
  if (quote.status === "rejected") throw new AppError("conflict", "Tilbuddet er afvist og kan ikke accepteres.");
  const updated = await quoteStore.update(quoteId, (q) => ({ ...q, status: "accepted" as const, updatedAt: nowIso() }));
  await publishEvent({ type: "quote.accepted", source: "quotes", mode: quote.mode, subject: { quoteId, companyId: quote.company?.companyId }, payload: { versionId: quote.currentVersionId } });
  return updated!;
}

/** Bygger kontrakten `quotes.production-intake@2` for et accepteret tilbud (brand-first, CVR valgfrit). */
export function buildProductionIntake(quote: Quote): ProductionIntakeV2 {
  if (quote.status !== "accepted") throw new AppError("conflict", "Kun accepterede tilbud kan overføres til produktion.");
  const version = currentVersion(quote);
  const totals = calculateQuoteTotals(version);
  const recipient = quoteRecipient(quote);
  return {
    contract: "quotes.production-intake",
    version: 2,
    intakeId: `pin_${quote.id.slice(4)}_v${version.versionNumber}`,
    sentBy: "quotes",
    acceptedAt: quote.updatedAt,
    mode: quote.mode,
    customer: {
      brandId: quote.brand?.brandId ?? null,
      legalEntity: quote.company ? { companyId: quote.company.companyId, cvr: quote.company.cvr, name: quote.company.name } : null,
      name: recipient.displayName,
    },
    quote: { quoteId: quote.id, quoteNumber: quote.number, versionId: version.id, versionNumber: version.versionNumber },
    lineItems: version.lineItems,
    totals: { implementationExclVat: totals.implementation.exclVat, monthlyExclVat: totals.monthly.exclVat, firstYearExclVat: totals.firstYear.exclVat },
    specialTerms: version.specialTerms,
    requestedStartDate: null,
  };
}
