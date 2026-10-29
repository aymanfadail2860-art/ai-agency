import type { WebsiteAnalysis, WebsiteFeature } from "@agency/core";
import { collapseWhitespace, truncate, validateCvr } from "@agency/shared";
import type { ParsedPage } from "./html";
import type { ObservedFeature, PageWithSource } from "./signals";

/**
 * WEBSITE INTELLIGENCE (V2)
 * Klassificerer sider, udtrækker brandnavn og CVR-omtaler og opgør digitale
 * funktioner som observeret / ikke observeret / ukendt. Fravær på de
 * undersøgte sider er aldrig bevis for, at virksomheden mangler løsningen.
 */

export type PageType =
  | "home" | "about" | "services" | "products" | "pricing" | "booking" | "contact"
  | "faq" | "terms" | "privacy" | "careers" | "other";

const PAGE_TYPE_PATTERNS: Array<[PageType, RegExp]> = [
  ["about", /om-?os|about|hvem-er-vi|virksomheden/i],
  ["services", /ydelser|services|loesninger|løsninger|behandlinger/i],
  ["products", /produkter|products|shop|sortiment|kollektion/i],
  ["pricing", /priser|pris|prices|pricing/i],
  ["booking", /booking|book|bestil/i],
  ["contact", /kontakt|contact/i],
  ["faq", /faq|ofte-stillede|hjaelp|hjælp|help/i],
  ["terms", /handelsbetingelser|betingelser|terms|vilkaar|vilkår/i],
  ["privacy", /privatliv|privacy|persondata|cookie/i],
  ["careers", /job|karriere|career|ledige/i],
];

export const PAGE_TYPE_LABELS: Record<PageType, string> = {
  home: "Forside", about: "Om os", services: "Services", products: "Produkter", pricing: "Priser",
  booking: "Booking", contact: "Kontakt", faq: "FAQ", terms: "Handelsbetingelser", privacy: "Privatlivspolitik",
  careers: "Job/karriere", other: "Anden side",
};

export function classifyPage(url: string, isHome = false): PageType {
  if (isHome) return "home";
  const path = new URL(url).pathname;
  return PAGE_TYPE_PATTERNS.find(([, re]) => re.test(path))?.[0] ?? "other";
}

/** Udleder brandnavn fra og:site_name, titel og domæne. */
export function extractBrandName(page: ParsedPage, domain: string): string {
  if (page.siteName && page.siteName.length <= 80) return page.siteName;
  const token = domain.split(".")[0].replace(/-/g, " ").toLowerCase();
  const segments = page.title.split(/\s+[|–—\-:·•]\s+/).map((s) => collapseWhitespace(s)).filter((s) => s.length >= 2 && s.length <= 80);
  const byDomain = segments.find((s) => s.toLowerCase().replace(/[^a-zæøå0-9 ]/g, "").includes(token.split(" ")[0]));
  if (byDomain) return byDomain;
  if (segments.length > 0) return segments[segments.length > 1 ? segments.length - 1 : 0];
  return token.replace(/\b\w/g, (c) => c.toUpperCase());
}

export interface CvrMention {
  cvr: string;
  url: string;
  snippet: string;
  sourceId: string;
}

