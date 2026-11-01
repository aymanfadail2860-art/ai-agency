import { z } from "zod";
import type { Mode } from "@agency/core";
import { brandRegistry, companyRegistry, publishEvent, relationRegistry } from "@agency/core/server";
import { AppError, newId, nowIso } from "@agency/shared";
import {
  AccountStatusSchema,
  ActivityKindSchema,
  CompanySizeSchema,
  LEAD_STATUSES,
  LeadSourceSchema,
  StageSchema,
  defaultProbability,
  stageIndex,
  stageLabel,
  type Activity,
  type AccountStatus,
  type Contact,
  type CrmAccount,
  type Opportunity,
  type Stage,
} from "../contracts";
import { accountStore, activityStore, contactStore, opportunityStore } from "./store";

/**
 * CRM — service-API (server)
 * Virksomheder bygger på platformens brands (ingen dubletter). Research,
 * tilbud og projekter læses fra deres egne moduler i kompositionslaget.
 */

export const accountIdForBrand = (brandId: string) => `acc_${brandId.slice(brandId.indexOf("_") + 1)}`;
const DEFAULT_OWNER = "Mig";
const DateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Dato skal være ÅÅÅÅ-MM-DD.");
const Text = (max: number) => z.string().trim().max(max).default("");

// ─── Virksomheder ───────────────────────────────────────────────────────────

export const CreateAccountSchema = z.object({
  brandId: z.string().startsWith("brd_").optional(),
  name: z.string().trim().min(1, "Angiv virksomhedsnavn.").max(200),
  website: z.string().trim().max(500).optional().transform((v) => (v ? v : undefined)),
  cvr: z.string().trim().regex(/^\d{8}$/, "CVR skal være 8 cifre.").optional().or(z.literal("").transform(() => undefined)),
  industry: Text(120),
  address: Text(300),
  phone: Text(40),
  email: Text(200),
  size: CompanySizeSchema.default("unknown"),
  source: LeadSourceSchema.default("other"),
  status: AccountStatusSchema.default("new_lead"),
  owner: z.string().trim().max(80).default(DEFAULT_OWNER),
  notes: Text(8000),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
});
export type CreateAccountInput = z.input<typeof CreateAccountSchema>;

function normalizeUrl(url: string): string {
  const withProtocol = /^https?:\/\//i.test(url) ? url : `https://${url}`;
  const parsed = new URL(withProtocol);
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") throw new AppError("validation_error", "Ugyldig hjemmeside.");
  return parsed.toString();
}

/** Bekræftet juridisk enhed for brandet (bruges til at forudfylde CVR og adresse). */
async function confirmedLegalEntity(brandId: string) {
  const relations = (await relationRegistry.forBrand(brandId)).filter((r) => r.status === "confirmed");
  return relations.length === 1 ? companyRegistry.get(relations[0]!.legalEntityId) : null;
}

/**
 * Opretter en CRM-virksomhed — eller genbruger den eksisterende. Brandet findes
 * via id, domæne eller navn; kontoens id afledes af brandet, så samtidige
 * oprettelser aldrig giver dubletter.
 */
export async function createAccount(raw: CreateAccountInput, ctx: { mode: Mode; isDemo?: boolean }): Promise<{ account: CrmAccount; created: boolean }> {
  const input = CreateAccountSchema.parse(raw);
  const website = input.website ? normalizeUrl(input.website) : null;
  let brand = input.brandId ? await brandRegistry.get(input.brandId) : null;
  if (input.brandId && !brand) throw new AppError("validation_error", "Brandet findes ikke.");
  if (brand && brand.mode !== ctx.mode) throw new AppError("mode_mismatch", "Kunden tilhører en anden tilstand (Demo/Live).");
  if (!brand && !website) {
    const sameName = (await brandRegistry.list(ctx.mode)).find((b) => b.name.trim().toLowerCase() === input.name.toLowerCase());
    if (sameName) brand = sameName;
  }
  if (!brand) brand = (await brandRegistry.create({ name: input.name, mode: ctx.mode, websiteUrl: website, createdVia: "crm", dedupeByName: true })).brand;

  const id = accountIdForBrand(brand.id);
  const existing = await accountStore.get(id);
  if (existing) return { account: existing, created: false };

  const legal = await confirmedLegalEntity(brand.id);
  const websites = await brandRegistry.websites(brand.id);
  const address = legal?.address ? [legal.address.street, [legal.address.postalCode, legal.address.city].filter(Boolean).join(" ")].filter(Boolean).join(", ") : "";
  const now = nowIso();
  const account = await accountStore.upsert({
    id,
    brandId: brand.id,
    mode: ctx.mode,
    isDemo: ctx.isDemo ?? false,
    name: brand.name,
    website: website ?? websites[0]?.url ?? null,
    cvr: input.cvr ?? legal?.cvr ?? null,
    industry: input.industry || legal?.industry?.text || "",
    address: input.address || address,
    phone: input.phone || legal?.contact.phone || "",
    email: input.email || legal?.contact.email || "",
    size: input.size,
    source: input.source,
    status: input.status,
    owner: input.owner || DEFAULT_OWNER,
    notes: input.notes,
    tags: Array.from(new Set(input.tags)),
    linkedReportIds: [],
    documents: [],
    statusHistory: [{ at: now, from: null, to: input.status, note: "Oprettet i CRM." }],
    createdAt: now,
    updatedAt: now,
  });
  await publishEvent({ type: "crm.account.created", source: "crm", mode: ctx.mode, subject: {}, payload: { accountId: id, brandId: brand.id, source: input.source } });
  return { account, created: true };
}

