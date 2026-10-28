import { AppError } from "@agency/shared";
import { integrationConfig } from "../config";
import { httpRequest, isAbortError } from "../http/client";
import { mapVrvirksomhed } from "./mapper";
import type { CvrProvider, CvrRecord } from "./types";

/**
 * CVR-opslag direkte mod Erhvervsstyrelsens "System-til-system"-adgang
 * (distribution.virk.dk). Kræver brugernavn/adgangskode fra Erhvervsstyrelsen.
 */
export function createVirkProvider(transport = httpRequest): CvrProvider {
  return {
    key: "virk.dk",
    name: "Erhvervsstyrelsen (distribution.virk.dk)",
    isConfigured: () => Boolean(integrationConfig.virkUsername() && integrationConfig.virkPassword()),
    async lookup(cvr: string): Promise<CvrRecord> {
      const user = integrationConfig.virkUsername();
      const pass = integrationConfig.virkPassword();
      if (!user || !pass) throw new AppError("integration_not_configured", "CVR_VIRK_USERNAME/CVR_VIRK_PASSWORD er ikke konfigureret.");
      const url = `${integrationConfig.virkBaseUrl()}/cvr-permanent/virksomhed/_search`;
      let res;
      try {
        res = await transport(url, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}`,
          },
          body: JSON.stringify({ query: { term: { "Vrvirksomhed.cvrNummer": Number(cvr) } }, size: 1 }),
          timeoutMs: 12_000,
        });
      } catch (err) {
        if (isAbortError(err)) throw new AppError("timeout", "CVR-opslaget tog for lang tid. Prøv igen.");
        throw new AppError("integration_error", "Erhvervsstyrelsens CVR-distribution kunne ikke kontaktes.");
      }
      if (res.status === 401 || res.status === 403) throw new AppError("integration_error", "Erhvervsstyrelsen afviste loginoplysningerne.");
      if (!res.ok) throw new AppError("integration_error", `Erhvervsstyrelsen svarede med status ${res.status}.`);
      const data = (await res.json()) as { hits?: { hits?: Array<{ _source?: { Vrvirksomhed?: Record<string, unknown> } }> } };
      const hit = data.hits?.hits?.[0]?._source?.Vrvirksomhed;
      if (!hit) throw new AppError("upstream_not_found", `CVR-nummer ${cvr} blev ikke fundet i CVR-registret.`);
      return mapVrvirksomhed(hit, "virk.dk", `https://datacvr.virk.dk/enhed/virksomhed/${cvr}`);
    },
  };
}
