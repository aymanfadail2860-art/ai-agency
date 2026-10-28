# Arkitektur — AI Agency Platform V1

## 1. Principper

1. **Fem selvstændige forretningsmoduler** (Research, Tilbud, Produktion & Levering, CRM, Dashboard) på samme niveau, hver i sin egen pakke med egen route.
2. **Produktion & Levering er ikke en del af Tilbud.** Modulet modtager senere opgaver fra Tilbud *og* CRM gennem kontrakten `quotes.production-intake@1`, hvor feltet `sentBy` angiver afsenderen.
3. **Kommunikation kun via kontrakter.** Et modul må aldrig læse et andet moduls lagring. Kontrakter er versionerede Zod-skemaer i `@agency/core`.
4. **Fælles platformkerne** for kundeidentitet, datamodeller, hændelser, modulregister og lagring.
5. **Monolit nu, udskillelig senere.** Én Next.js-app i V1. Modulernes service-API'er er rene funktioner med validerede input og output, så de kan flyttes bag HTTP uden ændringer i kontrakterne.

## 2. Pakker og afhængigheder

```text
                     apps/web  (Next.js: sider + API-routes = orkestrering)
        ┌──────────┬─────┴──────┬────────────┬──────────┬────────────┐
     research    quotes     production      crm     dashboard        │
        │  │       │  │          │           │          │            │
        │  └──┬────┘  │          │           │          │            │
        │ integrations│          │           │          │            │
        └──────┴──────┴──── core ┴───────────┴──────────┘            │
                               │                                     │
                    shared ────┘          ui ────────────────────────┘
```