export async function requireAccount(id: string): Promise<CrmAccount> {
  const account = await accountStore.get(id);
  if (!account) throw new AppError("not_found", "Virksomheden blev ikke fundet i CRM.");
  return account;
}

export async function findAccountByBrand(brandId: string): Promise<CrmAccount | null> {
  return accountStore.get(accountIdForBrand(brandId));
}

export const UpdateAccountSchema = z.object({
  industry: z.string().trim().max(120).optional(),
  address: z.string().trim().max(300).optional(),
  phone: z.string().trim().max(40).optional(),
  email: z.string().trim().max(200).optional(),
  website: z.string().trim().max(500).nullable().optional(),
  cvr: z.string().trim().regex(/^\d{8}$/, "CVR skal være 8 cifre.").nullable().optional(),
  size: CompanySizeSchema.optional(),
  source: LeadSourceSchema.optional(),
  status: AccountStatusSchema.optional(),
  owner: z.string().trim().max(80).optional(),
  notes: z.string().max(8000).optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  statusNote: z.string().trim().max(300).optional(),
});

export async function updateAccount(id: string, raw: unknown): Promise<CrmAccount> {
  const patch = UpdateAccountSchema.parse(raw);
  const updated = await accountStore.update(id, (a) => {
    const status = patch.status ?? a.status;
    return {
      ...a,
      industry: patch.industry ?? a.industry,
      address: patch.address ?? a.address,
      phone: patch.phone ?? a.phone,
      email: patch.email ?? a.email,
      website: patch.website === undefined ? a.website : patch.website ? normalizeUrl(patch.website) : null,
      cvr: patch.cvr === undefined ? a.cvr : patch.cvr,
      size: patch.size ?? a.size,
      source: patch.source ?? a.source,
      status,
      owner: patch.owner ?? a.owner,
      notes: patch.notes ?? a.notes,
      tags: patch.tags ? Array.from(new Set(patch.tags)) : a.tags,
      statusHistory: status !== a.status ? [...a.statusHistory, { at: nowIso(), from: a.status, to: status, note: patch.statusNote ?? "" }].slice(-100) : a.statusHistory,
      updatedAt: nowIso(),
    };
  });
  if (!updated) throw new AppError("not_found", "Virksomheden blev ikke fundet i CRM.");
  return updated;
}

/** Statusskift fra automatik (fx vundet aftale) — kun fremad, aldrig tilbage. */
async function promoteStatus(accountId: string, to: AccountStatus, note: string) {
  const order: AccountStatus[] = ["new_lead", "working", "qualified", "customer"];
  const account = await accountStore.get(accountId);
  if (!account) return;
  const from = order.indexOf(account.status);
  if (from === -1 || from >= order.indexOf(to)) return;
  await updateAccount(accountId, { status: to, statusNote: note });
}

/** Kunden bliver aktiv kunde (fx når en vundet aftale er overført til Produktion). */
export async function markAsCustomer(accountId: string, note: string): Promise<void> {
  await promoteStatus(accountId, "customer", note);
}

export async function linkReport(accountId: string, reportId: string): Promise<CrmAccount> {
  const updated = await accountStore.update(accountId, (a) => (a.linkedReportIds.includes(reportId) ? a : { ...a, linkedReportIds: [...a.linkedReportIds, reportId].slice(-50), updatedAt: nowIso() }));
  if (!updated) throw new AppError("not_found", "Virksomheden blev ikke fundet i CRM.");
  return updated;
}

