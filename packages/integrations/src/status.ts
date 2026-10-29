import { isAiConfigured, verifyAiModel } from "./ai/anthropic";
import { integrationConfig } from "./config";
import { getCvrProvider } from "./cvr";
import { getSearchProvider } from "./search/brave";

export interface IntegrationStatus {
  key: "cvr" | "ai" | "search" | "website";
  name: string;
  provider: string;
  configured: boolean;
  usedFor: string;
  missing: string | null;
  envVars: string[];
}

/** Viser hvilke integrationer der er konfigureret — uden at afsløre nøgler. */
export function getIntegrationStatus(): IntegrationStatus[] {
  const cvr = getCvrProvider();
  const search = getSearchProvider();
  const cvrEnv = integrationConfig.cvrProvider() === "virk" ? ["CVR_VIRK_USERNAME", "CVR_VIRK_PASSWORD"] : ["CVR_DEV_API_KEY"];
  return [
    {
      key: "cvr",
      name: "CVR-opslag",
      provider: cvr.name,
      configured: cvr.isConfigured(),
      usedFor: "Virksomhedsnavn, adresse, branche, virksomhedsform og status (Live Mode).",
      missing: cvr.isConfigured() ? null : `Sæt ${cvrEnv.join(" og ")} i .env.local for at aktivere rigtige CVR-opslag.`,
      envVars: ["CVR_PROVIDER", ...cvrEnv],
    },
    {
      key: "ai",
      name: "AI-analyse og tilbudstekst",
      provider: `Anthropic Claude (${integrationConfig.anthropicModel()})`,
      configured: isAiConfigured(),
      usedFor: "Virksomhedsanalyse, konkurrentvurdering og personlig tilbudstekst.",
      missing: isAiConfigured()
        ? null
        : "Sæt ANTHROPIC_API_KEY. Uden nøgle bruges en gennemsigtig regelbaseret analyse og tilbudsskabelon, tydeligt markeret.",
      envVars: ["ANTHROPIC_API_KEY", "ANTHROPIC_MODEL"],
    },
    {
      key: "search",
      name: "Websøgning",
      provider: search.name,
      configured: search.isConfigured(),
      usedFor: "Indekserede websider, nyheder, stillingsopslag, anmeldelser, sociale profiler og konkurrenter.",
      missing: search.isConfigured() ? null : "Sæt BRAVE_SEARCH_API_KEY for at inkludere websøgning i researchen.",
      envVars: ["BRAVE_SEARCH_API_KEY"],
    },
    {
      key: "website",
      name: "Hentning af officiel hjemmeside",
      provider: "Indbygget sikker webhentning (SSRF-beskyttet, respekterer robots.txt)",
      configured: integrationConfig.websiteFetchEnabled(),
      usedFor: "Analyse af virksomhedens hjemmeside, produkter, services og digitale funktioner.",
      missing: integrationConfig.websiteFetchEnabled() ? null : "Deaktiveret via RESEARCH_WEBSITE_FETCH=false.",
      envVars: ["RESEARCH_WEBSITE_FETCH", "RESEARCH_USER_AGENT"],
    },
  ];
}

/** Som `getIntegrationStatus`, men verificerer også AI-modellen via Anthropics Models API. */
export async function getIntegrationStatusChecked(): Promise<IntegrationStatus[]> {
  const list = getIntegrationStatus();
  const ai = list.find((i) => i.key === "ai");
  if (ai && ai.configured) {
    const check = await verifyAiModel();
    if (!check.available) {
      ai.configured = false;
      ai.missing = check.reason;
    } else {
      ai.provider = `Anthropic Claude (${check.displayName ?? check.model}, verificeret)`;
    }
  }
  return list;
}
