import { EnvHttpProxyAgent, fetch as undiciFetch, type Dispatcher } from "undici";

/**
 * Udgående HTTP-klient. Respekterer HTTP(S)_PROXY/NO_PROXY, så platformen
 * kan køre bag virksomhedsproxies. Alle eksterne kald går gennem denne klient.
 */
let dispatcher: Dispatcher | undefined;

function getDispatcher(): Dispatcher | undefined {
  const hasProxy = Boolean(process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy);
  if (!hasProxy) return undefined;
  dispatcher ??= new EnvHttpProxyAgent();
  return dispatcher;
}

export type HttpRequestInit = {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
  redirect?: "manual" | "follow" | "error";
};

export async function httpRequest(url: string, init: HttpRequestInit = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), init.timeoutMs ?? 10_000);
  try {
    return await undiciFetch(url, {
      method: init.method ?? "GET",
      headers: init.headers,
      body: init.body,
      redirect: init.redirect ?? "follow",
      signal: controller.signal,
      dispatcher: getDispatcher(),
    });
  } finally {
    clearTimeout(timer);
  }
}

export function isAbortError(err: unknown): boolean {
  return err instanceof Error && (err.name === "AbortError" || err.name === "TimeoutError");
}