export const AddDocumentSchema = z.object({ title: z.string().trim().min(1, "Angiv titel.").max(200), url: z.string().trim().url("Ugyldig URL.").max(2000).refine((u) => /^https?:\/\//i.test(u), "Kun http(s)-links.") });

export async function addDocument(accountId: string, raw: unknown): Promise<CrmAccount> {
  const input = AddDocumentSchema.parse(raw);
  const updated = await accountStore.update(accountId, (a) => ({ ...a, documents: [...a.documents, { id: `doc_${globalThis.crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`, ...input, addedAt: nowIso() }].slice(-50), updatedAt: nowIso() }));
  if (!updated) throw new AppError("not_found", "Virksomheden blev ikke fundet i CRM.");
  return updated;
}

// ─── Kontaktpersoner ────────────────────────────────────────────────────────

export const ContactInputSchema = z.object({
  name: z.string().trim().min(1, "Angiv navn.").max(120),
  title: Text(120),
  email: z.string().trim().max(200).default("").refine((v) => !v || z.string().email().safeParse(v).success, "Ugyldig e-mail."),
  phone: Text(40),
  isPrimary: z.boolean().default(false),
  marketingConsent: z.boolean().default(false),
  notes: Text(2000),
});

export async function createContact(accountId: string, raw: unknown): Promise<{ contact: Contact; created: boolean }> {
  const input = ContactInputSchema.parse(raw);
  await requireAccount(accountId);
  const contacts = (await contactStore.list()).filter((c) => c.accountId === accountId);
  const duplicate = contacts.find((c) => (input.email && c.email.toLowerCase() === input.email.toLowerCase()) || (!input.email && c.name.toLowerCase() === input.name.toLowerCase()));
  if (duplicate) return { contact: duplicate, created: false };
  const now = nowIso();
  const isPrimary = input.isPrimary || contacts.length === 0;
  if (isPrimary) for (const c of contacts.filter((x) => x.isPrimary)) await contactStore.update(c.id, (x) => ({ ...x, isPrimary: false, updatedAt: now }));
  const contact = await contactStore.upsert({ id: newId("crmContact"), accountId, ...input, isPrimary, createdAt: now, updatedAt: now });
  return { contact, created: true };
}

export async function updateContact(contactId: string, raw: unknown): Promise<Contact> {
  const patch = ContactInputSchema.partial().parse(raw);
  const current = await contactStore.get(contactId);
  if (!current) throw new AppError("not_found", "Kontaktpersonen blev ikke fundet.");
  if (patch.isPrimary) {
    for (const c of (await contactStore.list()).filter((x) => x.accountId === current.accountId && x.isPrimary && x.id !== contactId)) await contactStore.update(c.id, (x) => ({ ...x, isPrimary: false, updatedAt: nowIso() }));
  }
  return (await contactStore.update(contactId, (c) => ({ ...c, ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)), updatedAt: nowIso() })))!;
}

// ─── Salgsmuligheder ────────────────────────────────────────────────────────

export const CreateOpportunitySchema = z.object({
  accountId: z.string().startsWith("acc_"),
  title: z.string().trim().min(1, "Angiv titel.").max(200),
  services: z.array(z.string().max(60)).max(10).default([]),
  implementationValue: z.number().min(0).max(100_000_000).default(0),
  monthlyValue: z.number().min(0).max(10_000_000).default(0),
  expectedCloseDate: DateString.nullable().default(null),
  probability: z.number().int().min(0).max(100).optional(),
  owner: z.string().trim().max(80).default(DEFAULT_OWNER),
  stage: StageSchema.default("new_lead"),
  primaryContactId: z.string().startsWith("con_").nullable().default(null),
  reportId: z.string().startsWith("rrep_").nullable().default(null),
});

export async function createOpportunity(raw: z.input<typeof CreateOpportunitySchema>, ctx: { isDemo?: boolean } = {}): Promise<Opportunity> {
  const input = CreateOpportunitySchema.parse(raw);
  if (input.stage === "won" || input.stage === "lost") throw new AppError("validation_error", "En ny salgsmulighed kan ikke oprettes som vundet eller tabt.");
  const account = await requireAccount(input.accountId);
  const now = nowIso();
  const opp = await opportunityStore.upsert({
    id: newId("salesOpportunity"),
    accountId: account.id,
    mode: account.mode,
    isDemo: ctx.isDemo ?? account.isDemo,
    title: input.title,
    services: input.services,
    implementationValue: input.implementationValue,
    monthlyValue: input.monthlyValue,
    expectedCloseDate: input.expectedCloseDate,
    probability: input.probability ?? defaultProbability(input.stage),
    owner: input.owner || DEFAULT_OWNER,
    stage: input.stage,
    status: "open",
    lostReason: "",
    primaryContactId: input.primaryContactId,
    reportId: input.reportId,
    quoteId: null,
    projectId: null,
    history: [{ at: now, kind: "created", message: `Oprettet i stadiet ${stageLabel(input.stage)}.`, from: null, to: input.stage }],
    closedAt: null,
    createdAt: now,
    updatedAt: now,
  });
  if (stageIndex(input.stage) >= stageIndex("qualified")) await promoteStatus(account.id, "qualified", `Salgsmulighed oprettet: ${input.title}`);
  else await promoteStatus(account.id, "working", `Salgsmulighed oprettet: ${input.title}`);
  return opp;
}

export async function requireOpportunity(id: string): Promise<Opportunity> {
  const opp = await opportunityStore.get(id);
  if (!opp) throw new AppError("not_found", "Salgsmuligheden blev ikke fundet.");
  return opp;
}

export const UpdateOpportunitySchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  services: z.array(z.string().max(60)).max(10).optional(),
  implementationValue: z.number().min(0).max(100_000_000).optional(),
  monthlyValue: z.number().min(0).max(10_000_000).optional(),
  expectedCloseDate: DateString.nullable().optional(),
  probability: z.number().int().min(0).max(100).optional(),
  owner: z.string().trim().max(80).optional(),
  primaryContactId: z.string().startsWith("con_").nullable().optional(),
});

