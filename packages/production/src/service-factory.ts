import type { AgentRole, Architecture, Phase, Priority, TestCase } from "./contracts";

/**
 * SERVICE FACTORY — genbrugelige servicebaser (kilde: GitHub)
 * -----------------------------------------------------------
 * Hver base beskriver et standardiseret grundsystem, der tilpasses den enkelte
 * kunde. I denne etape er det et katalog og en projektskabelon — baserne selv
 * er endnu ikke udviklet, og repository-referencerne er markeret "planlagt".
 */
export interface ServiceBaseDefinition {
  key: string;
  name: string;
  category: string;
  description: string;
  features: string[];
  integrations: string[];
  customization: string[];
  stack: string[];
  version: string;
  status: "concept" | "in_development" | "ready" | "deprecated";
  repositories: Array<{ label: string; ref: string; status: "planned" | "exists" }>;
  catalogItemId: string | null;
  defaultAgents: Array<{ key: string; role: AgentRole }>;
}

const CORE_TEAM = [
  { key: "atlas", role: "project_lead" as const },
  { key: "forge", role: "developer" as const },
  { key: "link", role: "integration" as const },
  { key: "vega", role: "qa" as const },
];

export const SERVICE_BASES: readonly ServiceBaseDefinition[] = [
  {
    key: "ai_receptionist",
    name: "AI-receptionist",
    category: "Stemme og telefoni",
    description: "Telefonreceptionist, der besvarer opkald døgnet rundt, svarer på almindelige spørgsmål, booker tider og stiller videre til en medarbejder.",
    features: ["Besvarelse af opkald 24/7", "Svar på almindelige spørgsmål ud fra vidensbase", "Booking i eksisterende system", "Viderestilling til medarbejder", "Samtalelog og resuméer", "Administrationspanel"],
    integrations: ["Telefoni (fx Twilio)", "Stemmeplatform (fx ElevenLabs)", "Bookingsystem", "Kalender", "SMS"],
    customization: ["Stemme og tone", "Åbningstider og regler", "Vidensbase (menu, priser, FAQ)", "Viderestillingsregler", "Sprog"],
    stack: ["Next.js (administrationspanel)", "Supabase (data og log)", "Stemmeplatform", "Telefoni-API", "Claude (samtalelogik)"],
    version: "0.1.0",
    status: "concept",
    repositories: [{ label: "Grundbase: AI-receptionist", ref: "aymanfadail2860-art/service-ai-receptionist (planlagt)", status: "planned" }],
    catalogItemId: "svc_ai_receptionist",
    defaultAgents: CORE_TEAM,
  },
  {
    key: "ai_chatbot",
    name: "AI-chatbot",
    category: "Kundedialog",
    description: "Chatbot på hjemmesiden, der besvarer spørgsmål ud fra virksomhedens egen viden og opsamler leads.",
    features: ["Svar ud fra vidensbase", "Leadopsamling", "Overlevering til medarbejder", "Samtalehistorik", "Widget til hjemmesiden"],
    integrations: ["Hjemmeside (widget)", "CRM", "E-mail"],
    customization: ["Design og tone", "Vidensbase", "Overleveringsregler", "Sprog"],
    stack: ["Next.js", "Supabase", "Claude"],
    version: "0.1.0",
    status: "concept",
    repositories: [{ label: "Grundbase: AI-chatbot", ref: "planlagt", status: "planned" }],
    catalogItemId: "svc_ai_chatbot",
    defaultAgents: CORE_TEAM,
  },
  {
    key: "crm_system",
    name: "CRM-system",
    category: "Salg og kunder",
    description: "Skræddersyet CRM med kontakter, pipeline, aktiviteter og opfølgninger.",
    features: ["Kontakter og virksomheder", "Salgspipeline", "Aktiviteter og opgaver", "Rapportering", "Import af eksisterende data"],
    integrations: ["E-mail og kalender", "Regnskab", "Hjemmesideformularer"],
    customization: ["Pipeline-faser", "Felter og roller", "Rapporter"],
    stack: ["Next.js", "Supabase", "Row Level Security"],
    version: "0.1.0",
    status: "concept",
    repositories: [{ label: "Grundbase: CRM", ref: "planlagt", status: "planned" }],
    catalogItemId: "svc_crm_system",
    defaultAgents: [...CORE_TEAM, { key: "echo", role: "crm" }],
  },
  {
    key: "workflow_automation",
    name: "Workflow Automation",
    category: "Automatisering",
    description: "Automatisering af gentagne arbejdsgange på tværs af kundens systemer.",
    features: ["Kortlægning af arbejdsgange", "Automatiserede flows", "Fejlhåndtering og alarmer", "Logning"],
    integrations: ["n8n", "E-mail", "Regneark", "Kundens API'er"],
    customization: ["Flows og triggere", "Godkendelsestrin", "Notifikationer"],
    stack: ["n8n", "Supabase", "Claude (klassificering)"],
    version: "0.1.0",
    status: "concept",
    repositories: [{ label: "Flowbibliotek", ref: "planlagt", status: "planned" }],
    catalogItemId: "svc_sales_automation",
    defaultAgents: CORE_TEAM,
  },
  {
    key: "ai_customer_support",
    name: "AI Customer Support",
    category: "Kundeservice",
    description: "AI-assisteret kundeservice med automatisk kategorisering, svarudkast og eskalering.",
    features: ["Kategorisering af henvendelser", "Svarudkast til medarbejdere", "Automatiske svar på simple spørgsmål", "Eskalering", "Kvalitetsrapporter"],
    integrations: ["Helpdesk (fx Zendesk/Freshdesk)", "E-mail", "Chat"],
    customization: ["Kategorier", "Tone og skabeloner", "Eskaleringsregler"],
    stack: ["Next.js", "Supabase", "Claude"],
    version: "0.1.0",
    status: "concept",
    repositories: [{ label: "Grundbase: AI Support", ref: "planlagt", status: "planned" }],
    catalogItemId: "svc_ai_customer_service",
    defaultAgents: CORE_TEAM,
  },
  {
    key: "lead_generation",
    name: "Lead Generation System",
    category: "Salg og marketing",
    description: "Opsamling, berigelse og prioritering af leads fra flere kanaler.",
    features: ["Leadformularer", "Berigelse af leads", "Scoring og prioritering", "Automatisk opfølgning"],
    integrations: ["Meta og Google Ads", "CRM", "E-mail"],
    customization: ["Scoringsregler", "Kanaler", "Opfølgningsflows"],
    stack: ["Next.js", "Supabase", "n8n"],
    version: "0.1.0",
    status: "concept",
    repositories: [{ label: "Grundbase: Leads", ref: "planlagt", status: "planned" }],
    catalogItemId: "svc_lead_management",
    defaultAgents: [...CORE_TEAM, { key: "echo", role: "crm" }],
  },
  {
    key: "web_application",
    name: "Website / Web Application",
    category: "Web",
    description: "Hjemmesider og webapplikationer bygget på en gennemtestet Next.js-base.",
    features: ["Responsivt design", "CMS eller administrationspanel", "SEO og performance", "Formularer og booking"],
    integrations: ["Analytics", "Betaling", "CRM"],
    customization: ["Design og indhold", "Sider og funktioner", "Integrationer"],
    stack: ["Next.js", "Tailwind CSS", "Supabase", "Vercel"],
    version: "0.1.0",
    status: "concept",
    repositories: [{ label: "Grundbase: Web", ref: "planlagt", status: "planned" }],
    catalogItemId: null,
    defaultAgents: CORE_TEAM,
  },
  {
    key: "ai_content_production",
    name: "AI Content Production",
    category: "Indhold og kreativ produktion",
    description: "Produktion af tekst, billeder og video med AI og menneskelig kvalitetskontrol.",
    features: ["Indholdsplan", "Tekstproduktion", "Billeder og video", "Godkendelsesflow"],
    integrations: ["Higgsfield (video)", "Sociale medier", "CMS"],
    customization: ["Tone of voice", "Formater og kanaler", "Godkendelsestrin"],
    stack: ["Claude", "Higgsfield", "Supabase"],
    version: "0.1.0",
    status: "concept",
    repositories: [{ label: "Grundbase: Content", ref: "planlagt", status: "planned" }],
    catalogItemId: "svc_marketing_automation",
    defaultAgents: [{ key: "atlas", role: "project_lead" }, { key: "forge", role: "developer" }, { key: "vega", role: "qa" }],
  },
];

