# Næste udviklingsfase

> **V3 er påbegyndt.** Den fælles AI-infrastruktur (Job Center, router, agenter, godkendelser, omkostninger) og AOS er implementeret, og Research kører gennem den. Den prioriterede plan for de næste etaper står i [v3-architecture.md §9](v3-architecture.md). Punkterne nedenfor er det oprindelige forslag fra V2 og gælder fortsat som modulbeskrivelser.

Forslag i prioriteret rækkefølge. Kontrakterne er allerede dokumenteret i [api-contracts.md](api-contracts.md).

## 1. Platformfundament

- **Supabase/PostgreSQL**: V2 gemmer allerede alle moduler i Supabase (`public.documents`, JSONB). Næste skridt er normaliserede tabeller pr. modul og Row Level Security pr. modul/rolle.
- **Auth og roller**: Supabase Auth med rollerne `sælger`, `producer`, `leder` og `admin`. Moduladgang styres via modulregistret.
- **Jobkø** til research og AI-generering, så job overlever genstart og kan køre parallelt.
- **Delt rate limiting** og fejlsporing.

## 2. Tilbud → accept

- Statusflow `draft → sent → accepted/rejected` med kundelink og e-signatur.
- Ved accept sendes `quotes.production-intake@1`, og hændelsen `quote.accepted` udsendes.
- Prisregler (pakker, mængderabat) og rigtige priser med godkendelsesflow.

## 3. Produktion & Levering (Modul 3)

- Implementér intake-endepunktet og `ProductionProject`.
- `ProductionFlowTemplate` pr. katalogservice. En AI-receptionist og et CRM-system skal kunne have forskellige faser og opgaver.
- Opgavefordeling mellem mennesker og AI-agenter (`assignee.kind`), QA-tjeklister, kundegodkendelse, deployment-log og overvågning (`Deliverable.monitoring`).
- Modtag også intake fra CRM (`sentBy: "crm"`).

## 4. CRM (Modul 4)

**Gennemført i V3 etape 3** — se [crm.md](crm.md). Tilbage:

- Echo-opgaver (`crm.follow_up_draft`, `crm.meeting_prep`, …) skal implementeres, når adgangskontrol er på plads.
- Normaliserede CRM-tabeller med RLS, når flere brugere eller større volumen kommer (forslag i crm.md).

## 5. Dashboard (Modul 5)

**Gennemført i V3 etape 4**, se [dashboard.md](dashboard.md). Tilbage:

- Fakturering og betalinger (kilde for niveau 4–5).
- Annulleringsdato på aftaler, så churn kan beregnes.

## 6. Research

- Rendering af JavaScript-tunge hjemmesider (headless browser) — V2 analyserer kun server-leveret HTML.
- Normaliserede tabeller for brands/relationer i Postgres (V2 gemmer dokumenter som JSONB).
- Flere kilder via officielle API'er: nyheds-API, jobportaler med API-adgang, Trustpilot Business API og regnskabsdata (Erhvervsstyrelsens regnskaber).
- Brug Claudes web search-værktøj som alternativ søgeudbyder, med samme kildevalidering.
- Gentagen research og sammenligning over tid. Feedback-loop på anbefalinger (valgt/fravalgt) til kalibrering af branchefit.

## 7. Udskillelse

Når belastning eller team-struktur kræver det, udskilles Research og Produktion som separate tjenester. Kontrakterne og HTTP-endepunkterne findes allerede. In-process-kald i orkestreringen erstattes af HTTP.