export async function updateOpportunity(id: string, raw: unknown): Promise<Opportunity> {
  const patch = UpdateOpportunitySchema.parse(raw);
  const updated = await opportunityStore.update(id, (o) => {
    const valueChanged = (patch.implementationValue !== undefined && patch.implementationValue !== o.implementationValue) || (patch.monthlyValue !== undefined && patch.monthlyValue !== o.monthlyValue);
    const next = { ...o, ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)), updatedAt: nowIso() } as Opportunity;
    if (valueChanged) next.history = [...o.history, { at: nowIso(), kind: "value" as const, message: `Værdi: ${next.implementationValue.toLocaleString("da-DK")} kr. implementering + ${next.monthlyValue.toLocaleString("da-DK")} kr./md.`, from: null, to: null }].slice(-200);
    return next;
  });
  if (!updated) throw new AppError("not_found", "Salgsmuligheden blev ikke fundet.");
  return updated;
}

export const MoveStageSchema = z.object({ stage: StageSchema, note: z.string().trim().max(400).default(""), lostReason: z.string().trim().max(500).default("") });

/** Flyt mellem stadier (Kanban). Tabt kræver en årsag; vundet/tabt lukker muligheden. */
export async function moveStage(id: string, raw: unknown, source = "Bruger"): Promise<Opportunity> {
  const input = MoveStageSchema.parse(raw);
  const current = await requireOpportunity(id);
  if (current.stage === input.stage) return current;
  if (input.stage === "lost" && !input.lostReason) throw new AppError("validation_error", "Angiv hvorfor salgsmuligheden er tabt.");
  const now = nowIso();
  const status = input.stage === "won" ? "won" : input.stage === "lost" ? "lost" : "open";
  const updated = await opportunityStore.update(id, (o) => ({
    ...o,
    stage: input.stage,
    status,
    probability: defaultProbability(input.stage),
    lostReason: input.stage === "lost" ? input.lostReason : "",
    closedAt: status === "open" ? null : now,
    history: [
      ...o.history,
      {
        at: now,
        kind: status === "won" ? ("won" as const) : status === "lost" ? ("lost" as const) : ("stage" as const),
        message: `${stageLabel(o.stage)} → ${stageLabel(input.stage)}${input.lostReason ? ` · Årsag: ${input.lostReason}` : ""}${input.note ? ` · ${input.note}` : ""} (${source})`,
        from: o.stage,
        to: input.stage,
      },
    ].slice(-200),
    updatedAt: now,
  }));
  // Vundet gør ikke i sig selv kunden aktiv: det sker, når aftalen er overført til Produktion (eller manuelt).
  if (status !== "lost" && stageIndex(input.stage) >= stageIndex("qualified")) await promoteStatus(current.accountId, "qualified", `Salgsmulighed i ${stageLabel(input.stage)}`);
  await publishEvent({ type: "crm.opportunity.stage_changed", source: "crm", mode: current.mode, subject: {}, payload: { opportunityId: id, from: current.stage, to: input.stage } });
  return updated!;
}