export function getServiceBaseDefinition(key: string): ServiceBaseDefinition | null {
  return SERVICE_BASES.find((b) => b.key === key) ?? null;
}

// ─── Projektskabeloner ─────────────────────────────────────────────────────

export interface TaskTemplate {
  phase: Phase;
  title: string;
  description: string;
  agent: string | null;
  priority: Priority;
  required: boolean;
  /** Dage efter projektstart, opgaven forfalder. */
  dueOffsetDays: number;
}

/** Fælles faseforløb for alle servicebaser; specialiseres med basens funktioner og integrationer. */
export function taskTemplateFor(base: ServiceBaseDefinition): TaskTemplate[] {
  const t = (phase: Phase, title: string, description: string, agent: string | null, dueOffsetDays: number, priority: Priority = "normal", required = true): TaskTemplate => ({
    phase,
    title,
    description,
    agent,
    priority,
    required,
    dueOffsetDays,
  });
  const isReceptionist = base.key === "ai_receptionist";
  return [
    t("created", "Bekræft aftale og opstartsdato", "Gennemgå accepteret tilbud, leverancer og pris. Bekræft opstart med kunden.", "atlas", 1, "high"),
    t("requirements", "Kravworkshop med kunden", "Afdæk behov, succeskriterier, åbningstider, undtagelser og ansvarlige hos kunden.", "atlas", 4, "high"),
    t("requirements", isReceptionist ? "Indsaml vidensbase: menu, priser, FAQ og regler" : "Indsaml data og eksisterende materiale", "Saml det materiale, løsningen skal bygge på.", "atlas", 6),
    t("requirements", "Kravspecifikation og acceptkriterier", "Skriftlig kravspecifikation godkendt af kunden.", "atlas", 7, "high"),
    t("architecture", "Teknisk arkitektur ud fra grundbasen", `Vælg tilpasninger af ${base.name} v${base.version}, datamodel og hosting.`, "forge", 9, "high"),
    t("architecture", "Integrationsplan", `Afklar adgang og ansvar for: ${base.integrations.slice(0, 3).join(", ")}.`, "link", 10),
    t("architecture", "Testplan og testcases", "Definér testcases ud fra acceptkriterierne.", "vega", 10),
    ...base.features.slice(0, 4).map((f, i) => t("development", f, `Tilpas og konfigurér "${f}" til kunden.`, "forge", 14 + i * 2)),
    ...base.integrations.slice(0, 3).map((name, i) => t("integrations", `Integration: ${name}`, `Opsæt og test integrationen med ${name}.`, "link", 21 + i * 2)),
    t("qa", "Kør testplan", "Gennemfør alle testcases og registrér resultater.", "vega", 27, "high"),
    t("qa", "Ret fejl fundet i test", "Ret registrerede fejl og kør regressionstest.", "forge", 29),
    t("internal_approval", "Intern gennemgang af leverancen", "Gennemgå leverancen mod kravspecifikationen før kundedemo.", "atlas", 30, "high"),
    t("customer_approval", "Demo for kunden og indhent godkendelse", "Vis løsningen og indhent kundens skriftlige godkendelse.", "atlas", 32, "high"),
    t("deployment", "Produktionsopsætning og go-live", "Opsæt produktion. Kræver godkendelse i AOS før start.", "forge", 34, "critical"),
    t("deployment", "Overvågning og alarmer", "Overvågning, fejlalarmer og log i drift.", "link", 34),
    t("delivered", "Overlevering og dokumentation", "Brugervejledning, adgang og overleveringsmøde.", "atlas", 35),
    t("maintenance", "Månedlig driftsgennemgang", "Gennemgå log, fejl og forbedringsmuligheder.", "vega", 65, "low", false),
  ];
}

