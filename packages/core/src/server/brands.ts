import { createHash } from "node:crypto";
import { AppError, newId, nowIso } from "@agency/shared";
import {
  BrandLegalEntityRelationSchema,
  BrandSchema,
  EstablishmentSchema,
  WebsiteSchema,
  type Brand,
  type BrandLegalEntityRelation,
  type Company,
  type Establishment,
  type Mode,
  type VerificationStatus,
  type Website,
} from "../models";
import { companyRegistry } from "./companies";
import { publishEvent } from "./events";
import { createCollectionStore } from "./json-store";

/**
 * BRAND-FIRST IDENTITET (V2)
 * --------------------------
 * Brandet er det primære analyseobjekt. Juridiske enheder (CVR) og
 * arbejdssteder (P-numre) er berigelser, som knyttes til brandet via
 * relationer med kilde og verificeringsstatus. Relationer oprettes aldrig
 * som "confirmed", medmindre brugeren selv har angivet eller bekræftet dem.
 */
const brandStore = createCollectionStore("platform", "brands", BrandSchema);
const websiteStore = createCollectionStore("platform", "websites", WebsiteSchema);
const relationStore = createCollectionStore("platform", "brand-legal-relations", BrandLegalEntityRelationSchema);
const establishmentStore = createCollectionStore("platform", "establishments", EstablishmentSchema);

/**
 * Deterministiske id'er for nye brands/hjemmesider med en naturlig nøgle
 * (domæne eller — for CRM — normaliseret navn): samtidige oprettelser fra
 * flere serverinstanser skriver til samme post i stedet for at lave dubletter.
 */
const stableId = (prefix: string, key: string) => `${prefix}_${createHash("sha256").update(key).digest("hex").slice(0, 20)}`;
const normalizeName = (name: string) => name.trim().toLowerCase().replace(/\s+/g, " ");