export async function linkQuote(opportunityId: string, quoteId: string, quoteNumber: string): Promise<Opportunity> {
  const updated = await opportunityStore.update(opportunityId, (o) =>
    o.quoteId === quoteId ? o : { ...o, quoteId, history: [...o.history, { at: nowIso(), kind: "quote" as const, message: `Tilbud ${quoteNumber} tilknyttet.`, from: null, to: null }].slice(-200), updatedAt: nowIso() },
  );
  if (!updated) throw new AppError("not_found", "Salgsmuligheden blev ikke fundet.");
  return updated;
}

export async function linkProject(opportunityId: string, projectId: string, projectName: string): Promise<Opportunity> {
  const updated = await opportunityStore.update(opportunityId, (o) =>
    o.projectId === projectId ? o : { ...o, projectId, history: [...o.history, { at: nowIso(), kind: "project" as const, message: `Produktionsprojekt oprettet: ${projectName}.`, from: null, to: null }].slice(-200), updatedAt: nowIso() },
  );
  if (!updated) throw new AppError("not_found", "Salgsmuligheden blev ikke fundet.");
  return updated;
}

/**
 * Tilbud → CRM: opdatér salgsmuligheder, der refererer til tilbuddet.
 *  - sendt     → stadiet "Tilbud sendt" (kun fremad)
 *  - accepteret → vundet (kundens accept er den eneste automatiske vej til vundet)
 *  - afvist    → noteres; stadiet ændres ikke automatisk (sælgeren afgør tabt/forhandling)
 * At et tilbud er oprettet eller sendt gør aldrig en aftale vundet.
 */
export async function syncFromQuote(quote: { id: string; number: string; status: "draft" | "sent" | "accepted" | "rejected" }): Promise<Opportunity[]> {
  const linked = (await opportunityStore.list()).filter((o) => o.quoteId === quote.id);
  const out: Opportunity[] = [];
  for (const opp of linked) {
    if (quote.status === "sent" && opp.status === "open" && stageIndex(opp.stage) < stageIndex("quote_sent")) {
      out.push(await moveStage(opp.id, { stage: "quote_sent", note: `Tilbud ${quote.number} markeret som sendt` }, "Tilbud"));
    } else if (quote.status === "accepted" && opp.status !== "won") {
      out.push(await moveStage(opp.id, { stage: "won", note: `Tilbud ${quote.number} accepteret af kunden` }, "Tilbud"));
    } else if (quote.status === "rejected" && opp.status === "open") {
      const updated = await opportunityStore.update(opp.id, (o) => ({ ...o, history: [...o.history, { at: nowIso(), kind: "note" as const, message: `Tilbud ${quote.number} afvist af kunden — afgør om muligheden skal forhandles eller markeres som tabt.`, from: null, to: null }].slice(-200), updatedAt: nowIso() }));
      out.push(updated!);
    }
  }
  return out;
}

// ─── Aktiviteter ────────────────────────────────────────────────────────────

export const CreateActivitySchema = z.object({
  accountId: z.string().startsWith("acc_"),
  contactId: z.string().startsWith("con_").nullable().default(null),
  opportunityId: z.string().startsWith("sop_").nullable().default(null),
  kind: ActivityKindSchema,
  subject: z.string().trim().min(1, "Angiv emne.").max(200),
  description: Text(4000),
  dueAt: z.string().datetime({ offset: true }).optional(),
  owner: z.string().trim().max(80).default(DEFAULT_OWNER),
  priority: z.enum(["low", "normal", "high"]).default("normal"),
  status: z.enum(["planned", "done"]).default("planned"),
  outcome: Text(2000),
  nextStep: Text(500),
});

