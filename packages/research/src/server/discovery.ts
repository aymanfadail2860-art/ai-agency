import type { Company, Establishment, Mode } from "@agency/core";
import { brandRegistry, companyRegistry, establishmentRegistry, normalizeDomain, relationRegistry } from "@agency/core/server";
import {
  assertSafeUrl,
  getCvrProvider,
  safeFetch,
  type CvrLookup,
  type CvrSearchHit,
  type EstablishmentRecord,
} from "@agency/integrations";
import { AppError, isAppError, nowIso, validateCvr } from "@agency/shared";
import { DEMO_DATASETS, DEMO_REGISTRY, findDemoLegalEntity } from "./demo-data";
import { parseHtmlPage, selectInternalPages } from "./html";
import { extractBrandName, extractCvrMentions, type CvrMention } from "./website";

/**
 * DISCOVERY (V2) — fælles for CVR- og URL-indgangen
 * --------------------------------------------------
 * Identificerer brand, juridiske enheder og arbejdssteder. Relationer bliver
 * aldrig bekræftet her: et CVR fundet på hjemmesiden eller via navnesøgning
 * er kun et FORSLAG, som brugeren skal bekræfte.
 */

export interface DiscoverySources {
  isDemo: boolean;
  cvr: {
    configured: boolean;
    providerName: string;
    lookup(cvr: string): Promise<CvrLookup>;
    establishment(pNumber: string): Promise<EstablishmentRecord | null>;
    searchByName(name: string): Promise<CvrSearchHit[]>;
  };
  fetchPage(url: string): Promise<{ finalUrl: string; body: string }>;
}

export interface DiscoveredLegalEntity {
  company: Company;
  secondaryNames: string[];
  establishments: Establishment[];
  totalPNumbers: number;
  /** Hvordan enheden blev fundet — bestemmer, om relationen må bekræftes direkte. */
  via: "user_cvr_input" | "website_cvr_mention";
  evidence: { description: string; url: string | null };
}

export interface BrandCandidate {
  name: string;
  website: string | null;
  source: string;
  legalEntityId: string | null;
  existingBrandId: string | null;
}

export interface DiscoveryResult {
  input: { type: "cvr" | "url"; value: string };
  mode: Mode;
  legalEntities: DiscoveredLegalEntity[];
  brandCandidates: BrandCandidate[];
  website: { url: string; domain: string; brandName: string; title: string; description: string; reachable: boolean; error: string | null } | null;
  cvrMentions: Array<Omit<CvrMention, "sourceId"> & { verified: boolean }>;
  nameSearchHits: CvrSearchHit[];
  existingBrand: { id: string; name: string } | null;
  limitations: string[];
  cvrConfigured: boolean;
}

/* -------------------------------------------------------------------------- */
/* Datakilder                                                                  */
/* -------------------------------------------------------------------------- */

export function liveDiscoverySources(): DiscoverySources {
  const provider = getCvrProvider();
  return {
    isDemo: false,
    cvr: {
      configured: provider.isConfigured(),
      providerName: provider.name,
      lookup: (cvr) => provider.lookup(cvr),
      establishment: (p) => provider.establishment(p),
      searchByName: (n) => provider.searchByName(n, 5),
    },
    fetchPage: async (url) => {
      const res = await safeFetch(url);
      return { finalUrl: res.finalUrl, body: res.body };
    },
  };
}