export function architectureTemplateFor(base: ServiceBaseDefinition): Architecture {
  if (base.key === "ai_receptionist") {
    return {
      summary:
        "Indgående opkald modtages af telefoni-udbyderen og sendes til stemmeplatformen. Samtalelogikken bruger restaurantens vidensbase (menu, åbningstider, regler) og kan slå ledige borde op i bookingsystemet. Ved komplekse forespørgsler stilles der videre til en medarbejder. Alle samtaler logges med resumé i administrationspanelet.",
      stack: base.stack,
      integrations: [
        { name: "Telefoni (fx Twilio)", purpose: "Telefonnummer, indgående opkald og viderestilling", status: "planned" },
        { name: "Stemmeplatform (fx ElevenLabs)", purpose: "Tale-til-tekst, tekst-til-tale og samtaleflow", status: "planned" },
        { name: "Restaurantens bookingsystem", purpose: "Opslag og oprettelse af bordreservationer", status: "planned" },
        { name: "SMS", purpose: "Bekræftelse af reservation til gæsten", status: "planned" },
      ],
      components: [
        { name: "Samtaleagent", description: "Svarer på spørgsmål og guider gæsten gennem booking." },
        { name: "Vidensbase", description: "Menu, priser, allergener, åbningstider og husregler." },
        { name: "Bookingadapter", description: "Kontrollerer ledighed og opretter reservationer." },
        { name: "Viderestilling", description: "Regler for, hvornår og til hvem der stilles videre." },
        { name: "Samtalelog", description: "Transskription, resumé og udfald pr. opkald." },
        { name: "Administrationspanel", description: "Indstillinger, vidensbase, log og statistik for restauranten." },
      ],
      dataFlows: [
        "Opkald → telefoni → stemmeplatform → samtaleagent",
        "Samtaleagent → bookingadapter → bookingsystem → SMS-bekræftelse",
        "Samtaleagent → viderestilling → medarbejder",
        "Alle samtaler → samtalelog → administrationspanel",
      ],
      risks: ["Bookingsystemets API kan have begrænset adgang", "Støj og dialekter kan påvirke talegenkendelse", "Personoplysninger i samtalelog kræver databehandleraftale og sletningspolitik"],
    };
  }
  return {
    summary: `Løsningen bygges på grundbasen ${base.name} v${base.version} og tilpasses kundens behov.`,
    stack: base.stack,
    integrations: base.integrations.map((name) => ({ name, purpose: "Afklares under kravafdækning", status: "planned" as const })),
    components: base.features.map((f) => ({ name: f, description: "Standardfunktion i grundbasen" })),
    dataFlows: [],
    risks: [],
  };
}