export async function createActivity(raw: z.input<typeof CreateActivitySchema>): Promise<Activity> {
  const input = CreateActivitySchema.parse(raw);
  const account = await requireAccount(input.accountId);
  if (input.contactId) {
    const c = await contactStore.get(input.contactId);
    if (!c || c.accountId !== account.id) throw new AppError("validation_error", "Kontaktpersonen hører ikke til virksomheden.");
  }
  if (input.opportunityId) {
    const o = await opportunityStore.get(input.opportunityId);
    if (!o || o.accountId !== account.id) throw new AppError("validation_error", "Salgsmuligheden hører ikke til virksomheden.");
  }
  const now = nowIso();
  const status = input.kind === "note" ? "done" : input.status;
  const activity = await activityStore.upsert({
    id: newId("crmActivity"),
    accountId: account.id,
    contactId: input.contactId,
    opportunityId: input.opportunityId,
    mode: account.mode,
    isDemo: account.isDemo,
    kind: input.kind,
    subject: input.subject,
    description: input.description,
    dueAt: input.dueAt ?? now,
    owner: input.owner || DEFAULT_OWNER,
    priority: input.priority,
    status,
    outcome: input.outcome,
    nextStep: input.nextStep,
    completedAt: status === "done" ? now : null,
    createdAt: now,
    updatedAt: now,
  });
  if (status === "done" && ["call", "email", "meeting"].includes(input.kind)) await promoteStatus(account.id, "working", `Kontakt: ${input.subject}`);
  await publishEvent({ type: "crm.activity.logged", source: "crm", mode: account.mode, subject: {}, payload: { activityId: activity.id, kind: activity.kind, status } });
  return activity;
}

export const UpdateActivitySchema = z.object({
  status: z.enum(["planned", "done", "cancelled"]).optional(),
  outcome: z.string().trim().max(2000).optional(),
  nextStep: z.string().trim().max(500).optional(),
  dueAt: z.string().datetime({ offset: true }).optional(),
  priority: z.enum(["low", "normal", "high"]).optional(),
  owner: z.string().trim().max(80).optional(),
  description: z.string().trim().max(4000).optional(),
});

export async function updateActivity(id: string, raw: unknown): Promise<Activity> {
  const patch = UpdateActivitySchema.parse(raw);
  const updated = await activityStore.update(id, (a) => {
    const status = patch.status ?? a.status;
    return {
      ...a,
      ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)),
      status,
      completedAt: status === "done" ? (a.completedAt ?? nowIso()) : null,
      updatedAt: nowIso(),
    } as Activity;
  });
  if (!updated) throw new AppError("not_found", "Aktiviteten blev ikke fundet.");
  if (patch.status === "done" && ["call", "email", "meeting"].includes(updated.kind)) await promoteStatus(updated.accountId, "working", `Kontakt: ${updated.subject}`);
  return updated;
}

// ─── Forespørgsler ──────────────────────────────────────────────────────────

export interface AccountSummary {
  account: CrmAccount;
  contacts: number;
  openOpportunities: number;
  pipeline: { implementation: number; monthly: number };
  lastContactAt: string | null;
  nextActivity: Pick<Activity, "id" | "subject" | "dueAt" | "kind"> | null;
  overdueActivities: number;
}

const isOverdue = (a: Activity, now = Date.now()) => a.status === "planned" && new Date(a.dueAt).getTime() < now;

export async function listAccounts(mode: Mode): Promise<AccountSummary[]> {
  const [accounts, contacts, opps, activities] = await Promise.all([accountStore.list(), contactStore.list(), opportunityStore.list(), activityStore.list()]);
  const now = Date.now();
  return accounts
    .filter((a) => a.mode === mode)
    .map((account) => {
      const own = activities.filter((x) => x.accountId === account.id);
      const open = opps.filter((o) => o.accountId === account.id && o.status === "open");
      const done = own.filter((x) => x.status === "done" && ["call", "email", "meeting"].includes(x.kind)).sort((a, b) => (b.completedAt ?? b.dueAt).localeCompare(a.completedAt ?? a.dueAt));
      const next = own.filter((x) => x.status === "planned").sort((a, b) => a.dueAt.localeCompare(b.dueAt))[0];
      return {
        account,
        contacts: contacts.filter((c) => c.accountId === account.id).length,
        openOpportunities: open.length,
        pipeline: { implementation: open.reduce((s, o) => s + o.implementationValue, 0), monthly: open.reduce((s, o) => s + o.monthlyValue, 0) },
        lastContactAt: done[0] ? (done[0].completedAt ?? done[0].dueAt) : null,
        nextActivity: next ? { id: next.id, subject: next.subject, dueAt: next.dueAt, kind: next.kind } : null,
        overdueActivities: own.filter((x) => isOverdue(x, now)).length,
      };
    })
    .sort((a, b) => b.account.updatedAt.localeCompare(a.account.updatedAt));
}

export interface AccountCore {
  account: CrmAccount;
  contacts: Contact[];
  opportunities: Opportunity[];
  activities: Activity[];
}