export function demoDiscoverySources(): DiscoverySources {
  return {
    isDemo: true,
    cvr: {
      configured: true,
      providerName: "Fiktivt demoregister",
      async lookup(cvr) {
        const entry = findDemoLegalEntity(cvr);
        if (!entry) throw new AppError("upstream_not_found", `CVR-nummer ${cvr} findes ikke i demoregistret.`);
        return {
          record: { ...entry.company, registrySource: { provider: "demo", retrievedAt: nowIso(), reference: null } },
          secondaryNames: entry.secondaryNames,
          activePNumbers: entry.establishments.map((e) => e.pNumber),
          totalPNumbers: entry.establishments.length,
        };
      },
      async establishment(pNumber) {
        for (const e of DEMO_REGISTRY.flatMap((x) => x.establishments)) {
          if (e.pNumber === pNumber) {
            return {
              pNumber: e.pNumber,
              name: e.name,
              address: { street: e.street, postalCode: e.postalCode, city: e.city, municipality: null, country: "DK" },
              industry: { code: null, text: e.industry },
              active: true,
              source: { provider: "demo", retrievedAt: nowIso(), reference: null },
            };
          }
        }
        return null;
      },
      async searchByName(name) {
        const q = name.toLowerCase();
        return DEMO_REGISTRY.filter((e) => e.company.name.toLowerCase().includes(q) || e.secondaryNames.some((n) => n.toLowerCase().includes(q)))
          .slice(0, 5)
          .map((e) => ({ cvr: e.company.cvr, name: e.company.name, status: e.company.status, city: e.company.address?.city ?? null, industry: e.company.industry?.text ?? null }));
      },
    },
    fetchPage: async (url) => {
      const normalized = url.replace(/#.*$/, "");
      for (const ds of DEMO_DATASETS) {
        const html = ds.pages[normalized] ?? ds.pages[normalized.replace(/\/$/, "")] ?? ds.pages[`${normalized.replace(/\/$/, "")}/`];
        if (html) return { finalUrl: normalized, body: html };
      }
      throw new AppError("integration_error", `Demo-siden ${url} findes ikke.`);
    },
  };
}

/* -------------------------------------------------------------------------- */
/* URL-normalisering                                                           */
/* -------------------------------------------------------------------------- */

/** Validerer og normaliserer en brugerindtastet adresse til https-origin + sti. */
export function normalizeResearchUrl(input: string): { url: string; domain: string } {
  const trimmed = input.trim();
  if (!trimmed || trimmed.length > 500 || /\s/.test(trimmed)) throw new AppError("validation_error", "Angiv en gyldig hjemmesideadresse, fx https://www.eksempel.dk.");
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
  } catch {
    throw new AppError("validation_error", "Angiv en gyldig hjemmesideadresse, fx https://www.eksempel.dk.");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new AppError("validation_error", "Kun http- og https-adresser understøttes.");
  if (!url.hostname.includes(".")) throw new AppError("validation_error", "Adressen skal indeholde et domæne, fx eksempel.dk.");
  url.hash = "";
  url.search = "";
  url.hostname = url.hostname.toLowerCase();
  const path = url.pathname === "/" ? "/" : url.pathname.replace(/\/+$/, "");
  return { url: `${url.protocol}//${url.host}${path}`, domain: normalizeDomain(url.toString()) };
}

/* -------------------------------------------------------------------------- */
/* CVR-indgang                                                                 */
/* -------------------------------------------------------------------------- */

async function registerLegalEntity(lookup: CvrLookup, mode: Mode, ds: DiscoverySources, maxEstablishments = 8) {
  const company = await companyRegistry.register({ ...lookup.record, mode });
  const records: EstablishmentRecord[] = [];
  for (const p of lookup.activePNumbers.slice(0, maxEstablishments)) {
    try {
      const est = await ds.cvr.establishment(p);
      if (est) records.push(est);
    } catch {
      // Arbejdssteder er en berigelse — fejl stopper ikke discovery.
    }
  }
  const establishments = records.length > 0 ? await establishmentRegistry.upsertForLegalEntity(company, records) : await establishmentRegistry.forLegalEntity(company.id);
  return { company, establishments };
}

export async function discoverByCvr(input: string, mode: Mode, ds: DiscoverySources): Promise<DiscoveryResult> {
  const limitations: string[] = [];
  const cvr = input.replace(/^DK/i, "").replace(/[\s.-]/g, "");
  if (ds.isDemo) {
    if (!/^\d{8}$/.test(cvr)) throw new AppError("validation_error", "Et CVR-nummer skal bestå af præcis 8 cifre.");
  } else {
    const validation = validateCvr(cvr);
    if (!validation.valid) throw new AppError("validation_error", validation.reason);
  }
  if (!ds.cvr.configured) {
    throw new AppError("integration_not_configured", `CVR-opslag er ikke konfigureret (${ds.cvr.providerName}). Start i stedet research via hjemmesidens URL, eller se Indstillinger → Integrationer.`);
  }
  const lookup = await ds.cvr.lookup(cvr);
  const { company, establishments } = await registerLegalEntity(lookup, mode, ds);
  if (lookup.totalPNumbers > establishments.length) limitations.push(`Viser ${establishments.length} af ${lookup.totalPNumbers} registrerede P-numre (aktive arbejdssteder hentes, maks. 8).`);

  const demoHints = ds.isDemo ? (findDemoLegalEntity(cvr)?.brandWebsites ?? {}) : {};
  const existingRelations = await relationRegistry.forLegalEntity(company.id);
  const existingBrands = await Promise.all(existingRelations.filter((r) => r.status !== "rejected").map((r) => brandRegistry.get(r.brandId)));

  const names = [company.name, ...lookup.secondaryNames];
  const candidates: BrandCandidate[] = names.map((name, i) => {
    const existing = existingBrands.find((b) => b && b.name.toLowerCase() === name.toLowerCase()) ?? null;
    return {
      name,
      website: demoHints[name] ?? (i === 0 ? company.contact.website : null),
      source: i === 0 ? "Juridisk navn i CVR" : "Binavn registreret i CVR",
      legalEntityId: company.id,
      existingBrandId: existing?.id ?? null,
    };
  });
  for (const b of existingBrands) {
    if (b && !candidates.some((c) => c.existingBrandId === b.id)) {
      candidates.push({ name: b.name, website: null, source: "Eksisterende brand knyttet til CVR-nummeret", legalEntityId: company.id, existingBrandId: b.id });
    }
  }
  if (!company.contact.website && !ds.isDemo) limitations.push("CVR-registret har ingen hjemmeside for virksomheden. Angiv brandets hjemmeside for en fuld analyse — ellers bliver analysen begrænset til registerdata.");
  if (candidates.length > 1) limitations.push("CVR-nummeret har flere mulige brands (binavne). Vælg det brand, der skal analyseres — rapporter og tilbud holdes adskilt pr. brand.");

  return {
    input: { type: "cvr", value: cvr },
    mode,
    legalEntities: [
      {
        company,
        secondaryNames: lookup.secondaryNames,
        establishments,
        totalPNumbers: lookup.totalPNumbers,
        via: "user_cvr_input",
        evidence: { description: "CVR-nummeret blev angivet af brugeren.", url: company.registrySource.reference },
      },
    ],
    brandCandidates: candidates,
    website: null,
    cvrMentions: [],
    nameSearchHits: [],
    existingBrand: null,
    limitations,
    cvrConfigured: true,
  };
}

/* -------------------------------------------------------------------------- */
/* URL-indgang                                                                 */
/* -------------------------------------------------------------------------- */

export async function discoverByUrl(input: string, mode: Mode, ds: DiscoverySources): Promise<DiscoveryResult> {
  const limitations: string[] = [];
  const { url, domain } = normalizeResearchUrl(input);
  if (ds.isDemo && !domain.endsWith(".example")) throw new AppError("mode_mismatch", "I Demo Mode kan kun de fiktive .example-adresser undersøges. Skift til Live Mode for rigtige hjemmesider.");
  if (!ds.isDemo && domain.endsWith(".example")) throw new AppError("mode_mismatch", "Fiktive .example-adresser kan kun bruges i Demo Mode.");

  // SSRF: interne og private adresser afvises, før noget hentes.
  if (!ds.isDemo) await assertSafeUrl(url);
  const existing = await brandRegistry.findByDomain(mode, domain);
  let website: DiscoveryResult["website"] = null;
  const pages: Array<{ sourceId: string; page: ReturnType<typeof parseHtmlPage> }> = [];
  try {
    const home = await ds.fetchPage(url);
    const parsed = parseHtmlPage(home.body, home.finalUrl);
    pages.push({ sourceId: "home", page: parsed });
    // Kontakt-, om- og vilkårssider indeholder oftest CVR-nummeret.
    for (const sub of selectInternalPages(parsed, 6).filter((u) => /kontakt|contact|om-?os|about|betingelser|terms|privat/i.test(u)).slice(0, 3)) {
      try {
        const doc = await ds.fetchPage(sub);
        pages.push({ sourceId: sub, page: parseHtmlPage(doc.body, doc.finalUrl) });
      } catch {
        // ignoreres — discovery fortsætter
      }
    }
    website = {
      url: home.finalUrl,
      domain,
      brandName: extractBrandName(parsed, domain),
      title: parsed.title,
      description: parsed.description,
      reachable: true,
      error: null,
    };
  } catch (err) {
    const message = isAppError(err) ? err.message : "Hjemmesiden kunne ikke hentes.";
    website = { url, domain, brandName: domain.split(".")[0].replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()), title: "", description: "", reachable: false, error: message };
    limitations.push(`Hjemmesiden kunne ikke hentes (${message}). Du kan stadig oprette brandet; researchen bliver begrænset.`);
  }

  const mentions = extractCvrMentions(pages, ds.isDemo);
  const legalEntities: DiscoveredLegalEntity[] = [];
  const cvrMentions: DiscoveryResult["cvrMentions"] = [];
  let nameSearchHits: CvrSearchHit[] = [];

  if (mentions.length > 0 && !ds.cvr.configured) {
    limitations.push(`Hjemmesiden nævner ${mentions.length} CVR-nummer/-numre, men CVR-opslag er ikke konfigureret, så de kan ikke verificeres. Researchen fortsætter uden juridisk enhed.`);
  }
  for (const m of mentions.slice(0, 3)) {
    if (!ds.cvr.configured) {
      cvrMentions.push({ cvr: m.cvr, url: m.url, snippet: m.snippet, verified: false });
      continue;
    }
    try {
      const lookup = await ds.cvr.lookup(m.cvr);
      const { company, establishments } = await registerLegalEntity(lookup, mode, ds, 4);
      cvrMentions.push({ cvr: m.cvr, url: m.url, snippet: m.snippet, verified: true });
      legalEntities.push({
        company,
        secondaryNames: lookup.secondaryNames,
        establishments,
        totalPNumbers: lookup.totalPNumbers,
        via: "website_cvr_mention",
        evidence: { description: `CVR-nummeret står på brandets hjemmeside: "${m.snippet}"`, url: m.url },
      });
    } catch (err) {
      cvrMentions.push({ cvr: m.cvr, url: m.url, snippet: m.snippet, verified: false });
      limitations.push(`CVR ${m.cvr} fra hjemmesiden kunne ikke slås op: ${isAppError(err) ? err.message : "ukendt fejl"}.`);
    }
  }
  if (legalEntities.length > 1) limitations.push("Hjemmesiden nævner flere juridiske enheder. Systemet vælger ikke automatisk — bekræft den eller de relevante relationer.");
  if (mentions.length === 0 && ds.cvr.configured && website?.brandName) {
    try {
      nameSearchHits = await ds.cvr.searchByName(website.brandName);
      if (nameSearchHits.length > 0) limitations.push("Der blev ikke fundet et CVR-nummer på hjemmesiden. Navnesøgningen nedenfor giver kun mulige kandidater — de er ikke verificeret.");
    } catch {
      // navnesøgning er valgfri
    }
  }
  if (legalEntities.length === 0) limitations.push("Ingen juridisk enhed er identificeret. Researchen kan gennemføres fuldt ud for brandet uden CVR.");

  const brandName = website?.brandName ?? domain;
  return {
    input: { type: "url", value: url },
    mode,
    legalEntities,
    brandCandidates: [{ name: brandName, website: website?.url ?? url, source: website?.reachable ? "Udledt af hjemmesiden" : "Udledt af domænet", legalEntityId: null, existingBrandId: existing?.id ?? null }],
    website,
    cvrMentions,
    nameSearchHits,
    existingBrand: existing ? { id: existing.id, name: existing.name } : null,
    limitations,
    cvrConfigured: ds.cvr.configured,
  };
}
