import { newId, nowIso } from "@agency/shared";
import { CompanySchema, type Company, type CompanyRef } from "../models";
import { createCollectionStore } from "./json-store";
import { publishEvent } from "./events";

/**
 * FÆLLES KUNDEIDENTITET
 * Virksomhedsregistret ejes af platformkernen, så Research, Tilbud og senere
 * CRM/Produktion refererer til præcis den samme `companyId`.
 * En virksomhed identificeres entydigt af (cvr, mode) — demo og live blandes aldrig.
 */
const store = createCollectionStore("platform", "companies", CompanySchema);

export type CompanyInput = Omit<Company, "id" | "createdAt" | "updatedAt">;

export const companyRegistry = {
  list: async (): Promise<Company[]> =>
    (await store.list()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),

  get: (id: string) => store.get(id),

  findByCvr: (cvr: string, mode: Company["mode"]) =>
    store.find((c) => c.cvr === cvr && c.mode === mode),

  /** Opretter eller opdaterer virksomheden og bevarer det stabile id. */
  async register(input: CompanyInput): Promise<Company> {
    const existing = await store.find((c) => c.cvr === input.cvr && c.mode === input.mode);
    const now = nowIso();
    const company: Company = existing
      ? { ...existing, ...input, id: existing.id, createdAt: existing.createdAt, updatedAt: now }
      : { ...input, id: newId("company"), createdAt: now, updatedAt: now };
    const saved = await store.upsert(company);
    await publishEvent({
      type: "company.registered",
      source: "platform",
      mode: saved.mode,
      subject: { companyId: saved.id },
      payload: { cvr: saved.cvr, provider: saved.registrySource.provider, isNew: !existing },
    });
    return saved;
  },

  toRef(company: Company): CompanyRef {
    return { companyId: company.id, cvr: company.cvr, name: company.name };
  },
};

export function formatAddress(company: Pick<Company, "address">): string | null {
  const a = company.address;
  if (!a) return null;
  const line2 = [a.postalCode, a.city].filter(Boolean).join(" ");
  return [a.street, line2].filter(Boolean).join(", ") || null;
}