export async function getAccountCore(id: string): Promise<AccountCore> {
  const account = await requireAccount(id);
  const [contacts, opps, activities] = await Promise.all([contactStore.list(), opportunityStore.list(), activityStore.list()]);
  return {
    account,
    contacts: contacts.filter((c) => c.accountId === id).sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary) || a.name.localeCompare(b.name)),
    opportunities: opps.filter((o) => o.accountId === id).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    activities: activities.filter((a) => a.accountId === id).sort((a, b) => b.dueAt.localeCompare(a.dueAt)),
  };
}

export async function listOpportunities(mode: Mode): Promise<Array<Opportunity & { accountName: string; nextActivity: Pick<Activity, "id" | "subject" | "dueAt"> | null }>> {
  const [opps, accounts, activities] = await Promise.all([opportunityStore.list(), accountStore.list(), activityStore.list()]);
  const names = new Map(accounts.map((a) => [a.id, a.name]));
  return opps
    .filter((o) => o.mode === mode)
    .map((o) => {
      const next = activities.filter((a) => a.opportunityId === o.id && a.status === "planned").sort((a, b) => a.dueAt.localeCompare(b.dueAt))[0];
      return { ...o, accountName: names.get(o.accountId) ?? "Ukendt", nextActivity: next ? { id: next.id, subject: next.subject, dueAt: next.dueAt } : null };
    })
    .sort((a, b) => (a.expectedCloseDate ?? "9999").localeCompare(b.expectedCloseDate ?? "9999"));
}

export interface ActivityFilter {
  mode: Mode;
  accountId?: string;
  opportunityId?: string;
  kind?: string;
  view?: "all" | "planned" | "overdue" | "upcoming" | "done";
}

export async function listActivities(filter: ActivityFilter): Promise<Array<Activity & { accountName: string }>> {
  const [activities, accounts] = await Promise.all([activityStore.list(), accountStore.list()]);
  const names = new Map(accounts.map((a) => [a.id, a.name]));
  const now = Date.now();
  const week = now + 7 * 86_400_000;
  return activities
    .filter((a) => a.mode === filter.mode)
    .filter((a) => (!filter.accountId || a.accountId === filter.accountId) && (!filter.opportunityId || a.opportunityId === filter.opportunityId) && (!filter.kind || a.kind === filter.kind))
    .filter((a) => {
      const t = new Date(a.dueAt).getTime();
      switch (filter.view) {
        case "planned":
          return a.status === "planned";
        case "overdue":
          return isOverdue(a, now);
        case "upcoming":
          return a.status === "planned" && t >= now && t <= week;
        case "done":
          return a.status === "done";
        default:
          return true;
      }
    })
    .map((a) => ({ ...a, accountName: names.get(a.accountId) ?? "Ukendt" }))
    .sort((a, b) => (filter.view === "planned" || filter.view === "upcoming" || filter.view === "overdue" ? a.dueAt.localeCompare(b.dueAt) : b.dueAt.localeCompare(a.dueAt)));
}

export interface CrmDashboard {
  mode: Mode;
  periodDays: number | null;
  counts: {
    newLeads: number;
    activeLeads: number;
    qualifiedLeads: number;
    plannedMeetings: number;
    wonDeals: number;
    lostDeals: number;
    activeCustomers: number;
    upcomingFollowUps: number;
    overdueActivities: number;
    openOpportunities: number;
  };
  pipeline: { implementation: number; monthly: number; weightedImplementation: number; weightedMonthly: number };
  won: { implementation: number; monthly: number };
  recentActivities: Array<Activity & { accountName: string }>;
}

