# AI Agency Platform — V2

Et modulært operativsystem til et AI-bureau: fra research og salg til produktion, levering, kundestyring og rapportering.

**V1 indeholder fem selvstændige moduler:**

| # | Modul | Route | Status i V1 |
|---|---|---|---|
| 1 | Research | `/research` | **Aktiv (V2)**: brand-first research via URL eller CVR, Website Intelligence, websøgning, konkurrenter, Claude-analyse, 5-10 serviceanbefalinger, kommerciel rapport |
| 2 | Tilbud | `/quotes` | **Aktiv (V2)**: tilbud til brand med eller uden CVR, engangsydelser, forudsætninger og forbehold, AI-tekst, versioner, PDF |
| 3 | Produktion & Levering | `/production` | Afventer: visuelt preview + dokumenteret kontrakt |
| 4 | CRM | `/crm` | Afventer: visuelt preview + dokumenteret kontrakt |
| 5 | Dashboard | `/dashboard` | Afventer: visuelt preview (demo-markeret) + dokumenteret kontrakt |

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

Omkostningsgrænser (`AI_DAILY_BUDGET_USD`, `SEARCH_DAILY_LIMIT`, `RESEARCH_DAILY_LIMIT`, `CVR_DAILY_LIMIT`, `RESEARCH_MAX_PAGES`) og dagens forbrug vises under Indstillinger.

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
pnpm test        # Vitest: 87 enhedstests (brand-first, discovery, scoring, priser, kontrakter, SSRF, CVR-mapping, budgetter, PDF …)
pnpm test:e2e    # Playwright: bygger appen og kører scenarierne A-F (CVR, URL, flere brands, flere juridiske enheder, manglende integration, persistens)
LIVE_BASE_URL=https://… pnpm exec playwright test -c playwright.live.config.ts   # live-test mod en deployet instans
pnpm typecheck   # TypeScript i alle pakker
```

E2E-testene starter en server på port 3210 med en tom datamappe (`.data-e2e/`).

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
│   ├── production/           Modul 3 — preview + fremtidige kontrakter (ingen forretningslogik)
│   ├── crm/                  Modul 4 — preview + fremtidige kontrakter
│   └── dashboard/            Modul 5 — preview + fremtidige kontrakter
├── docs/                     arkitektur, API-kontrakter, sikkerhed, næste fase
├── tests/e2e/                Playwright-accepttests
├── scripts/export-zip.sh     ZIP-eksport uden nøgler/afhængigheder
└── .env.example
```

Hvert forretningsmodul har en klientsikker indgang (`@agency/<modul>`: komponenter og typer) og en serverindgang (`@agency/<modul>/server`: offentligt service-API). Moduler læser aldrig hinandens lagring. Se [docs/architecture.md](docs/architecture.md).

## Dokumentation

- [Arkitektur og modulgrænser](docs/architecture.md)
- [API-kontrakter og endepunkter](docs/api-contracts.md)
- [Sikkerhed, og hvad der mangler før produktion](docs/security.md)
- [Næste udviklingsfase](docs/next-phase.md)

## ZIP-eksport

```bash
pnpm export:zip   # → exports/ai-agency-platform-<dato>.zip
```

Eksporten indeholder kildekode og dokumentation, men ikke `node_modules`, `.next`, `.data`, `.env*.local` eller andre ignorerede filer. Scriptet afbryder, hvis en fil ligner en API-nøgle.

## Hvad er ikke implementeret i V1

- Produktion & Levering, CRM og Dashboard har kun visuelle previews og kontraktspecifikationer. Deres API-endepunkter svarer `501 Not Implemented`.
- Brugerlogin og adgangsstyring.
- Accept af tilbud og afsendelse til kunder. Status `accepted` findes i datamodellen, men bruges ikke.
- Lokalt bruges JSON-filer; på Vercel bruges Supabase bag samme `CollectionStore`-interface (ét JSONB-dokument pr. entitet, ikke normaliserede tabeller).
- Websøgning (Brave) og Claude kræver API-nøgler; uden dem markeres analysen som regelbaseret, og eksterne kilder (anmeldelser, job, nyheder, konkurrenter) undersøges ikke.
- Hjemmesider, der kræver JavaScript for at vise indhold, analyseres kun ud fra den HTML, serveren leverer.
- Konkurrentanalyse og stillingsopslag/anmeldelser kræver websøgning (`BRAVE_SEARCH_API_KEY`). Sociale profiler registreres kun via links på virksomhedens hjemmeside.
- Alle priser i servicekataloget er fiktive demopriser.
