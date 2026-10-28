import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { AppError } from "@agency/shared";

/**
 * SSRF-BESKYTTELSE
 * Kun offentlige http(s)-adresser på standardporte må hentes. Værtsnavne
 * opløses, og alle opløste IP-adresser kontrolleres mod private, loopback-,
 * link-local-, multicast- og reserverede netværk. Kontrollen gentages for
 * hver omdirigering i `safeFetch`.
 */

const BLOCKED_HOSTNAMES = [/^localhost$/i, /\.localhost$/i, /\.local$/i, /\.internal$/i, /^metadata\.google\.internal$/i];

function ipv4ToInt(ip: string): number {
  return ip.split(".").reduce((acc, part) => (acc << 8) + Number(part), 0) >>> 0;
}

const IPV4_BLOCKS: Array<[string, number]> = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
];

export function isPrivateIpv4(ip: string): boolean {
  const value = ipv4ToInt(ip);
  return IPV4_BLOCKS.some(([base, bits]) => {
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    return (value & mask) === (ipv4ToInt(base) & mask);
  });
}

export function isPrivateIp(ip: string): boolean {
  const version = isIP(ip);
  if (version === 4) return isPrivateIpv4(ip);
  if (version === 6) {
    const lower = ip.toLowerCase().replace(/^\[|\]$/g, "");
    if (lower === "::" || lower === "::1") return true;
    const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateIpv4(mapped[1]);
    if (/^::ffff:[0-9a-f]{1,4}:[0-9a-f]{1,4}$/.test(lower)) return true; // hex-form af IPv4-mapped — afvises
    if (/^f[cd]/.test(lower)) return true; // unique local fc00::/7
    if (/^fe[89ab]/.test(lower)) return true; // link-local fe80::/10
    if (/^ff/.test(lower)) return true; // multicast
    if (/^2001:db8/.test(lower)) return true; // dokumentation
    if (/^64:ff9b/.test(lower)) return true; // NAT64
    return false;
  }
  return true; // ukendt format afvises
}

export interface UrlCheckOptions {
  /** DNS-opslag kan udskiftes i tests. */
  resolve?: (hostname: string) => Promise<string[]>;
  /**
   * Bag en udgående proxy kan lokal DNS mangle; så foretager proxyen opslaget.
   * Standard: tilladt når HTTP(S)_PROXY er sat. IP-literaler og interne navne
   * afvises stadig. Se docs/security.md.
   */
  allowUnresolvedBehindProxy?: boolean;
}

function proxyConfigured(): boolean {
  return Boolean(process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy);
}

async function defaultResolve(hostname: string): Promise<string[]> {
  const results = await lookup(hostname, { all: true, verbatim: true });
  return results.map((r) => r.address);
}

/** Validerer og normaliserer en URL til sikker udgående hentning. */
export async function assertSafeUrl(input: string, options: UrlCheckOptions = {}): Promise<URL> {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new AppError("blocked_url", "Ugyldig URL.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new AppError("blocked_url", "Kun http- og https-adresser er tilladt.");
  }
  if (url.username || url.password) {
    throw new AppError("blocked_url", "URL'er med indlejrede loginoplysninger er ikke tilladt.");
  }
  if (url.port && !["80", "443"].includes(url.port)) {
    throw new AppError("blocked_url", "Kun standardporte (80/443) er tilladt.");
  }
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  if (BLOCKED_HOSTNAMES.some((re) => re.test(hostname))) {
    throw new AppError("blocked_url", "Interne værtsnavne er ikke tilladt.");
  }
  if (isIP(hostname)) {
    if (isPrivateIp(hostname)) throw new AppError("blocked_url", "Private eller reserverede IP-adresser er ikke tilladt.");
    return url;
  }
  let addresses: string[];
  try {
    addresses = await (options.resolve ?? defaultResolve)(hostname);
  } catch {
    if (options.allowUnresolvedBehindProxy ?? proxyConfigured()) return url;
    throw new AppError("blocked_url", `Værtsnavnet ${hostname} kunne ikke opløses.`);
  }
  if (addresses.length === 0 || addresses.some(isPrivateIp)) {
    throw new AppError("blocked_url", "Værtsnavnet peger på en privat eller reserveret adresse.");
  }
  return url;
}
