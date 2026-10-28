import { AppError } from "@agency/shared";
import { integrationConfig } from "../config";
import { httpRequest, isAbortError } from "./client";
import { isPathAllowed, parseRobots, type RobotsRules } from "./robots";
import { assertSafeUrl, type UrlCheckOptions } from "./ssrf";

export interface SafeFetchOptions extends UrlCheckOptions {
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  respectRobots?: boolean;
  /** Udskiftelig transport (tests). */
  transport?: typeof httpRequest;
}

export interface FetchedPage {
  requestedUrl: string;
  finalUrl: string;
  status: number;
  contentType: string;
  body: string;
  fetchedAt: string;
}

const robotsCache = new Map<string, { rules: RobotsRules; expires: number }>();

async function readLimited(res: Awaited<ReturnType<typeof httpRequest>>, maxBytes: number): Promise<string> {
  if (!res.body) return "";
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      break; // Behold det, vi har læst — resten kasseres (dataminimering).
    }
    chunks.push(value);
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(Buffer.concat(chunks));
}

async function getRobots(origin: string, options: SafeFetchOptions): Promise<RobotsRules> {
  const cached = robotsCache.get(origin);
  if (cached && cached.expires > Date.now()) return cached.rules;
  let rules: RobotsRules = { disallow: [], allow: [] };
  try {
    const res = await (options.transport ?? httpRequest)(`${origin}/robots.txt`, {
      headers: { "user-agent": integrationConfig.userAgent() },
      timeoutMs: 5000,
      redirect: "follow",
    });
    if (res.ok) rules = parseRobots(await readLimited(res, 200_000));
  } catch {
    // Manglende robots.txt betyder ingen restriktioner.
  }
  robotsCache.set(origin, { rules, expires: Date.now() + 15 * 60_000 });
  return rules;
}

/**
 * Henter en offentlig webside sikkert: SSRF-kontrol pr. hop, manuelle
 * omdirigeringer, robots.txt, timeout, størrelsesgrænse og indholdstype.
 */
export async function safeFetch(inputUrl: string, options: SafeFetchOptions = {}): Promise<FetchedPage> {
  const transport = options.transport ?? httpRequest;
  const maxRedirects = options.maxRedirects ?? 4;
  let current = (await assertSafeUrl(inputUrl, options)).toString();

  for (let hop = 0; hop <= maxRedirects; hop++) {
    const url = await assertSafeUrl(current, options);
    if (options.respectRobots !== false) {
      const rules = await getRobots(url.origin, options);
      if (!isPathAllowed(rules, url.pathname)) {
        throw new AppError("blocked_url", `robots.txt tillader ikke hentning af ${url.pathname} på ${url.hostname}.`);
      }
    }

    let res;
    try {
      res = await transport(url.toString(), {
        headers: {
          "user-agent": integrationConfig.userAgent(),
          accept: "text/html,application/xhtml+xml,text/plain;q=0.8",
          "accept-language": "da,en;q=0.8",
        },
        timeoutMs: options.timeoutMs ?? 8000,
        redirect: "manual",
      });
    } catch (err) {
      if (isAbortError(err)) throw new AppError("timeout", `Tidsgrænsen blev overskredet ved hentning af ${url.hostname}.`);
      throw new AppError("integration_error", `Kunne ikke hente ${url.hostname}.`);
    }

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) throw new AppError("integration_error", "Omdirigering uden destination.");
      current = new URL(location, url).toString();
      continue;
    }

    const contentType = res.headers.get("content-type") ?? "";
    if (!/text\/html|application\/xhtml\+xml|text\/plain/i.test(contentType)) {
      throw new AppError("integration_error", `Uventet indholdstype (${contentType || "ukendt"}).`);
    }
    const body = await readLimited(res, options.maxBytes ?? 1_500_000);
    return {
      requestedUrl: inputUrl,
      finalUrl: url.toString(),
      status: res.status,
      contentType,
      body,
      fetchedAt: new Date().toISOString(),
    };
  }
  throw new AppError("integration_error", "For mange omdirigeringer.");
}

export function clearRobotsCache() {
  robotsCache.clear();
}
