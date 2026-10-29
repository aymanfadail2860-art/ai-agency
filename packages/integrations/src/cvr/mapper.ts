import type { CvrLookup, CvrRecord, CvrSearchHit, EstablishmentRecord } from "./types";

/**
 * Mapper Erhvervsstyrelsens CVR-datastruktur ("Vrvirksomhed"), som både
 * cvr.dev og distribution.virk.dk returnerer, til platformens model.
 * Hemmelige kontaktoplysninger frasorteres (dataminimering).
 */
type Period = { gyldigFra?: string | null; gyldigTil?: string | null } | null | undefined;
type Contact = { kontaktoplysning?: string | null; hemmelig?: boolean | null; periode?: Period };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Raw = Record<string, any>;

function currentPublic(list: Contact[] | null | undefined): string | null {
  const entries = (list ?? []).filter((c) => c && c.hemmelig !== true && c.kontaktoplysning);
  const current = entries.find((c) => !c.periode?.gyldigTil) ?? null;
  return current?.kontaktoplysning ?? null;
}

function currentOf<T extends { periode?: Period }>(list: T[] | null | undefined): T | null {
  const items = list ?? [];
  return items.find((i) => !i.periode?.gyldigTil) ?? items[items.length - 1] ?? null;
}

function formatStreet(a: Raw): string | null {
  if (!a?.vejnavn) return a?.fritekst ?? null;
  const number = [a.husnummerFra, a.bogstavFra].filter((v) => v != null).join("");
  const floor = [a.etage, a.sidedoer].filter(Boolean).join(". ");
  return [a.vejnavn, number].filter(Boolean).join(" ") + (floor ? `, ${floor}.` : "");
}

function normalizeWebsite(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

export function mapVrvirksomhed(v: Raw, provider: CvrRecord["registrySource"]["provider"], reference: string | null): CvrRecord {
  const meta: Raw = v.virksomhedMetadata ?? {};
  const name: string = meta.nyesteNavn?.navn ?? currentOf<Raw>(v.navne)?.navn ?? "Ukendt virksomhed";
  const addr: Raw | null = meta.nyesteBeliggenhedsadresse ?? currentOf<Raw>(v.beliggenhedsadresse);
  const branch: Raw | null = meta.nyesteHovedbranche ?? currentOf<Raw>(v.hovedbranche);
  const form: Raw | null = meta.nyesteVirksomhedsform ?? currentOf<Raw>(v.virksomhedsform);
  const employment: Raw | null =
    meta.nyesteAarsbeskaeftigelse ?? meta.nyesteKvartalsbeskaeftigelse ?? meta.nyesteMaanedsbeskaeftigelse ?? null;

  return {
    cvr: String(v.cvrNummer).padStart(8, "0"),
    name,
    address: addr
      ? {
          street: formatStreet(addr),
          postalCode: addr.postnummer != null ? String(addr.postnummer) : null,
          city: addr.postdistrikt ?? addr.bynavn ?? null,
          municipality: addr.kommune?.kommuneNavn ?? null,
          country: addr.landekode ?? "DK",
        }
      : null,
    industry: branch ? { code: branch.branchekode ? String(branch.branchekode) : null, text: branch.branchetekst ?? "" } : null,
    companyForm: form
      ? { code: form.virksomhedsformkode != null ? String(form.virksomhedsformkode) : null, text: form.langBeskrivelse ?? form.kortBeskrivelse ?? "" }
      : null,
    status: meta.sammensatStatus ?? currentOf<Raw>(v.virksomhedsstatus)?.status ?? null,
    foundedAt: meta.stiftelsesDato ?? currentOf<Raw>(v.livsforloeb)?.periode?.gyldigFra ?? null,
    employees: employment
      ? {
          count: employment.antalAnsatte ?? null,
          interval: employment.intervalKodeAntalAnsatte ?? null,
          year: employment.aar ?? null,
        }
      : null,
    contact: {
      phone: currentPublic(v.telefonNummer),
      email: currentPublic(v.elektroniskPost),
      website: normalizeWebsite(currentPublic(v.hjemmeside)),
    },
    adProtected: Boolean(v.reklamebeskyttet),
    registrySource: { provider, retrievedAt: new Date().toISOString(), reference },
  };
}

/** V2: binavne og aktive P-numre ud over registerposten. */
export function mapVrvirksomhedLookup(v: Raw, provider: CvrRecord["registrySource"]["provider"], reference: string | null): CvrLookup {
  const record = mapVrvirksomhed(v, provider, reference);
  const secondaryNames = Array.from(
    new Set(
      ((v.binavne as Raw[] | undefined) ?? [])
        .filter((b) => b?.navn && !b.periode?.gyldigTil)
        .map((b) => String(b.navn).trim())
        .filter((n) => n && n.toLowerCase() !== record.name.toLowerCase()),
    ),
  ).slice(0, 20);
  const pUnits = ((v.penheder as Raw[] | undefined) ?? []).filter((p) => p?.pNummer);
  const activePNumbers = pUnits.filter((p) => !p.periode?.gyldigTil).map((p) => String(p.pNummer));
  return { record, secondaryNames, activePNumbers, totalPNumbers: pUnits.length };
}

export function mapProduktionsenhed(p: Raw, provider: CvrRecord["registrySource"]["provider"]): EstablishmentRecord {
  const meta: Raw = p.produktionsEnhedMetadata ?? {};
  const addr: Raw | null = meta.nyesteBeliggenhedsadresse ?? currentOf<Raw>(p.beliggenhedsadresse);
  const branch: Raw | null = meta.nyesteHovedbranche ?? currentOf<Raw>(p.hovedbranche);
  const name: string = meta.nyesteNavn?.navn ?? currentOf<Raw>(p.navne)?.navn ?? `P-nummer ${p.pNummer}`;
  const status: string | null = meta.sammensatStatus ?? null;
  return {
    pNumber: String(p.pNummer).padStart(10, "0"),
    name,
    address: addr
      ? {
          street: formatStreet(addr),
          postalCode: addr.postnummer != null ? String(addr.postnummer) : null,
          city: addr.postdistrikt ?? addr.bynavn ?? null,
          municipality: addr.kommune?.kommuneNavn ?? null,
          country: addr.landekode ?? "DK",
        }
      : null,
    industry: branch ? { code: branch.branchekode ? String(branch.branchekode) : null, text: branch.branchetekst ?? "" } : null,
    active: status ? !/ophørt|inaktiv/i.test(status) : !currentOf<Raw>(p.livsforloeb)?.periode?.gyldigTil,
    source: { provider, retrievedAt: new Date().toISOString(), reference: `https://datacvr.virk.dk/enhed/produktionsenhed/${p.pNummer}` },
  };
}

export function mapSearchHit(v: Raw): CvrSearchHit {
  const meta: Raw = v.virksomhedMetadata ?? {};
  return {
    cvr: String(v.cvrNummer).padStart(8, "0"),
    name: meta.nyesteNavn?.navn ?? currentOf<Raw>(v.navne)?.navn ?? "Ukendt",
    status: meta.sammensatStatus ?? null,
    city: meta.nyesteBeliggenhedsadresse?.postdistrikt ?? null,
    industry: meta.nyesteHovedbranche?.branchetekst ?? null,
  };
}
