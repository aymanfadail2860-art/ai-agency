import { AppError } from "@agency/shared";
import { integrationConfig } from "../config";
import { httpRequest, isAbortError } from "../http/client";

export interface SearchResult {
  title: string;
  url: string;
  description: string;
  age: string | null;
}

export interface SearchProvider {
  readonly key: string;
  readonly name: string;
  isConfigured(): boolean;
  search(query: string, opts?: { count?: number }): Promise<SearchResult[]>;
}

function stripTags(text: string): string {
  return text.replace(/<[^>]+>/g, "").replace(/&[a-z]+;/gi, " ").trim();
}

/** Websøgning via Brave Search API (officielt API med egne vilkår). */
export function createBraveSearchProvider(transport = httpRequest): SearchProvider {
  return {
    key: "brave",
    name: "Brave Search API",
    isConfigured: () => Boolean(integrationConfig.braveApiKey()),
    async search(query, opts = {}) {
      const key = integrationConfig.braveApiKey();
      if (!key) throw new AppError("integration_not_configured", "BRAVE_SEARCH_API_KEY er ikke konfigureret.");
      const params = new URLSearchParams({
        q: query,
        count: String(opts.count ?? 5),
        country: "DK",
        search_lang: "da",
        safesearch: "moderate",
      });
      let res;
      try {
        res = await transport(`https://api.search.brave.com/res/v1/web/search?${params}`, {
          headers: { accept: "application/json", "X-Subscription-Token": key },
          timeoutMs: 8000,
        });
      } catch (err) {
        if (isAbortError(err)) throw new AppError("timeout", "Websøgningen tog for lang tid.");
        throw new AppError("integration_error", "Søgetjenesten kunne ikke kontaktes.");
      }
      if (!res.ok) throw new AppError("integration_error", `Søgetjenesten svarede med status ${res.status}.`);
      const data = (await res.json()) as { web?: { results?: Array<{ title?: string; url?: string; description?: string; age?: string }> } };
      return (data.web?.results ?? [])
        .filter((r) => r.url && r.title)
        .map((r) => ({ title: stripTags(r.title!), url: r.url!, description: stripTags(r.description ?? ""), age: r.age ?? null }));
    },
  };
}

export function getSearchProvider(): SearchProvider {
  return createBraveSearchProvider();
}
