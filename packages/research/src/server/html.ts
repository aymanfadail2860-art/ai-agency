import { parse } from "node-html-parser";
import { collapseWhitespace, truncate } from "@agency/shared";

export interface ParsedLink {
  href: string;
  text: string;
}

export interface ParsedPage {
  url: string;
  title: string;
  /** og:site_name eller application-name, hvis angivet. */
  siteName: string;
  description: string;
  headings: string[];
  text: string;
  links: ParsedLink[];
  internalLinks: ParsedLink[];
  externalLinks: ParsedLink[];
  /** Rå HTML i små bogstaver — kun til mønstergenkendelse af funktioner. */
  rawLower: string;
  hasForm: boolean;
  hasEmailOrMessageField: boolean;
  phoneNumbers: string[];
}

const PHONE_RE = /(?:\+45[\s.-]?)?(?<!\d)(?:\d{2}[\s.-]?){3}\d{2}(?!\d)/g;

export function parseHtmlPage(html: string, pageUrl: string): ParsedPage {
  const root = parse(html, { blockTextElements: { script: false, style: false, noscript: false } });
  const base = new URL(pageUrl);
  const title = collapseWhitespace(root.querySelector("title")?.text ?? "");
  const description = collapseWhitespace(
    root.querySelector('meta[name="description"]')?.getAttribute("content") ??
      root.querySelector('meta[property="og:description"]')?.getAttribute("content") ??
      "",
  );
  const siteName = collapseWhitespace(
    root.querySelector('meta[property="og:site_name"]')?.getAttribute("content") ??
      root.querySelector('meta[name="application-name"]')?.getAttribute("content") ??
      "",
  );
  const headings = root
    .querySelectorAll("h1, h2, h3")
    .map((h) => collapseWhitespace(h.text))
    .filter((h) => h.length >= 3 && h.length <= 90);

  const links: ParsedLink[] = [];
  for (const a of root.querySelectorAll("a[href]")) {
    const raw = a.getAttribute("href") ?? "";
    if (!raw || raw.startsWith("#") || raw.startsWith("javascript:")) continue;
    try {
      const resolved = new URL(raw, base);
      links.push({ href: resolved.toString(), text: collapseWhitespace(a.text) });
    } catch {
      // ignorer ugyldige links
    }
  }
  const sameSite = (href: string) => {
    try {
      const host = new URL(href).hostname.replace(/^www\./, "");
      return host === base.hostname.replace(/^www\./, "");
    } catch {
      return false;
    }
  };
  const httpLinks = links.filter((l) => /^https?:/.test(l.href));

  const bodyText = collapseWhitespace(root.querySelector("body")?.text ?? root.text);
  const telLinks = links.filter((l) => l.href.startsWith("tel:")).map((l) => l.href.slice(4));
  const phoneNumbers = Array.from(new Set([...telLinks, ...(bodyText.match(PHONE_RE) ?? [])].map((p) => p.replace(/[\s.-]/g, "")))).slice(0, 5);

  const forms = root.querySelectorAll("form");
  const hasEmailOrMessageField = forms.some(
    (f) => f.querySelector('input[type="email"]') !== null || f.querySelector("textarea") !== null,
  );

  return {
    url: pageUrl,
    title,
    siteName,
    description,
    headings: Array.from(new Set(headings)).slice(0, 30),
    text: truncate(bodyText, 6000),
    links,
    internalLinks: httpLinks.filter((l) => sameSite(l.href)),
    externalLinks: httpLinks.filter((l) => !sameSite(l.href)),
    rawLower: html.toLowerCase(),
    hasForm: forms.length > 0,
    hasEmailOrMessageField,
    phoneNumbers,
  };
}

const PRIORITY_PATHS = [
  /om-?os|about|virksomhed|hvem-er-vi/i,
  /ydelser|services|loesninger|løsninger|behandlinger/i,
  /produkter|products|shop|sortiment|kollektion/i,
  /priser|pris|prices|pricing/i,
  /booking|book|bestil/i,
  /kontakt|contact/i,
  /faq|ofte-stillede|spoergsmaal|spørgsmål|hjaelp|hjælp|help/i,
  /handelsbetingelser|betingelser|terms|vilkaar|vilkår/i,
  /privatliv|privacy|persondata|cookie/i,
  /job|karriere|career|ledige/i,
];

/** Udvælger op til `max` relevante undersider på samme domæne. */
export function selectInternalPages(page: ParsedPage, max = 4): string[] {
  const seen = new Set<string>([normalize(page.url)]);
  const picked: string[] = [];
  for (const pattern of PRIORITY_PATHS) {
    const match = page.internalLinks.find((l) => {
      const n = normalize(l.href);
      return !seen.has(n) && (pattern.test(new URL(l.href).pathname) || pattern.test(l.text));
    });
    if (match) {
      seen.add(normalize(match.href));
      picked.push(match.href.split("#")[0]);
    }
    if (picked.length >= max) break;
  }
  return picked;
}

function normalize(href: string): string {
  const u = new URL(href);
  return `${u.hostname.replace(/^www\./, "")}${u.pathname.replace(/\/$/, "")}`;
}
