# AI Agency Platform — V4

Bureauets **interne arbejdsplatform**: research, salg, produktion, levering, kundestyring, rapportering og koordinering af specialiserede AI-agenter. Det er ikke en SaaS; kunderne får de løsninger, vi bygger, ikke adgang til platformen.

**Seks selvstændige moduler, der deler én AI-infrastruktur:**

| # | Modul | Route | Status |
|---|---|---|---|
| 1 | Research | `/research` | **Aktiv (V2)**: brand-first research via URL eller CVR, Website Intelligence, websøgning, konkurrenter, Claude-analyse, 5-10 serviceanbefalinger, kommerciel rapport |
| 2 | Tilbud | `/quotes` | **Aktiv (V2)**: tilbud til brand med eller uden CVR, engangsydelser, forudsætninger og forbehold, AI-tekst, versioner, PDF |
| 3 | Produktion & Levering | `/production` | **Aktiv (V3.2)**: projekter fra accepterede tilbud, 11 faser med faseporte i AOS, opgaver, agenter (AOS), arkitektur, filer, QA, aktivitet, økonomi, Service Factory og guidet demo (Restaurant Nord). Se [docs/production.md](docs/production.md) |
| 4 | CRM | `/crm` | **Aktiv (V3.3)**: leads og virksomheder uden dubletter, kontaktpersoner, Kanban-pipeline med 10 stadier, aktiviteter (liste og tidslinje), 360-graders kundeprofil på tværs af Research, Tilbud, Produktion og AOS (Echo), og en guidet 12-trins demo. Se [docs/crm.md](docs/crm.md) |
| 5 | Dashboard | `/dashboard` | **Aktiv (V3.4)**: Executive Command Center med Executive Overview, Salg, Økonomi, Levering, AI og agenter samt Action Center. Har globale filtre, interaktive grafer, et deterministisk analytics-lag uden dobbeltoptælling, Dashboard Demo Mode og det samlede seks-moduls forløb. Se [docs/dashboard.md](docs/dashboard.md) |
| 6 | AOS — Agent Operating System | `/aos` | **Aktiv (V3)**: Command Center, isometrisk Agent Office, Agent Library (versioneret), Job Center, Live Activity, Godkendelser, Performance & Cost, Integration Manager |

**Adgangsbeskyttelse (V4.1):** Platformen er privat. Alle sider og API'er kræver login med Supabase Auth og rollen `admin`. Det gælder ikke kun brugerfladen: middleware, hver API-route og layoutet kontrollerer adgangen server-side, og datalageret er låst til servernøglen. Se [docs/security.md](docs/security.md) og opsætningen af administrator i [docs/auth-setup.md](docs/auth-setup.md).

**Fælles AI-infrastruktur (V3, `@agency/orchestrator`):** alle opgaver går gennem Job Center. En regelbaseret, forklarlig router vælger motor: Claude Code-rutine (abonnement), Claude API (betalt) eller intern software uden AI. Godkendelser, omkostninger og agenternes status registreres samlet. Se [docs/v3-architecture.md](docs/v3-architecture.md) og [docs/claude-code-integration.md](docs/claude-code-integration.md).

Derudover findes **Indstillinger** (`/settings`) med Demo/Live-tilstand, integrationsstatus, modul- og kontraktoversigt og hændelseslog.

---

## Hurtig start

Krav: Node.js ≥ 20.11 og pnpm 10 (`corepack enable`).

```bash
pnpm install
pnpm build          # bygger Next.js-applikationen
pnpm start          # http://localhost:3000
# eller under udvikling:
pnpm dev
```

Platformen starter i **Demo Mode** og kræver ingen API-nøgler. Data gemmes lokalt i `.data/` (JSON-filer pr. modul) og overlever genstart.

### Demo-flowet (ca. 1 minut)

1. Åbn **Research**, og vælg indgang: **Hjemmeside / URL** eller **CVR-nummer**. Eller klik på et af demoeksemplerne.
2. **Identificér brand**: systemet finder brand, juridiske enheder, binavne og P-numre. Relationer fra hjemmesiden er *foreslået* og skal bekræftes.
3. **Opret brand og fortsæt** → bekræft eller afvis juridiske relationer på brandsiden → **Start AI Research**.
4. Gennemse den kommercielle rapport: overblik (samlet anbefaling, juridiske oplysninger, digital modenhed, spørgsmål til kundemødet), website-analyse, forretning, muligheder, konkurrenter og kilder.
5. Vælg services, redigér beskrivelser og noter, og klik **Gem rapport** → **Opret tilbud**.
6. Redigér priser, tilvalg, engangsydelser, rabat og vilkår med live-preview → **Generer tilbud** → **Eksportér PDF** → **Ny version**.