export function normalizeDomain(input: string): string {
  const url = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`);
  return url.hostname.toLowerCase().replace(/^www\./, "");
}

type Evidence = BrandLegalEntityRelation["evidence"][number];

export const brandRegistry = {
  async list(mode?: Mode): Promise<Brand[]> {
    return (await brandStore.list()).filter((b) => !mode || b.mode === mode).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  },

  async get(id: string): Promise<Brand | null> {
    return brandStore.get(id);
  },

  async require(id: string): Promise<Brand> {
    const brand = await brandStore.get(id);
    if (!brand) throw new AppError("not_found", "Brandet blev ikke fundet.");
    return brand;
  },

  async findByDomain(mode: Mode, domain: string): Promise<Brand | null> {
    const d = domain.toLowerCase().replace(/^www\./, "");
    const direct = await brandStore.find((b) => b.mode === mode && b.primaryDomain === d);
    if (direct) return direct;
    const site = await websiteStore.find((w) => w.domain === d);
    if (!site) return null;
    const brand = await brandStore.get(site.brandId);
    return brand && brand.mode === mode ? brand : null;
  },

  /** Finder et eksisterende brand med samme navn knyttet til samme juridiske enhed (undgår dubletter uden domæne). */
  async findByNameAndLegalEntity(mode: Mode, name: string, legalEntityId: string): Promise<Brand | null> {
    const relations = (await relationStore.list()).filter((r) => r.legalEntityId === legalEntityId && r.status !== "rejected");
    for (const r of relations) {
      const brand = await brandStore.get(r.brandId);
      if (brand && brand.mode === mode && brand.name.trim().toLowerCase() === name.trim().toLowerCase()) return brand;
    }
    return null;
  },

  /** Opretter et brand — eller genbruger et eksisterende med samme domæne. */
  async create(input: { name: string; mode: Mode; websiteUrl: string | null; createdVia: Brand["createdVia"]; description?: string | null; discoveredVia?: Website["discoveredVia"]; dedupeByName?: boolean }): Promise<{ brand: Brand; created: boolean }> {
    const domain = input.websiteUrl ? normalizeDomain(input.websiteUrl) : null;
    if (domain) {
      const existing = await brandRegistry.findByDomain(input.mode, domain);
      if (existing) return { brand: existing, created: false };
    }
    const key = domain ? `${input.mode}:domain:${domain}` : input.dedupeByName ? `${input.mode}:name:${normalizeName(input.name)}` : null;
    if (key) {
      const existing = await brandStore.get(stableId("brd", key));
      if (existing) return { brand: existing, created: false };
    }
    const now = nowIso();
    const brand = await brandStore.upsert({
      id: key ? stableId("brd", key) : newId("brand"),
      name: input.name.trim(),
      mode: input.mode,
      primaryDomain: domain,
      description: input.description ?? null,
      createdVia: input.createdVia,
      createdAt: now,
      updatedAt: now,
    });
    if (input.websiteUrl) await brandRegistry.addWebsite(brand.id, input.websiteUrl, input.discoveredVia ?? "user", true);
    await publishEvent({ type: "brand.created", source: "platform", mode: brand.mode, subject: {}, payload: { brandId: brand.id, via: brand.createdVia } });
    return { brand, created: true };
  },

  async touch(id: string): Promise<void> {
    await brandStore.update(id, (b) => ({ ...b, updatedAt: nowIso() }));
  },

  async addWebsite(brandId: string, url: string, discoveredVia: Website["discoveredVia"], isPrimary = false): Promise<Website> {
    const domain = normalizeDomain(url);
    const existing = await websiteStore.find((w) => w.brandId === brandId && w.domain === domain);
    if (existing) return existing;
    const now = nowIso();
    return websiteStore.upsert({ id: stableId("web", `${brandId}:${domain}`), brandId, url, domain, isPrimary, discoveredVia, createdAt: now, updatedAt: now });
  },

  async websites(brandId: string): Promise<Website[]> {
    return (await websiteStore.list()).filter((w) => w.brandId === brandId).sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary));
  },
};

export const relationRegistry = {
  async forBrand(brandId: string): Promise<BrandLegalEntityRelation[]> {
    return (await relationStore.list()).filter((r) => r.brandId === brandId);
  },

  async forLegalEntity(legalEntityId: string): Promise<BrandLegalEntityRelation[]> {
    return (await relationStore.list()).filter((r) => r.legalEntityId === legalEntityId);
  },

  /**
   * Opretter eller beriger en relation. En afvist relation forbliver afvist,
   * og en relation bliver kun "confirmed", hvis det eksplicit angives.
   */
  async upsert(brandId: string, entity: Company, status: Exclude<VerificationStatus, "rejected">, evidence: Evidence): Promise<BrandLegalEntityRelation> {
    const existing = await relationStore.find((r) => r.brandId === brandId && r.legalEntityId === entity.id);
    const now = nowIso();
    if (existing) {
      const nextStatus: VerificationStatus = existing.status === "rejected" ? "rejected" : status === "confirmed" ? "confirmed" : existing.status;
      const sameEvidence = existing.evidence.some((e) => e.method === evidence.method && e.url === evidence.url);
      return (await relationStore.update(existing.id, (r) => ({
        ...r,
        status: nextStatus,
        evidence: sameEvidence ? r.evidence : [...r.evidence, evidence],
        decidedAt: nextStatus !== existing.status ? now : r.decidedAt,
        updatedAt: now,
      })))!;
    }
    const relation = await relationStore.upsert({
      id: newId("brandRelation"),
      brandId,
      legalEntityId: entity.id,
      cvr: entity.cvr,
      status,
      evidence: [evidence],
      decidedAt: status === "confirmed" ? now : null,
      createdAt: now,
      updatedAt: now,
    });
    await publishEvent({ type: "brand.relation.updated", source: "platform", mode: entity.mode, subject: { companyId: entity.id }, payload: { brandId, status } });
    return relation;
  },

  /** Brugerens beslutning om en foreslået relation. */
  async decide(relationId: string, decision: "confirmed" | "rejected"): Promise<BrandLegalEntityRelation> {
    const now = nowIso();
    const updated = await relationStore.update(relationId, (r) => ({
      ...r,
      status: decision,
      evidence: decision === "confirmed" && !r.evidence.some((e) => e.method === "user_confirmed")
        ? [...r.evidence, { method: "user_confirmed" as const, description: "Bekræftet af brugeren i platformen.", url: null }]
        : r.evidence,
      decidedAt: now,
      updatedAt: now,
    }));
    if (!updated) throw new AppError("not_found", "Relationen blev ikke fundet.");
    await publishEvent({ type: "brand.relation.updated", source: "platform", mode: null, subject: { companyId: updated.legalEntityId }, payload: { brandId: updated.brandId, status: decision } });
    return updated;
  },
};

export const establishmentRegistry = {
  async upsertForLegalEntity(legalEntity: Company, items: Array<Omit<Establishment, "id" | "legalEntityId" | "mode" | "createdAt" | "updatedAt">>): Promise<Establishment[]> {
    const existing = (await establishmentStore.list()).filter((e) => e.legalEntityId === legalEntity.id);
    const now = nowIso();
    const saved: Establishment[] = [];
    for (const item of items) {
      const prev = existing.find((e) => e.pNumber === item.pNumber);
      saved.push(
        await establishmentStore.upsert({
          ...item,
          id: prev?.id ?? newId("establishment"),
          legalEntityId: legalEntity.id,
          mode: legalEntity.mode,
          createdAt: prev?.createdAt ?? now,
          updatedAt: now,
        }),
      );
    }
    return saved;
  },

  async forLegalEntity(legalEntityId: string): Promise<Establishment[]> {
    return (await establishmentStore.list()).filter((e) => e.legalEntityId === legalEntityId).sort((a, b) => Number(b.active) - Number(a.active));
  },
};

/**
 * Idempotent backfill af V1-data: hver virksomhed uden brand får et brand
 * (createdVia "legacy_v1") og en bekræftet relation, så V1-rapporter og
 * -tilbud kan vises i V2 uden at ændre de oprindelige poster.
 * Id'erne afledes af virksomhedens id, så samtidige kørsler (flere
 * serverinstanser) skriver til de samme poster i stedet for at lave dubletter.
 */
const legacyId = (prefix: "brd" | "blr" | "web", companyId: string) => `${prefix}_${companyId.slice(companyId.indexOf("_") + 1)}`;

export async function backfillLegacyCompanies(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const [companies, relations] = await Promise.all([companyRegistry.list(), relationStore.list()]);
  for (const company of companies) {
    const rel = relations.find((r) => r.legalEntityId === company.id && r.evidence.some((e) => e.method === "legacy_v1"));
    if (rel) {
      map.set(company.id, rel.brandId);
      continue;
    }
    const anyRel = relations.find((r) => r.legalEntityId === company.id);
    if (anyRel) continue; // virksomheden er allerede knyttet til et V2-brand
    const now = nowIso();
    const brand = await brandStore.upsert({
      id: legacyId("brd", company.id),
      name: company.name,
      mode: company.mode,
      primaryDomain: company.contact.website ? normalizeDomain(company.contact.website) : null,
      description: null,
      createdVia: "legacy_v1",
      createdAt: company.createdAt,
      updatedAt: now,
    });
    if (company.contact.website) {
      const url = company.contact.website;
      await websiteStore.upsert({ id: legacyId("web", company.id), brandId: brand.id, url, domain: normalizeDomain(url), isPrimary: true, discoveredVia: "legacy_v1", createdAt: now, updatedAt: now });
    }
    await relationStore.upsert({
      id: legacyId("blr", company.id),
      brandId: brand.id,
      legalEntityId: company.id,
      cvr: company.cvr,
      status: "confirmed",
      evidence: [{ method: "legacy_v1", description: "Overført fra V1, hvor research blev startet fra CVR-nummeret.", url: company.registrySource.reference }],
      decidedAt: now,
      createdAt: now,
      updatedAt: now,
    });
    map.set(company.id, brand.id);
  }
  return map;
}
