import { createCollectionStore, getStorageBackend } from "@agency/core/server";
import { getIntegrationStatus, routineConfigStatus, verifyAiModel } from "@agency/integrations";
import { z } from "zod";
import { orchestratorConfig } from "./config";

/**
 * INTEGRATION MANAGER
 * -------------------
 * Ét register over alle eksterne integrationer: kategori, status, hvilke
 * miljøvariabler der kræves (navne — aldrig værdier), og en forbindelsestest
 * hvor en gratis, sikker test findes. Planlagte integrationer er tydeligt
 * markeret og har ingen funktionalitet, før de implementeres.
 */
export type IntegrationTier = "core" | "research" | "priority" | "optional";
export type IntegrationState = "connected" | "not_configured" | "infrastructure" | "planned";

export interface ManagedIntegration {
  key: string;
  name: string;
  tier: IntegrationTier;
  state: IntegrationState;
  purpose: string;
  detail: string;
  envVars: string[];
  /** Kan testes uden omkostning eller bivirkning. */
  testable: boolean;
  costNote: string;
}

const planned = (key: string, name: string, tier: IntegrationTier, purpose: string): ManagedIntegration => ({
  key,
  name,
  tier,
  state: "planned",
  purpose,
  detail: "Planlagt. Tilsluttes, når en udviklingsfase kræver det — ingen abonnement eller nøgle nødvendig nu.",
  envVars: [],
  testable: false,
  costNote: "Ingen omkostning før tilslutning.",
});

export function listIntegrations(): ManagedIntegration[] {
  const base = getIntegrationStatus();
  const by = (k: string) => base.find((i) => i.key === k)!;
  const ai = by("ai");
  const routine = routineConfigStatus("RESEARCH");
  const publicUrl = orchestratorConfig.publicBaseUrl();
  return [
    {
      key: "claude_api",
      name: "Claude API",
      tier: "core",
      state: ai.configured ? "connected" : "not_configured",
      purpose: "Direkte AI-svar, struktureret analyse og tilbudstekst (motor B).",
      detail: ai.configured ? `Konfigureret (${ai.provider}).` : (ai.missing ?? "Ikke konfigureret."),
      envVars: ["ANTHROPIC_API_KEY", "ANTHROPIC_MODEL"],
      testable: ai.configured,
      costNote: "Betalt pr. token. Dagligt loft: AI_DAILY_BUDGET_USD.",
    },
    {
      key: "claude_code",
      name: "Claude Code-rutiner",
      tier: "core",
      state: routine.configured && publicUrl ? "connected" : "not_configured",
      purpose: "Længere agentopgaver på abonnement (motor A) via officielle rutiner med API-trigger.",
      detail: routine.configured ? (publicUrl ? routine.reason : "AGENCY_PUBLIC_URL mangler — sessionen kan ikke melde tilbage.") : routine.reason,
      envVars: ["CLAUDE_CODE_ROUTINE_RESEARCH_ID", "CLAUDE_CODE_ROUTINE_RESEARCH_TOKEN", "AGENCY_PUBLIC_URL"],
      testable: false,
      costNote: "Bruger abonnementets forbrug. 30 kald/time pr. rutine, 100/time pr. konto. Dagligt loft: CLAUDE_CODE_DAILY_LIMIT.",
    },
    {
      key: "supabase",
      name: "Supabase",
      tier: "core",
      state: getStorageBackend() === "supabase" ? "connected" : "not_configured",
      purpose: "Central lagring af strukturerede data for alle moduler og AOS.",
      detail: getStorageBackend() === "supabase" ? "Forbundet via server-nøgle." : "Lokal fillagring (udvikling).",
      envVars: ["SUPABASE_URL", "SUPABASE_SECRET_KEY"],
      testable: true,
      costNote: "Supabase-projektets plan.",
    },
    {
      key: "github",
      name: "GitHub",
      tier: "core",
      state: "infrastructure",
      purpose: "Kode og versionsstyrede agentdefinitioner. Claude Code-rutiner kloner repositoriet.",
      detail: "Bruges via Vercels Git-integration og Claude Code. Platformen har ingen direkte GitHub-adgang endnu.",
      envVars: [],
      testable: false,
      costNote: "Ingen ekstra omkostning.",
    },
    {
      key: "vercel",
      name: "Vercel",
      tier: "core",
      state: "infrastructure",
      purpose: "Hosting og deployment af AI Agency.",
      detail: "Deployment sker automatisk fra GitHub. Vercel Sandbox indgår ikke i arkitekturen.",
      envVars: [],
      testable: false,
      costNote: "Vercel-projektets plan.",
    },
    {
      key: "cvr",
      name: by("cvr").name,
      tier: "research",
      state: by("cvr").configured ? "connected" : "not_configured",
      purpose: by("cvr").usedFor,
      detail: by("cvr").configured ? `Konfigureret (${by("cvr").provider}).` : (by("cvr").missing ?? ""),
      envVars: by("cvr").envVars,
      testable: false,
      costNote: "Dagligt loft: CVR_DAILY_LIMIT.",
    },
    {
      key: "search",
      name: by("search").name,
      tier: "research",
      state: by("search").configured ? "connected" : "not_configured",
      purpose: by("search").usedFor,
      detail: by("search").configured ? `Konfigureret (${by("search").provider}).` : (by("search").missing ?? ""),
      envVars: by("search").envVars,
      testable: false,
      costNote: "Dagligt loft: SEARCH_DAILY_LIMIT.",
    },
    {
      key: "website",
      name: by("website").name,
      tier: "research",
      state: by("website").configured ? "connected" : "not_configured",
      purpose: by("website").usedFor,
      detail: by("website").provider,
      envVars: by("website").envVars,
      testable: false,
      costNote: "Ingen omkostning.",
    },
    planned("elevenlabs", "ElevenLabs", "priority", "Stemmeagenter og AI-receptionister."),
    planned("n8n", "n8n", "priority", "Workflows og automatiseringer."),
    planned("lovable", "Lovable", "priority", "Hurtige prototyper."),
    planned("higgsfield", "Higgsfield", "priority", "AI-video og kreativ produktion."),
    planned("sentry", "Sentry", "priority", "Fejl- og driftsovervågning."),
    planned("resend", "Resend", "priority", "Systemmails og notifikationer."),
    planned("obsidian", "Obsidian", "optional", "Valgfri intern videnbase (ikke en nødvendig afhængighed)."),
    planned("twilio", "Twilio", "optional", "Telefoni."),
    planned("firecrawl", "Firecrawl", "optional", "Avanceret webresearch."),
    planned("apify", "Apify", "optional", "Avanceret webresearch og scraping via officielle actors."),
    planned("posthog", "PostHog", "optional", "Produktanalyse."),
    planned("figma", "Figma", "optional", "UI/UX-design."),
  ];
}