Demoeksemplerne dækker scenarierne: ét brand med CVR (Nordlys VVS), to brands under samme CVR (Fjordhuset Gruppen), hjemmeside med to CVR-numre (Bryggeriet Nordlys), hjemmeside uden CVR (Klinik Havblik) og webshop (Studio Fjord).

### Live Mode

Skift til Live Mode under **Indstillinger**, og konfigurér integrationer i `apps/web/.env.local` (se `.env.example`):

| Integration | Variabel | Uden nøgle |
|---|---|---|
| CVR-opslag, binavne, P-numre og navnesøgning (cvr.dev) | `CVR_DEV_API_KEY` (eller virk.dk: `CVR_VIRK_USERNAME`+`CVR_VIRK_PASSWORD`, uden P-numre/navnesøgning) | CVR-indgangen afvises med en forklaring; URL-research virker fuldt uden CVR |
| AI-analyse og tilbudstekst (Claude) | `ANTHROPIC_API_KEY` (`ANTHROPIC_MODEL`, standard `claude-opus-5-5`; verificeres via Models API) | Regelbaseret analyse og skabelontekst, tydeligt markeret |
| Websøgning: nyheder, job, anmeldelser, konkurrenter | `BRAVE_SEARCH_API_KEY` | Trinnet springes over og noteres som begrænsning |
| Hentning af hjemmeside | `RESEARCH_WEBSITE_FETCH` (standard `true`) | — |

| Claude Code-rutine (dyb research, V3) | `CLAUDE_CODE_ROUTINE_RESEARCH_ID`, `CLAUDE_CODE_ROUTINE_RESEARCH_TOKEN`, `AGENCY_PUBLIC_URL` — opsætning i [routines/ai-agency-job.md](routines/ai-agency-job.md) | Dyb research vises som ikke tilgængelig med begrundelse |

Omkostningsgrænser (`AI_DAILY_BUDGET_USD`, `AI_APPROVAL_THRESHOLD_USD`, `CLAUDE_CODE_DAILY_LIMIT`, `SEARCH_DAILY_LIMIT`, `RESEARCH_DAILY_LIMIT`, `CVR_DAILY_LIMIT`, `RESEARCH_MAX_PAGES`) og dagens forbrug vises under Indstillinger. Omkostninger pr. opgave, agent, kunde og motor vises i AOS → Performance & Cost.

I Live Mode bruges **aldrig** fiktive data som fallback. Manglende integrationer vises i rapportens "Datagrundlag og begrænsninger" og under Indstillinger.

---

## Drift på Vercel med Supabase

Platformen kan køre på Vercel med Supabase som database. Koden er den samme; kun lagringen skifter.

1. Opret et Supabase-projekt, og kør `supabase/migrations/20261029000000_documents.sql`.
2. Vælg en lang, tilfældig hemmelighed, og gem dens SHA-256-hash i databasen:
   `insert into private.config (key, value) values ('api_secret_sha256', encode(extensions.digest('<hemmelighed>', 'sha256'), 'hex'));`
3. Opret et Vercel-projekt fra GitHub-repositoryet med **Root Directory** `apps/web`.
4. Sæt miljøvariablerne `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` og `AGENCY_DB_SECRET` (hemmeligheden i klartekst) samt `PLATFORM_DEFAULT_MODE=demo`.

Indstillinger viser, om platformen bruger "Supabase (database)" eller "lokale JSON-filer". Platformen har intet login, så et offentligt Vercel-link bør kun bruges i Demo Mode uden rigtige API-nøgler.

## Test

```bash
pnpm test        # Vitest: 148 enhedstests (router, Job Center, callbacks, agentversioner, brand-first, scoring, priser, kontrakter, SSRF, budgetter …)
pnpm test:e2e    # Playwright (kræver Docker: rigtig Supabase Auth startes lokalt): adgangskontrol + scenarierne A-F + AOS + Produktion + CRM + Dashboard (KPI'er, filtre, Action Center, demo og det samlede seks-moduls forløb)
LIVE_BASE_URL=https://… pnpm exec playwright test -c playwright.live.config.ts   # live-test mod en deployet instans
pnpm typecheck   # TypeScript i alle pakker
```

E2E-testene starter den officielle Supabase Auth-server (`supabase/auth`) og Postgres i Docker (`scripts/local-auth`) samt platformen på port 3210 med en tom datamappe (`.data-e2e/`). Testbrugere oprettes med tilfældige adgangskoder pr. kørsel. Ingen mock af login eller sessioner.

---

## Projektstruktur