const CVR_RE = /(?:cvr|cvr-?nr|cvr-?nummer|virksomhedsnummer|se-?nr|moms-?nr|vat)[\s.:#-]*(?:nr\.?\s*)?(?:dk[\s-]?)?((?:\d[\s.-]?){8})(?!\d)/gi;

/** Finder CVR-numre, der står på brandets egne sider (kun gyldige numre; demo-numre tillades i Demo Mode). */
export function extractCvrMentions(pages: PageWithSource[], allowDemoNumbers = false): CvrMention[] {
  const found = new Map<string, CvrMention>();
  for (const { page, sourceId } of pages) {
    for (const m of page.text.matchAll(CVR_RE)) {
      const digits = m[1].replace(/\D/g, "");
      if (digits.length !== 8) continue;
      const valid = validateCvr(digits).valid || (allowDemoNumbers && /^0000000\d$/.test(digits));
      if (!valid || found.has(digits)) continue;
      let start = Math.max(0, (m.index ?? 0) - 60);
      // Start uddraget ved en ordgrænse.
      if (start > 0) start = page.text.indexOf(" ", start) + 1 || start;
      found.set(digits, { cvr: digits, url: page.url, snippet: truncate(page.text.slice(start, (m.index ?? 0) + m[0].length + 40).replace(/^[·\s]+/, "").trim(), 200), sourceId });
    }
  }
  return Array.from(found.values()).slice(0, 5);
}

const FEATURE_DEFS: Array<{ key: string; label: string }> = [
  { key: "online_booking", label: "Online booking" },
  { key: "contact_form", label: "Kontaktformular" },
  { key: "chat_widget", label: "Chatfunktion" },
  { key: "ecommerce", label: "Webshop" },
  { key: "customer_portal", label: "Kundeportal / login" },
  { key: "self_service", label: "Selvbetjening (FAQ/hjælpecenter)" },
  { key: "newsletter", label: "Nyhedsbrev" },
  { key: "phone_visible", label: "Telefonnummer synligt" },
  { key: "social_links", label: "Links til sociale profiler" },
  { key: "analytics", label: "Webanalyse" },
  { key: "integrations", label: "Synlige integrationer/værktøjer" },
];

export function buildWebsiteAnalysis(
  pages: Array<PageWithSource & { pageType: PageType }>,
  features: ObservedFeature[],
  blocked: WebsiteAnalysis["blocked"],
): WebsiteAnalysis {
  const sourceIds = pages.map((p) => p.sourceId);
  const list: WebsiteFeature[] = FEATURE_DEFS.map((def) => {
    const f = features.find((x) => x.key === def.key);
    if (f) return { key: def.key, label: def.label, status: "observed", evidence: f.evidence, sourceIds: f.sourceIds };
    if (pages.length === 0) return { key: def.key, label: def.label, status: "unknown", evidence: "Hjemmesiden er ikke undersøgt.", sourceIds: [] };
    return {
      key: def.key,
      label: def.label,
      status: "not_observed",
      evidence: `Ikke fundet på de ${pages.length} undersøgte sider. Det er ikke bevis for, at funktionen ikke findes.`,
      sourceIds,
    };
  });
  return {
    pages: pages.map((p) => ({ url: p.page.url, title: p.page.title || p.page.url, pageType: PAGE_TYPE_LABELS[p.pageType], sourceId: p.sourceId })),
    features: list,
    blocked,
  };
}

const MATURITY_KEYS = ["online_booking", "contact_form", "chat_widget", "customer_portal", "self_service", "newsletter", "social_links", "analytics"];

/** Digital modenhed (0-100) som andel af centrale, observerede funktioner. Altid en vurdering. */
export function assessDigitalMaturity(analysis: WebsiteAnalysis) {
  if (analysis.pages.length === 0) {
    return { score: 0, level: "unknown" as const, rationale: "Kan ikke vurderes, fordi hjemmesiden ikke er undersøgt.", classification: "unknown" as const };
  }
  const considered = analysis.features.filter((f) => MATURITY_KEYS.includes(f.key) || (f.key === "ecommerce" && f.status === "observed"));
  const observed = considered.filter((f) => f.status === "observed");
  const score = Math.round((observed.length / Math.max(1, considered.length)) * 100);
  const level = score < 35 ? ("low" as const) : score < 65 ? ("medium" as const) : ("high" as const);
  return {
    score,
    level,
    rationale: `${observed.length} af ${considered.length} centrale digitale funktioner blev observeret (${observed.map((f) => f.label.toLowerCase()).join(", ") || "ingen"}). Vurderingen bygger kun på de ${analysis.pages.length} undersøgte sider.`,
    classification: "assessment" as const,
  };
}
