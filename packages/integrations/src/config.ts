/**
 * Central adgang til integrationskonfiguration. Alle nøgler læses server-side
 * fra miljøvariabler og sendes aldrig til browseren.
 */
export const integrationConfig = {
  cvrProvider: () => (process.env.CVR_PROVIDER ?? "cvrdev").toLowerCase() as "cvrdev" | "virk",
  cvrDevApiKey: () => process.env.CVR_DEV_API_KEY?.trim() || null,
  cvrDevBaseUrl: () => process.env.CVR_DEV_BASE_URL?.trim() || "https://api.cvr.dev",
  virkUsername: () => process.env.CVR_VIRK_USERNAME?.trim() || null,
  virkPassword: () => process.env.CVR_VIRK_PASSWORD?.trim() || null,
  virkBaseUrl: () => process.env.CVR_VIRK_BASE_URL?.trim() || "http://distribution.virk.dk",
  anthropicApiKey: () => process.env.ANTHROPIC_API_KEY?.trim() || null,
  anthropicModel: () => process.env.ANTHROPIC_MODEL?.trim() || "claude-opus-5-5",
  braveApiKey: () => process.env.BRAVE_SEARCH_API_KEY?.trim() || null,
  websiteFetchEnabled: () => (process.env.RESEARCH_WEBSITE_FETCH ?? "true").toLowerCase() !== "false",
  userAgent: () =>
    process.env.RESEARCH_USER_AGENT?.trim() ||
    "AIAgencyResearchBot/0.1 (+https://example.com/bot; respekterer robots.txt)",
};