```text
ai-agency/
├── apps/web/                 Next.js App Router — sider, API-routes, layout/sidebar
├── packages/
│   ├── shared/               id'er, valuta, CVR-validering, fejltyper (isomorf)
│   ├── core/                 FÆLLES PLATFORMKERNE: datamodel (Zod), API-kontrakter, hændelser,
│   │                         modulregister, servicekatalog, kundeidentitet, lagring, rate limiting
│   ├── ui/                   fælles UI-komponenter (shadcn/ui-stil, Tailwind, Lucide)
│   ├── integrations/         adapters: CVR (cvr.dev/virk.dk), Claude, Brave Search, sikker webhentning
│   ├── research/             Modul 1 — komponenter + /server (pipeline, signaler, scoring, demo-data)
│   ├── quotes/               Modul 2 — komponenter, prisberegning + /server (tilbud, katalog, PDF)
│   ├── production/           Modul 3 — projekter, faser, opgaver, QA, Service Factory + /server (bruger AOS)
│   ├── crm/                  Modul 4 — virksomheder, kontakter, pipeline, aktiviteter, 360-profil + /server
│   ├── dashboard/            Modul 5 — analytics-lag (rene funktioner), grafer og Dashboard-visninger
│   ├── orchestrator/         FÆLLES AI-INFRASTRUKTUR: Job Center, Execution Router, Agent Manager,
│   │                         godkendelser, omkostninger, Integration Manager (+ /server)
│   └── aos/                  Modul 6 — AOS-komponenter (Command Center, Agent Office, …)
├── routines/                 protokol for Claude Code-rutiner (versionsstyret, kontouafhængig)
├── docs/                     arkitektur (V2 + V3), Claude Code-integration, API-kontrakter, sikkerhed, næste fase
├── tests/e2e/                Playwright-accepttests
├── scripts/export-zip.sh     ZIP-eksport uden nøgler/afhængigheder
└── .env.example
```

Hvert forretningsmodul har en klientsikker indgang (`@agency/<modul>`: komponenter og typer) og en serverindgang (`@agency/<modul>/server`: offentligt service-API). Moduler læser aldrig hinandens lagring. Se [docs/architecture.md](docs/architecture.md).

## Dokumentation

- [V3-arkitektur: hybrid AI-motor, orchestrator og AOS](docs/v3-architecture.md)
- [Produktion & Levering: faser, AOS-integration, Service Factory og demo](docs/production.md)
- [CRM: model, integrationer, demo, datamodelvurdering og adgangsrisiko](docs/crm.md)
- [Dashboard: KPI-definitioner, analytics-lag, filtre, Action Center og samlet demo](docs/dashboard.md)
- [Claude Code som motor — verificerede muligheder og begrænsninger](docs/claude-code-integration.md)
- [Arkitektur og modulgrænser](docs/architecture.md)
- [API-kontrakter og endepunkter](docs/api-contracts.md)
- [Sikkerhed og adgangsbeskyttelse (V4.1)](docs/security.md)
- [Opsætning af administrator og adgang](docs/auth-setup.md)
- [Næste udviklingsfase](docs/next-phase.md)

## ZIP-eksport

```bash
pnpm export:zip   # → exports/ai-agency-platform-<dato>.zip
```

Eksporten indeholder kildekode og dokumentation, men ikke `node_modules`, `.next`, `.data`, `.env*.local` eller andre ignorerede filer. Scriptet afbryder, hvis en fil ligner en API-nøgle.

## Hvad er ikke implementeret endnu

- MFA og de fremtidige roller (manager, sales, production, viewer) — kun `admin` er aktiv (se [docs/security.md](docs/security.md)).
- Tilbudstekst bruger endnu ikke Job Center. Produktionens agentopgaver og CRM's Echo-opgaver registreres i Job Center, men opgavetyperne (`production.agent_task`, `crm.*`) er planlagt (routeren blokerer med begrundelse).
- Dashboard kan ikke vise faktureret omsætning eller modtagne betalinger. Platformen har ingen faktura- og betalingsdata, og tallene vises derfor som "Ikke tilgængelig".
- CRM sender ingen e-mails og foretager ingen opkald; aktiviteter og tilbudsafsendelse registreres kun manuelt.
- Afsendelse af tilbud til kunder. Status `sent`, `accepted` og `rejected` registreres manuelt (Tilbud/CRM).
- Lokalt bruges JSON-filer; på Vercel bruges Supabase bag samme `CollectionStore`-interface (ét JSONB-dokument pr. entitet, ikke normaliserede tabeller).
- Websøgning (Brave) og Claude kræver API-nøgler; uden dem markeres analysen som regelbaseret, og eksterne kilder (anmeldelser, job, nyheder, konkurrenter) undersøges ikke.
- Hjemmesider, der kræver JavaScript for at vise indhold, analyseres kun ud fra den HTML, serveren leverer.
- Konkurrentanalyse og stillingsopslag/anmeldelser kræver websøgning (`BRAVE_SEARCH_API_KEY`). Sociale profiler registreres kun via links på virksomhedens hjemmeside.
- Alle priser i servicekataloget er fiktive demopriser.