export interface TestTemplate {
  title: string;
  area: string;
  kind: TestCase["kind"];
  expected: string;
}

export function testTemplateFor(base: ServiceBaseDefinition): TestTemplate[] {
  if (base.key === "ai_receptionist") {
    return [
      { title: "Besvarer opkald inden for 2 ring", area: "Telefoni", kind: "functional", expected: "Opkaldet besvares med restaurantens hilsen." },
      { title: "Svarer korrekt på åbningstider", area: "Vidensbase", kind: "functional", expected: "Svaret matcher åbningstiderne i vidensbasen." },
      { title: "Svarer på allergenspørgsmål uden at gætte", area: "Vidensbase", kind: "functional", expected: "Henviser til personalet, hvis oplysningen mangler." },
      { title: "Booker bord til 4 personer fredag kl. 19", area: "Booking", kind: "integration", expected: "Reservationen oprettes i bookingsystemet." },
      { title: "Håndterer fuldt booket aften", area: "Booking", kind: "functional", expected: "Tilbyder alternative tidspunkter." },
      { title: "Sender SMS-bekræftelse", area: "SMS", kind: "integration", expected: "Gæsten modtager SMS med tid og antal." },
      { title: "Stiller videre ved klage", area: "Viderestilling", kind: "functional", expected: "Opkaldet stilles videre til vagthavende." },
      { title: "Samtale logges med resumé", area: "Samtalelog", kind: "end_to_end", expected: "Log og resumé vises i administrationspanelet." },
      { title: "10 samtidige opkald", area: "Drift", kind: "performance", expected: "Alle opkald besvares uden afbrydelser." },
      { title: "Kundens accepttest", area: "Accept", kind: "acceptance", expected: "Restauranten godkender gennemspillede scenarier." },
    ];
  }
  return [
    ...base.features.slice(0, 4).map((f) => ({ title: `${f} virker efter krav`, area: f, kind: "functional" as const, expected: "Opfylder acceptkriterierne." })),
    ...base.integrations.slice(0, 2).map((i) => ({ title: `Integration: ${i}`, area: i, kind: "integration" as const, expected: "Data udveksles korrekt." })),
    { title: "Kundens accepttest", area: "Accept", kind: "acceptance", expected: "Kunden godkender leverancen." },
  ];
}

export function maintenanceTemplateFor(base: ServiceBaseDefinition) {
  return base.key === "ai_receptionist"
    ? {
        plan: "Månedlig gennemgang af samtalelog, fejlede bookinger og spørgsmål uden svar. Vidensbasen opdateres ved menuskift. Kvartalsvis forbedringsmøde med restauranten.",
        sla: "Fejl, der stopper opkald: reaktion inden for 2 timer i åbningstiden. Øvrige fejl: næste hverdag.",
        recurringTasks: ["Månedlig loggennemgang", "Opdatering af vidensbase ved menuskift", "Kvartalsvis forbedringsmøde", "Overvågning af oppetid"],
      }
    : {
        plan: `Løbende drift og vedligeholdelse af ${base.name} med månedlig gennemgang.`,
        sla: "Kritiske fejl: reaktion samme hverdag. Øvrige fejl: inden for 3 hverdage.",
        recurringTasks: ["Månedlig driftsgennemgang", "Sikkerhedsopdateringer"],
      };
}
