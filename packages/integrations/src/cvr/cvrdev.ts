import { assertWithinBudget, recordUsage } from "@agency/core/server";
import { AppError } from "@agency/shared";
import { integrationConfig } from "../config";
import { httpRequest, isAbortError } from "../http/client";
import { mapProduktionsenhed, mapSearchHit, mapVrvirksomhedLookup } from "./mapper";
import type { CvrProvider } from "./types";

/** CVR-opslag via cvr.dev (spejling af Erhvervsstyrelsens CVR-data). */
export function createCvrDevProvider(transport = httpRequest): CvrProvider {
  async function get(path: string): Promise<unknown[] | null> {
    const apiKey = integrationConfig.cvrDevApiKey();
    if (!apiKey) throw new AppError("integration_not_configured", "CVR_DEV_API_KEY er ikke konfigureret.");
    await assertWithinBudget("cvr");
    let res;
    try {
      res = await transport(`${integrationConfig.cvrDevBaseUrl()}${path}`, { headers: { Authorization: apiKey, accept: "application/json" }, timeoutMs: 10_000 });
    } catch (err) {
      await recordUsage("cvr", { calls: 1, errors: 1 });
      if (isAbortError(err)) throw new AppError("timeout", "CVR-opslaget tog for lang tid. Prøv igen.");
      throw new AppError("integration_error", "CVR-tjenesten kunne ikke kontaktes.");
    }
    await recordUsage("cvr", { calls: 1, errors: res.ok || res.status === 404 ? 0 : 1 });
    if (res.status === 404) return null;
    if (res.status === 401 || res.status === 403) throw new AppError("integration_error", "CVR-tjenesten afviste API-nøglen.");
    if (!res.ok) throw new AppError("integration_error", `CVR-tjenesten svarede med status ${res.status}.`);
    const data = (await res.json()) as unknown;
    return Array.isArray(data) ? data : null;
  }

  return {
    key: "cvr.dev",
    name: "cvr.dev (Erhvervsstyrelsens CVR-data)",
    isConfigured: () => Boolean(integrationConfig.cvrDevApiKey()),
    async lookup(cvr) {
      const data = await get(`/api/cvr/virksomhed?cvr_nummer=${encodeURIComponent(cvr)}`);
      const first = data?.[0];
      if (!first) throw new AppError("upstream_not_found", `CVR-nummer ${cvr} blev ikke fundet i CVR-registret.`);
      return mapVrvirksomhedLookup(first as Record<string, unknown>, "cvr.dev", `https://datacvr.virk.dk/enhed/virksomhed/${cvr}`);
    },
    async establishment(pNumber) {
      const data = await get(`/api/cvr/produktionsenhed?p_nummer=${encodeURIComponent(pNumber)}`);
      const first = data?.[0];
      return first ? mapProduktionsenhed(first as Record<string, unknown>, "cvr.dev") : null;
    },
    async searchByName(name, limit = 5) {
      const q = name.trim();
      if (q.length < 3) return [];
      const data = await get(`/api/cvr/virksomhed?navn=${encodeURIComponent(q)}`);
      return (data ?? []).slice(0, limit).map((v) => mapSearchHit(v as Record<string, unknown>));
    },
  };
}
