import type { EngineKind, JobModule, SideEffect } from "./models";

/**
 * OPGAVETYPER
 * -----------
 * Hver opgavetype erklærer sine tekniske krav. Routeren bruger kun disse
 * erklæringer — aldrig en AI-model — til at vælge eksekveringsmotor.
 */
export interface TaskTypeDefinition {
  key: string;
  module: JobModule;
  label: string;
  description: string;
  /** Agent, der som udgangspunkt udfører opgaven. */
  defaultAgent: string;
  /** Motorer, som opgaven er implementeret til, i den rækkefølge AUTO foretrækker dem. */
  engines: readonly EngineKind[];
  /** Kan opgaven udføres uden AI (fx regelbaseret analyse)? */
  canRunWithoutAi: boolean;
  /** Venter brugeren på svaret? Så vægtes hastighed højere end abonnementsforbrug. */
  interactive: boolean;
  /** Estimeret maksimal API-omkostning pr. kørsel (USD) — bruges til budget og godkendelse. */
  estimatedApiCostUsd: number;
  /** Bivirkninger, der altid kræver godkendelse. */
  sideEffects: readonly SideEffect[];
  /** Implementeret i denne version? Planlagte typer kan ikke startes. */
  implemented: boolean;
}

export const TASK_TYPES: readonly TaskTypeDefinition[] = [
  {
    key: "research.brand_analysis",
    module: "research",
    label: "Brandresearch",
    description: "Hjemmeside, CVR, signaler, anbefalinger og forretningsanalyse for ét brand.",
    defaultAgent: "scout",
    engines: ["claude_api", "internal"],
    canRunWithoutAi: true,
    interactive: true,
    estimatedApiCostUsd: 0.25,
    sideEffects: [],
    implemented: true,
  },
  {
    key: "research.deep_research",
    module: "research",
    label: "Dyb research (Claude Code)",
    description: "Længere, agentbaseret research med websøgning. Resultatet sendes tilbage med kilder og verificeringsstatus.",
    defaultAgent: "scout",
    engines: ["claude_code"],
    canRunWithoutAi: false,
    interactive: false,
    estimatedApiCostUsd: 0,
    sideEffects: [],
    implemented: true,
  },
  {
    key: "quotes.proposal_text",
    module: "quotes",
    label: "Tilbudstekst",
    description: "AI-tilbudstekst ud fra research og valgte services. Priser beregnes deterministisk.",
    defaultAgent: "nova",
    engines: ["claude_api", "internal"],
    canRunWithoutAi: true,
    interactive: true,
    estimatedApiCostUsd: 0.1,
    sideEffects: [],
    implemented: false,
  },
  {
    key: "production.build_solution",
    module: "production",
    label: "Byg kundeløsning",
    description: "Tilpasning af en gennemtestet grundbase til en kunde (kode, tests, dokumentation).",
    defaultAgent: "forge",
    engines: ["claude_code", "claude_api"],
    canRunWithoutAi: false,
    interactive: false,
    estimatedApiCostUsd: 3,
    sideEffects: [],
    implemented: false,
  },
  {
    key: "production.agent_task",
    module: "production",
    label: "Agentopgave i produktionsprojekt",
    description: "En konkret opgave fra et produktionsprojekt, udført af den tildelte agent (fx Forge eller Link).",
    defaultAgent: "forge",
    engines: ["claude_code", "claude_api"],
    canRunWithoutAi: false,
    interactive: false,
    estimatedApiCostUsd: 1.5,
    sideEffects: [],
    implemented: false,
  },
  {
    key: "production.deploy",
    module: "production",
    label: "Deployment af kundeløsning",
    description: "Udrulning til kundens miljø. Kræver altid godkendelse.",
    defaultAgent: "forge",
    engines: ["claude_code"],
    canRunWithoutAi: false,
    interactive: false,
    estimatedApiCostUsd: 0,
    sideEffects: ["deployment", "customer_system_change"],
    implemented: false,
  },
  {
    key: "crm.follow_up_draft",
    module: "crm",
    label: "Opfølgningsudkast",
    description: "Udkast til opfølgning på et salgsmøde. Afsendelse til kunden kræver godkendelse.",
    defaultAgent: "echo",
    engines: ["claude_api", "internal"],
    canRunWithoutAi: true,
    interactive: true,
    estimatedApiCostUsd: 0.05,
    sideEffects: [],
    implemented: false,
  },
  {
    key: "dashboard.insights",
    module: "dashboard",
    label: "Ledelsesindsigter",
    description: "AI-analyse af salg, omkostninger og leverancer.",
    defaultAgent: "pulse",
    engines: ["claude_api", "claude_code", "internal"],
    canRunWithoutAi: true,
    interactive: false,
    estimatedApiCostUsd: 0.2,
    sideEffects: [],
    implemented: false,
  },
];

export function getTaskType(key: string): TaskTypeDefinition | null {
  return TASK_TYPES.find((t) => t.key === key) ?? null;
}

/** Værktøjer, som en agentversion kan få adgang til. Ukendte værktøjer afvises ved validering. */
export const TOOL_CATALOG = [
  { key: "website_fetch", label: "Sikker hentning af offentlige hjemmesider", risk: "low" },
  { key: "web_search", label: "Websøgning (Brave / Claude Code)", risk: "low" },
  { key: "cvr_lookup", label: "CVR-opslag", risk: "low" },
  { key: "platform_read", label: "Læse platformdata (research, tilbud, kunder)", risk: "low" },
  { key: "platform_write", label: "Skrive resultater til platformen via Job Center", risk: "medium" },
  { key: "claude_api", label: "Claude API (betalt pr. token)", risk: "medium" },
  { key: "claude_code_routine", label: "Claude Code-rutine (abonnement)", risk: "medium" },
  { key: "github_read", label: "Læse kode i GitHub", risk: "low" },
  { key: "github_write", label: "Branches og pull requests i GitHub", risk: "high" },
  { key: "test_runner", label: "Køre automatiske tests", risk: "low" },
  { key: "deployment", label: "Deployment (kræver godkendelse)", risk: "high" },
  { key: "email_send", label: "Sende e-mail til kunder (kræver godkendelse)", risk: "high" },
] as const;

export type ToolKey = (typeof TOOL_CATALOG)[number]["key"];
export const TOOL_KEYS = TOOL_CATALOG.map((t) => t.key) as readonly string[];
