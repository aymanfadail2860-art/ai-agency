import { AppError } from "@agency/shared";
import { integrationConfig } from "../config";
import { httpRequest, isAbortError } from "../http/client";
import { mapVrvirksomhed } from "./mapper";
import type { CvrProvider, CvrRecord } from "./types";

/** CVR-opslag via cvr.dev (spejling af Erhvervsstyrelsens CVR-data). */
export function createCvrDevProvider(transport = httpRequest): CvrProvider {
  return {
    key: "cvr.dev",
    name: "cvr.dev (Erhvervsstyrelsens CVR-data)",
    isConfigured: () => Boolean(integrationConfig.cvrDevApiKey()),
    async lookup(cvr: string): Promise<CvrRecord> {
      const apiKey = integrationConfig.cvrDevApiKey();
      if (!apiKey) throw new AppError("integration_not_configured", "CVR_DEV_API_KEY er ikke konfigureret.");
      const url = `${integrationConfig.cvrDevBaseUrl()}/api/cvr/virksomhed?cvr_nummer=${encodeURIComponent(cvr)}`;
      let res;
      try {
        res = await transport(url, { headers: { Authorization: apiKey, accept: "application/json" }, timeoutMs: 10_000 });
      } catch (err) {
        if (isAbortError(err)) throw new AppError("timeout", "CVR-opslaget tog for lang tid. Prøv igen.");
        throw new AppError("integration_error", "CVR-tjenesten kunne ikke kontaktes.");
      }
      if (res.status === 404) throw new AppError("upstream_not_found", `CVR-nummer ${cvr} blev ikke fundet i CVR-registret.`);
      if (res.status === 401 || res.status === 403) throw new AppError("integration_error", "CVR-tjenesten afviste API-nøglen.");
      if (!res.ok) throw new AppError("integration_error", `CVR-tjenesten svarede med status ${res.status}.`);
      const data = (await res.json()) as unknown[];
      const first = Array.isArray(data) ? data[0] : null;
      if (!first) throw new AppError("upstream_not_found", `CVR-nummer ${cvr} blev ikke fundet i CVR-registret.`);
      return mapVrvirksomhed(first as Record<string, unknown>, "cvr.dev", `https://datacvr.virk.dk/enhed/virksomhed/${cvr}`);
    },
  };
}
