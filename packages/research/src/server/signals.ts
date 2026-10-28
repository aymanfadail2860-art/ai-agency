import type { Company, SignalKey } from "@agency/core";
import type { ParsedPage } from "./html";

/**
 * SIGNALDETEKTION
 * ---------------
 * Registrerer observerbare digitale funktioner og mangler ud fra hentede
 * kilder. Tilstedeværelse er et verificeret fakta (mønster fundet i kilden).
 * Fravær er en VURDERING, fordi funktioner kan være indlæst dynamisk eller
 * findes på sider, der ikke blev undersøgt.
 */

export interface PageWithSource {
  sourceId: string;
  page: ParsedPage;
}

export interface TextWithSource {
  sourceId: string;
  kind: "jobs" | "reviews" | "news" | "search" | "social";
  text: string;
}

export interface ObservedFeature {
  key: string;
  label: string;
  evidence: string;
  sourceIds: string[];
}

export interface DetectedSignal {
  key: SignalKey;
  label: string;
  evidence: string;
  sourceIds: string[];
  /** fact = observeret direkte, assessment = udledt af fravær. */
  classification: "fact" | "assessment";
}

const FEATURE_PATTERNS: Array<{ key: string; label: string; patterns: RegExp[] }> = [
  {
    key: "chat_widget",
    label: "Chatfunktion på hjemmesiden",
    patterns: [/intercom/, /zopim|zendesk.*(widget|chat)|static\.zdassets/, /tidio/, /crisp\.chat/, /livechatinc|livechat\.com/, /drift\.com|js\.driftt/, /tawk\.to/, /freshchat|wchat\.freshchat/, /userlike/, /js\.hs-scripts|hubspot.*conversations/, /data-chat-widget|chat-widget/],
  },
  {
    key: "online_booking",
    label: "Online booking",
    patterns: [
      /calendly\.com/,
      /simplybook/,
      /planway/,
      /online ?booking|online-booking|onlinebooking/,
      /bookingsystem|booking-widget/,
      /(?:book|bestil) (?:en )?tid online/,
      /book online/,
      /href="[^"]*\/(?:booking|online-booking|book-tid)\b/,
      /timma\.|bookli|easypractice|clinicbuddy/,
    ],
  },
  {
    key: "newsletter",
    label: "Nyhedsbrevstilmelding",
    patterns: [/nyhedsbrev/, /newsletter/, /mailchimp|list-manage\.com/, /klaviyo/, /heyloyalty/, /peytz/],
  },
  {
    key: "analytics",
    label: "Webanalyse/sporing",
    patterns: [/googletagmanager\.com/, /google-analytics\.com|gtag\(/, /plausible\.io/, /matomo/, /hotjar/, /connect\.facebook\.net.*fbevents|fbq\(/, /clarity\.ms/],
  },
  {
    key: "ecommerce",
    label: "Webshop/e-handel",
    patterns: [/cdn\.shopify\.com|shopify/, /woocommerce/, /læg i kurv|tilføj til kurv|add to cart/, /dandomain|smartweb|wannafind/, /\/kurv|\/cart\b/],
  },
  {
    key: "cookie_consent",
    label: "Cookiesamtykke",
    patterns: [/cookiebot|cookieinformation|cookie-consent|onetrust|cookieyes/],
  },
];

const SOCIAL_PATTERNS: Array<[string, RegExp]> = [
  ["Facebook", /facebook\.com\/(?!sharer|plugins|tr\b)/],
  ["Instagram", /instagram\.com\//],
  ["LinkedIn", /linkedin\.com\/(company|in)\//],
  ["YouTube", /youtube\.com\/(channel|c|@|user)/],
  ["TikTok", /tiktok\.com\/@/],
];

const JOB_KEYWORDS: Array<[SignalKey, RegExp, string]> = [
  ["hiring_admin", /bogholder|administrativ|kontorassistent|sekretær|ordrestyring|back ?office|lønbogholder|disponent/i, "administrative funktioner"],
  ["hiring_sales", /sælger|salgskonsulent|account manager|key account|salgschef|salgsassistent/i, "salg"],
  ["hiring_customer_service", /kundeservice|kundesupport|customer service|receptionist|kundekoordinator|kundecenter/i, "kundeservice"],
];

const REVIEW_RESPONSE_TIME = /svær[t]? at komme igennem|tager ikke telefonen|svarer ikke|lang svartid|ventetid|ventede længe|aldrig ringet tilbage|ikke ringet tilbage|svartid/i;

export interface SignalAnalysis {
  features: ObservedFeature[];
  signals: DetectedSignal[];
  socialProfiles: Array<{ network: string; url: string; sourceId: string }>;
  pagesExamined: number;
}

export function detectSignals(input: {
  company: Company;
  pages: PageWithSource[];
  texts: TextWithSource[];
  registrySourceId: string;
  websiteAttempted: boolean;
}): SignalAnalysis {
  const { pages, texts } = input;
  const features: ObservedFeature[] = [];
  const signals: DetectedSignal[] = [];
  const pageCount = pages.length;
  const pageSources = pages.map((p) => p.sourceId);

  const found = (key: string) => features.some((f) => f.key === key);

  for (const def of FEATURE_PATTERNS) {
    const hits = pages.filter(({ page }) => def.patterns.some((re) => re.test(page.rawLower)));
    if (hits.length > 0) {
      features.push({
        key: def.key,
        label: def.label,
        evidence: `${def.label} fundet på ${hits.length} af ${pageCount} undersøgte sider.`,
        sourceIds: hits.map((h) => h.sourceId),
      });
    }
  }

  const formPages = pages.filter(({ page }) => page.hasEmailOrMessageField);
  if (formPages.length > 0) {
    features.push({
      key: "contact_form",
      label: "Kontaktformular",
      evidence: `Formular med e-mail- eller beskedfelt fundet på ${formPages.length} side(r).`,
      sourceIds: formPages.map((p) => p.sourceId),
    });
  }

  const phonePages = pages.filter(({ page }) => page.phoneNumbers.length > 0);
  if (phonePages.length > 0) {
    features.push({
      key: "phone_visible",
      label: "Telefonnummer synligt",
      evidence: `Telefonnummer vist på ${phonePages.length} af ${pageCount} undersøgte sider.`,
      sourceIds: phonePages.map((p) => p.sourceId),
    });
  }

  const socialProfiles: SignalAnalysis["socialProfiles"] = [];
  for (const { sourceId, page } of pages) {
    for (const link of page.externalLinks) {
      for (const [network, re] of SOCIAL_PATTERNS) {
        if (re.test(link.href.toLowerCase()) && !socialProfiles.some((s) => s.network === network)) {
          socialProfiles.push({ network, url: link.href, sourceId });
        }
      }
    }
  }
  if (socialProfiles.length > 0) {
    features.push({
      key: "social_links",
      label: "Links til sociale profiler",
      evidence: `Hjemmesiden linker til: ${socialProfiles.map((s) => s.network).join(", ")}.`,
      sourceIds: Array.from(new Set(socialProfiles.map((s) => s.sourceId))),
    });
  }

  // Fravær af funktioner — kun meningsfuldt, hvis hjemmesiden blev undersøgt.
  if (pageCount > 0) {
    const absent = (key: SignalKey, label: string, what: string) =>
      signals.push({
        key,
        label,
        evidence: `${what} blev ikke fundet på de ${pageCount} undersøgte sider (kan være indlæst dynamisk eller placeret på andre sider).`,
        sourceIds: pageSources,
        classification: "assessment",
      });
    if (!found("chat_widget")) absent("no_chat_widget", "Ingen synlig chatfunktion", "En chatfunktion");
    if (!found("online_booking")) absent("no_online_booking", "Ingen synlig online booking", "Online booking");
    if (!found("contact_form")) absent("no_contact_form", "Ingen kontaktformular fundet", "En kontaktformular");
    if (!found("newsletter")) absent("no_newsletter", "Ingen nyhedsbrevstilmelding fundet", "Nyhedsbrevstilmelding");
    if (!found("analytics")) absent("no_analytics", "Ingen webanalyse fundet", "Webanalyse/sporing");
    if (!found("social_links")) absent("no_social_links", "Ingen links til sociale profiler", "Links til sociale profiler");
    if (found("phone_visible") && !found("online_booking") && !found("chat_widget")) {
      signals.push({
        key: "phone_centric_contact",
        label: "Kundekontakt primært via telefon",
        evidence: "Telefonnummer er synligt, mens hverken online booking eller chat blev fundet — kontakt synes primært at foregå via telefon.",
        sourceIds: phonePages.map((p) => p.sourceId),
        classification: "assessment",
      });
    }
    if (found("ecommerce")) {
      const f = features.find((x) => x.key === "ecommerce")!;
      signals.push({ key: "has_ecommerce", label: "Driver webshop", evidence: f.evidence, sourceIds: f.sourceIds, classification: "fact" });
    }
  } else if (input.websiteAttempted || !input.company.contact.website) {
    signals.push({
      key: "no_website",
      label: "Ingen hjemmeside undersøgt",
      evidence: input.company.contact.website
        ? "Hjemmesiden kunne ikke hentes, så digitale funktioner er ikke vurderet."
        : "Der er ikke registreret en hjemmeside i CVR, og ingen blev angivet.",
      sourceIds: [input.registrySourceId],
      classification: "assessment",
    });
  }

  // Stillingsopslag og anmeldelser (fra websøgning).
  for (const [key, re, area] of JOB_KEYWORDS) {
    const hits = texts.filter((t) => t.kind === "jobs" && re.test(t.text));
    if (hits.length > 0) {
      signals.push({
        key,
        label: `Rekrutterer inden for ${area}`,
        evidence: `${hits.length} stillingsopslag nævner ${area}.`,
        sourceIds: hits.map((h) => h.sourceId),
        classification: "fact",
      });
    }
  }
  const reviewHits = texts.filter((t) => t.kind === "reviews" && REVIEW_RESPONSE_TIME.test(t.text));
  if (reviewHits.length > 0) {
    signals.push({
      key: "review_mentions_response_time",
      label: "Anmeldelser nævner svartid/tilgængelighed",
      evidence: `${reviewHits.length} anmeldelse(r) nævner svartid eller at det er svært at komme i kontakt.`,
      sourceIds: reviewHits.map((h) => h.sourceId),
      classification: "fact",
    });
  }

  const employees = input.company.employees?.count ?? null;
  if (employees !== null && employees >= 50) {
    signals.push({
      key: "large_workforce",
      label: "Større medarbejderstab",
      evidence: `CVR angiver ${employees} ansatte (${input.company.employees?.year ?? "seneste år"}).`,
      sourceIds: [input.registrySourceId],
      classification: "fact",
    });
  }

  return { features, signals, socialProfiles, pagesExamined: pageCount };
}