- `shared`: isomorfe hjælpere (id'er, valuta i øre, CVR-modulus-11, `AppError`).
- `core`: datamodel, kontrakter, hændelsesmodel, modulregister, standard-servicekatalog. Desuden `core/server`: JSON-lagring, fælles virksomhedsregister, hændelseslog, indstillinger og rate limiting.
- `integrations`: alle eksterne kald (CVR, Claude, Brave Search, webhentning) bag adapters. Ingen forretningslogik.
- `research` og `quotes` afhænger ikke af hinanden. Overførslen orkestreres i `apps/web/app/api/research/reports/[reportId]/handoff/route.ts`.
- `production`, `crm` og `dashboard` indeholder kun preview-komponenter og fremtidige skemaer.

Hvert modul eksporterer to indgange:

| Indgang | Indhold | Må bruges fra |
|---|---|---|
| `@agency/<modul>` | React-komponenter, typer, rene funktioner (fx `calculateQuoteTotals`) | klient og server |
| `@agency/<modul>/server` | modulets offentlige service-API | kun server (routes, sider) |

## 3. Fælles kundeidentitet

`companyRegistry` i `core/server` ejer `Company`. En virksomhed er unik pr. `(cvr, mode)`, så demo- og live-data aldrig blandes. Research registrerer virksomheden. Tilbud modtager `CompanyRef` (`companyId`, `cvr`, `name`) via kontrakten. CRM og Produktion skal bruge samme `companyId`.

## 4. Datamodel

Defineret i `packages/core/src/models.ts` (Zod → TypeScript). Alle entiteter har præfiksede id'er (`cmp_`, `rjob_`, `rrep_`, `src_`, `rec_`, `qte_`, `qver_`, `qli_` …) og `createdAt`/`updatedAt`.

| Entitet | Ejer | Bemærkning |
|---|---|---|
| Company | core | fælles kundeidentitet, registerkilde og tidspunkt, reklamebeskyttelse |
| ResearchJob | research | trinvis status (`steps`) til progress-visning |
| ResearchReport | research | profil, muligheder, konkurrenter, anbefalinger, kilder, begrænsninger, valg og noter |
| ResearchSource | research | type, URL, udbyder, hentetidspunkt, begrænset uddrag, `isDemo` |
| Finding | research | `classification`: `fact` / `assessment` / `hypothesis` + `sourceIds` |
| ServiceCatalogItem | core (standard), quotes (prisoverstyringer) | alle priser `isDemoPrice: true` |
| ServiceRecommendation | research | score med fire kriterier, brugerens valg, redigeringer og noter |
| Quote / QuoteVersion / QuoteLineItem | quotes | versionering: tidligere versioner låses (`superseded`) |
| ProductionProject, ProductionTask, Deliverable | production | kun skema (fremtid) |
| CRMContact, SalesOpportunity | crm | kun skema (fremtid) |
| DashboardMetric | dashboard | kun skema (fremtid) |

## 5. Researchpipeline

`packages/research/src/server/pipeline.ts`:

```text
registry → website → search → competitors → signals → recommendations → analysis → report
```

- **Datakilder er udskiftelige** (`ResearchDataSources`). Demo Mode bruger fiktive sider og søgeresultater, Live Mode bruger `safeFetch` og Brave Search. Analysetrinnene er de samme i begge tilstande.
- **Signaler** (`signals.ts`): mønstergenkendelse af chat, booking, formularer, nyhedsbrev, analytics, webshop, sociale links, telefon, stillingsopslag og anmeldelser. Tilstedeværelse = fakta. Fravær = vurdering, fordi funktionen kan være indlæst dynamisk.
- **Anbefalinger og AI Opportunity Score** (`recommend.ts`): deterministisk og vægtet. Observerede behovssignaler 35 %, branchefit 30 %, kildegrundlag 20 %, implementeringsenkelhed 15 %. Hvert kriterium har en begrundelse, som vises i UI. AI ændrer aldrig scoren.
- **Analyse**: Claude (structured outputs, valideret med Zod), når `ANTHROPIC_API_KEY` er sat. Ellers en regelbaseret analyse. Begge mærkes i rapporten. Hvis Claude fejler, falder pipelinen tilbage til regelbaseret analyse og noterer det som begrænsning.
- Jobbet kører asynkront i serverprocessen, og klienten poller `GET /api/research/jobs/:id`.

## 6. Tilbud

- `pricing.ts`: ren funktion i hele øre (linjer × antal + tilvalg, rabat i procent eller beløb pr. omfang, moms, første år = implementering + 12 × månedlig). Den bruges ens af editor, preview, PDF og tests.
- Intake fra kontrakten er idempotent pr. `handoffId`.
- Tilbudstekst kommer fra Claude (kun Live Mode med nøgle) eller fra en skabelon, der kun bruger research og tilbudsdata.
- PDF genereres med `pdf-lib` direkte fra den valgte version. Demo-tilbud får vandmærke og markering.

## 7. Hændelsesmodel

`DomainEvent` (`core/events.ts`) logges i `platform/events.json` og kan abonneres in-process (`subscribe`). Hændelser i V1: `company.registered`, `research.job.started`, `research.completed`, `research.failed`, `research.report.updated`, `research.handoff.created`, `quote.created`, `quote.draft.saved`, `quote.version.created`, `quote.content.generated`, `quote.pdf.exported`, `catalog.updated`, `settings.updated`. CRM og Dashboard skal senere bygge på disse.

## 8. Lagring

`createCollectionStore(module, collection, schema)` skriver til `<DATA_DIR>/<modul>/<samling>.json`. Skrivninger sker atomisk (tmp + rename) med en lås pr. fil, og alt valideres med Zod ved læsning og skrivning. Interfacet (`list/get/find/upsert/update/remove`) kan implementeres oven på PostgreSQL/Supabase. Se [next-phase.md](next-phase.md).

## 9. Udskillelse til separate deploys

Når et modul skal udskilles:

1. Flyt pakkens `server`-indgang bag egne HTTP-endepunkter, som allerede er defineret i `apps/web/app/api/*`.
2. Erstat in-process-kaldet i orkestreringen (fx handoff-routen) med et HTTP-kald, der sender den samme kontrakt.
3. Erstat JSON-lagringen med modulets egen database. Den fælles kundeidentitet flyttes til en platformtjeneste.