export interface IntegrationTestResult {
  key: string;
  ok: boolean;
  message: string;
  testedAt: string;
}

const probeStore = createCollectionStore("aos", "integration-probes", z.object({ id: z.string(), at: z.string() }));

/** Forbindelsestest uden omkostning eller bivirkninger. */
export async function testIntegration(key: string): Promise<IntegrationTestResult> {
  const testedAt = new Date().toISOString();
  if (key === "supabase") {
    if (getStorageBackend() !== "supabase") return { key, ok: false, message: "Platformen bruger lokal fillagring.", testedAt };
    try {
      await probeStore.upsert({ id: "last-probe", at: testedAt });
      const read = await probeStore.get("last-probe");
      return { key, ok: read?.at === testedAt, message: read?.at === testedAt ? "Skrivning og læsning lykkedes." : "Læsning returnerede ikke den skrevne værdi.", testedAt };
    } catch {
      return { key, ok: false, message: "Supabase svarede ikke som forventet.", testedAt };
    }
  }
  if (key === "claude_api") {
    const check = await verifyAiModel();
    return { key, ok: check.available, message: check.available ? `Model verificeret: ${check.displayName ?? check.model}.` : (check.reason ?? "Ikke tilgængelig."), testedAt };
  }
  if (key === "claude_code") {
    const status = routineConfigStatus("RESEARCH");
    return {
      key,
      ok: false,
      message: status.configured
        ? "Konfigurationen er på plads. Rutiner har ingen gratis testkald — hvert kald starter en session på abonnementet, så forbindelsen verificeres ved første reelle opgave."
        : status.reason,
      testedAt,
    };
  }
  return { key, ok: false, message: "Denne integration har ingen omkostningsfri forbindelsestest.", testedAt };
}