/** CRM's eget salgsdashboard — kun registrerede data i den valgte tilstand og periode. */
export async function getCrmDashboard(mode: Mode, periodDays: number | null): Promise<CrmDashboard> {
  const [accounts, opps, activities] = await Promise.all([accountStore.list(), opportunityStore.list(), activityStore.list()]);
  const now = Date.now();
  const since = periodDays ? new Date(now - periodDays * 86_400_000).toISOString() : "";
  const inPeriod = (iso: string | null) => Boolean(iso) && (!since || iso! >= since);
  const ownAccounts = accounts.filter((a) => a.mode === mode);
  const ownOpps = opps.filter((o) => o.mode === mode);
  const ownActs = activities.filter((a) => a.mode === mode);
  const open = ownOpps.filter((o) => o.status === "open");
  const won = ownOpps.filter((o) => o.status === "won" && inPeriod(o.closedAt));
  const names = new Map(accounts.map((a) => [a.id, a.name]));
  const week = now + 7 * 86_400_000;
  return {
    mode,
    periodDays,
    counts: {
      newLeads: ownAccounts.filter((a) => inPeriod(a.createdAt) && a.statusHistory[0]?.to === "new_lead").length,
      activeLeads: ownAccounts.filter((a) => LEAD_STATUSES.includes(a.status)).length,
      qualifiedLeads: ownAccounts.filter((a) => a.status === "qualified").length,
      plannedMeetings: ownActs.filter((a) => a.kind === "meeting" && a.status === "planned" && new Date(a.dueAt).getTime() >= now).length,
      wonDeals: won.length,
      lostDeals: ownOpps.filter((o) => o.status === "lost" && inPeriod(o.closedAt)).length,
      activeCustomers: ownAccounts.filter((a) => a.status === "customer").length,
      upcomingFollowUps: ownActs.filter((a) => a.status === "planned" && new Date(a.dueAt).getTime() >= now && new Date(a.dueAt).getTime() <= week).length,
      overdueActivities: ownActs.filter((a) => isOverdue(a, now)).length,
      openOpportunities: open.length,
    },
    pipeline: {
      implementation: open.reduce((s, o) => s + o.implementationValue, 0),
      monthly: open.reduce((s, o) => s + o.monthlyValue, 0),
      weightedImplementation: Math.round(open.reduce((s, o) => s + (o.implementationValue * o.probability) / 100, 0)),
      weightedMonthly: Math.round(open.reduce((s, o) => s + (o.monthlyValue * o.probability) / 100, 0)),
    },
    won: { implementation: won.reduce((s, o) => s + o.implementationValue, 0), monthly: won.reduce((s, o) => s + o.monthlyValue, 0) },
    recentActivities: ownActs
      .filter((a) => a.status === "done" && inPeriod(a.completedAt))
      .sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? ""))
      .slice(0, 12)
      .map((a) => ({ ...a, accountName: names.get(a.accountId) ?? "Ukendt" })),
  };
}

/** Sletter en demovirksomhed med kontakter, muligheder og aktiviteter (kun demodata). */
export async function deleteDemoAccount(accountId: string): Promise<void> {
  const account = await accountStore.get(accountId);
  if (!account) return;
  if (!account.isDemo || account.mode !== "demo") throw new AppError("conflict", "Kun CRM-demodata kan nulstilles.");
  const [contacts, opps, activities] = await Promise.all([contactStore.list(), opportunityStore.list(), activityStore.list()]);
  for (const c of contacts.filter((x) => x.accountId === accountId)) await contactStore.remove(c.id);
  for (const o of opps.filter((x) => x.accountId === accountId)) await opportunityStore.remove(o.id);
  for (const a of activities.filter((x) => x.accountId === accountId)) await activityStore.remove(a.id);
  await accountStore.remove(accountId);
}

/**
 * KUN DEMODATA: tilbagedaterer en demo-markeret virksomhed eller salgsmulighed, så
 * Dashboard-demoen kan vise et realistisk forløb over tid. Afviser alt, der ikke er
 * demo-markeret i Demo Mode — rigtige poster kan aldrig ændres herigennem.
 */
export async function backdateDemoRecord(kind: "account" | "opportunity", id: string, at: { createdAt: string; closedAt?: string | null }): Promise<void> {
  const createdAt = z.string().datetime().parse(at.createdAt);
  if (kind === "account") {
    const a = await requireAccount(id);
    if (!a.isDemo || a.mode !== "demo") throw new AppError("conflict", "Kun CRM-demodata kan tilbagedateres.");
    await accountStore.update(id, (x) => ({ ...x, createdAt, statusHistory: x.statusHistory.map((h, i) => (i === 0 ? { ...h, at: createdAt } : h)) }));
    return;
  }
  const o = await requireOpportunity(id);
  if (!o.isDemo || o.mode !== "demo") throw new AppError("conflict", "Kun CRM-demodata kan tilbagedateres.");
  const closedAt = at.closedAt === undefined ? o.closedAt : at.closedAt === null ? null : z.string().datetime().parse(at.closedAt);
  await opportunityStore.update(id, (x) => ({
    ...x,
    createdAt,
    closedAt: x.status === "open" ? null : closedAt,
    history: x.history.map((h, i) => (i === 0 ? { ...h, at: createdAt } : (h.kind === "won" || h.kind === "lost") && closedAt ? { ...h, at: closedAt } : h)),
  }));
}

export async function opportunitiesForQuote(quoteId: string): Promise<Opportunity[]> {
  return (await opportunityStore.list()).filter((o) => o.quoteId === quoteId);
}

export { LEAD_STATUSES };
