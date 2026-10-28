# AI Agency Platform — V1

Et modulært operativsystem til et AI-bureau: fra research og salg til produktion, levering, kundestyring og rapportering.

**V1 indeholder fem selvstændige moduler:**

| # | Modul | Route | Status i V1 |
|---|---|---|---|
| 1 | Research | `/research` | **Aktiv**: CVR-opslag, researchpipeline, AI-analyse, serviceanbefalinger |
| 2 | Tilbud | `/quotes` | **Aktiv**: servicekatalog, tilbudsbygger, prisberegning, tilbudstekst, versioner, PDF |
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

1. Åbn **Research**, og vælg en af de tre fiktive virksomheder.
2. Klik **Start AI Research**. Pipelinen kører alle trin på fiktive kilder.
3. Gennemse rapporten: resumé, profil, forbedringsmuligheder, konkurrenter og kilder (klik på `[n]`).
4. Vælg services med checkboxes, redigér beskrivelser og noter, og klik **Gem rapport**.
5. Klik **Opret tilbud**. Kunde, resumé, services og begrundelser overføres automatisk.
6. Redigér priser, tilvalg, rabat og vilkår, og følg live-preview til højre.
7. **Generer tilbud** → **Eksportér PDF** → **Ny version**.

### Live Mode

Skift til Live Mode under **Indstillinger**, og konfigurér integrationer i `apps/web/.env.local` (se `.env.example`):

| Integration | Variabel | Uden nøgle |
|---|---|---|
| CVR-opslag (cvr.dev eller virk.dk) | `CVR_DEV_API_KEY` / `CVR_VIRK_USERNAME`+`CVR_VIRK_PASSWORD` | Opslag afvises med en forklaring, uden demo-fallback |
| AI-analyse og tilbudstekst (Claude) | `ANTHROPIC_API_KEY` (`ANTHROPIC_MODEL`, standard `claude-opus-5-5`) | Regelbaseret analyse og skabelontekst, tydeligt markeret |
| Websøgning: nyheder, job, anmeldelser, konkurrenter | `BRAVE_SEARCH_API_KEY` | Trinnet springes over og noteres som begrænsning |
| Hentning af hjemmeside | `RESEARCH_WEBSITE_FETCH` (standard `true`) | — |

I Live Mode bruges **aldrig** fiktive data som fallback. Manglende integrationer vises i rapportens "Datagrundlag og begrænsninger" og under Indstillinger.

---

## Test

```bash
pnpm test        # Vitest: 67 enhedstests (priser, kontrakter, SSRF, robots, CVR-mapping, scoring, pipeline, PDF …)
pnpm test:e2e    # Playwright: bygger appen og kører hele acceptflowet (punkt 1-16) + API-kontrakttests
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
- PostgreSQL/Supabase: V1 bruger lokal JSON-lagring bag et udskifteligt `CollectionStore`-interface.
- Konkurrentanalyse og stillingsopslag/anmeldelser kræver websøgning (`BRAVE_SEARCH_API_KEY`). Sociale profiler registreres kun via links på virksomhedens hjemmeside.
- Alle priser i servicekataloget er fiktive demopriser.
