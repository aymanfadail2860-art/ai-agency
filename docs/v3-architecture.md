# V3-arkitektur — hybrid AI-motor, fælles orchestrator og AOS

AI Agency er en **intern arbejdsplatform** for bureauet, ikke en SaaS. Den er optimeret
til én primær bruger nu, men forberedt til flere interne medarbejdere senere.

## 1. Udgangspunkt (verificeret 31.10.2026)

| Område | Status |
|---|---|
| Repository | `aymanfadail2860-art/ai-agency`, gren `claude/jolly-einstein-bcxjwi`, `44f9625` = seneste deploy |
| Vercel | Projekt `ai-agency` (team skrotnu). Production READY. Miljø: `SUPABASE_URL`, `SUPABASE_SECRET_KEY` (Sensitive, kun Production), `PLATFORM_DEFAULT_MODE` |
| Supabase | Projekt `ai-agency`. `public.documents` (JSONB, RLS) og `private.config`. To migrationer anvendt |
| Moduler | Research og Tilbud aktive (V2). Produktion, CRM og Dashboard er pladsholdere |
| AI | Claude API-adapter (structured outputs, budget, modelverifikation) — ikke konfigureret i produktion |
| Tests | 88 enhedstests, 7 e2e og live-spec (før V3) |

Teknisk gæld, der blev identificeret:

- Ingen adgangskontrol. Platformen er åben, hvilket er acceptabelt i Demo Mode, men ikke
  med betalte motorer (se §8).
- Lagring som JSONB-dokumenter med fuld læsning pr. samling. Det er fint i den nuværende
  skala; normaliserede tabeller kommer senere.
- Research-jobs køres i `after()` uden en egentlig jobkø.

## 2. Hvad der genbruges, og hvad der er nyt

| Genbrugt uændret | Nyt i V3 |
|---|---|
| `CollectionStore` + Supabase-backend | `@agency/orchestrator`: Job Center, Execution Router, Agent Manager, Approval Manager, Cost ledger, Integration Manager |
| Claude API-adapter, budgetter (`usage.ts`) | `@agency/aos`: modul 6 med Command Center, Agent Office, Library, Jobs, Activity, Godkendelser, Performance og Integrationer |
| Research-pipeline (V2) | `ResearchObserver`, så Job Center kan følge trin, omkostninger og resultat |
| Hændelseslog | Claude Code-adapter (`integrations/claude-code/routines.ts`) + callback-protokol |
| Tilbud (V2) | Agentdefinitioner i GitHub (`agent-definitions.ts`) og rutineprotokol (`routines/ai-agency-job.md`) |

## 3. Komponenter

```text
            Research   Tilbud   Produktion   CRM   Dashboard   AOS (UI)
                \         |         |         |        |        /
                 ──────── apps/web: kompositionslag (lib/orchestrator.ts) ────────
                                          │ submitJob(taskType, input, policy)
                          ┌───────────────┴────────────────┐
                          │       @agency/orchestrator      │
                          │  Job Center · Router · Agenter  │
                          │  Godkendelser · Omkostninger    │
                          └──┬────────────┬─────────────┬───┘
                     internal│   claude_api│  claude_code│ (fire + callback)
                  (executor) │  (executor) │             ▼
                             ▼             ▼     Claude Code-rutine (abonnement)
                        modulets kode   Claude API      │ POST /api/aos/jobs/:id/callback
                                                        ▼
                                                Supabase (alle data)
```

- **Moduler kender ikke orchestratoren og omvendt.** Kompositionslaget registrerer en
  *executor* pr. opgavetype og et *resultatskema* for eksterne motorer.
- **Opgavetyper** (`task-types.ts`) erklærer motorer, AI-behov, interaktivitet,
  omkostningsestimat og kritiske bivirkninger.
- **Routeren** (`router.ts`) er en ren, regelbaseret funktion med læsbar begrundelse.
  Politikker: `AUTO`, `CLAUDE_CODE_PREFERRED`, `CLAUDE_API_PREFERRED`,
  `CLAUDE_CODE_ONLY`, `CLAUDE_API_ONLY` og `NO_AI`. Reglerne i rækkefølge:
  1. Deaktiveret agent → blokeret.
  2. Demo Mode → kun intern software.
  3. Politikkens rækkefølge (interaktive opgaver foretrækker API'en for hastighed;
     baggrundsopgaver foretrækker Claude Code på abonnement).
  4. En motor afvises, hvis den ikke er implementeret, mangler konfiguration eller
     ligger over budget.
  5. Godkendelse kræves ved kritiske bivirkninger eller API-estimat over
     `AI_APPROVAL_THRESHOLD_USD`.

  `*_ONLY` har aldrig en stille fallback.
- **Job Center**: status, tidslinje (kun registrerede hændelser), resultat, fejl,
  genforsøg (højst 3), tidsforbrug, omkostning og afhængigheder (`dependsOn`, der frigives
  ved fuldførelse). Idempotensnøgle pr. åben opgave.
- **Agent Manager**: 8 agenter (Atlas, Scout, Nova, Forge, Vega, Link, Echo, Pulse).
  Grundversioner ligger i GitHub. Ændringer bliver nye, uforanderlige versioner, der først
  aktiveres efter godkendelse. Status udledes kun af job.
- **Approval Manager**: kategorierne agentændring, betalt handling, produktion, deployment,
  kundesystem, massehandling, destruktiv database og kundekommunikation.
- **Cost Manager**: pr. job registreres tokens, API-USD, søgninger, eksterne
  omkostninger og antal Claude Code-kørsler. Abonnementsforbrug vises separat og uden
  USD. Der er daglige lofter pr. udbyder.
- **Integration Manager**: én liste med tilstand, påkrævede miljøvariabler (kun navne) og
  omkostningsfri forbindelsestest. ElevenLabs, n8n, Lovable, Higgsfield, Sentry og Resend
  (prioriteret) samt Obsidian, Twilio, Firecrawl, Apify, PostHog og Figma (valgfrie) er
  registreret som *planlagte* uden funktionalitet. Vercel Sandbox indgår ikke.

## 4. Data

Alle nye entiteter gemmes i den eksisterende `public.documents` under modulnavnet `aos`.
Ingen migration var nødvendig, og ingen eksisterende data blev ændret:

| Samling | Indhold |
|---|---|
| `aos/ai-jobs` | `AiJob` (routing, tidslinje, resultat, omkostning, callback-hash) |
| `aos/agents`, `aos/agent-versions` | Agenter og versioner (deterministiske id'er `agt_<key>`, `agv_<key>_v<n>`) |
| `aos/approvals` | Godkendelser |
| `aos/integration-probes` | Seneste omkostningsfri Supabase-test |
| `platform/api-usage` | Daglige forbrug, nu også `claude_code_runs` |

Senere skal entiteterne flyttes til normaliserede tabeller (`ai_jobs`, `agent_versions`,
`approvals`) med indeks på mode/status/agent, når datamængden kræver det. Det sker
additivt via en ny migration.

## 5. Research som første gennemgående test

Når research startes, opretter `POST /api/research/jobs` jobbet
`research.brand_analysis`. Routeren vælger Claude API, hvis nøglen er sat og budgettet
rækker; ellers bruges intern, regelbaseret software, og grunden står i rapporten.
Pipelinen melder hvert trin til Job Center, rapporten vises i Research, og aktiviteten
vises i AOS. Dyb research (`research.deep_research`) kører kun via Claude Code-rutinen og
vises på brandsiden.

## 6. Omkostninger — minimal API uden kvalitetstab

- Routeren bruger aldrig AI til at vælge motor.
- Baggrundsopgaver foretrækker Claude Code på abonnement. Interaktive opgaver bruger API'en,
  når hastighed er vigtig.
- Lofter: `AI_DAILY_BUDGET_USD`, `CLAUDE_CODE_DAILY_LIMIT`, `SEARCH_DAILY_LIMIT`,
  `RESEARCH_DAILY_LIMIT` og `CVR_DAILY_LIMIT`. API-job over `AI_APPROVAL_THRESHOLD_USD`
  kræver godkendelse.
- Omkostninger registreres pr. job, kunde, modul og motor.

## 7. Overgang til virksomhedskonto

Intet permanent er bundet til den personlige konto:

- Agentdefinitioner og rutineprotokollen ligger i GitHub.
- Alle data ligger i Supabase.
- Credentials ligger kun i Vercels miljøvariabler (`ANTHROPIC_API_KEY` og
  `CLAUDE_CODE_ROUTINE_<SLOT>_ID/_TOKEN`).

Ved skiftet oprettes rutinerne på virksomhedskontoen, og variablerne udskiftes. Kode og
data er uændrede.

## 8. Beslutning, der kræver din godkendelse: adgangsbeskyttelse

Platformen er i dag åben uden login. Det var et bevidst valg i V1/V2 (kun Demo Mode).
Så snart `ANTHROPIC_API_KEY` eller et rutine-token tilføjes, kan alle med linket bruge
API-budgettet og abonnementet. Lofterne begrænser skaden, men forhindrer ikke misbrug.

| Mulighed | Fordele | Ulemper |
|---|---|---|
| **A. Supabase Auth med én tilladt e-mail (anbefalet)** | Rigtig login, klar til flere medarbejdere, roller senere | Lidt udvikling (1 etape) |
| B. Vercel Deployment Protection | Ingen kode | Afhænger af Vercel-plan og -konto; beskytter ikke API-kald fra scripts på samme måde |
| C. Fortsæt åbent, kun Demo Mode | Ingen ændring | AI-motorerne kan ikke tages i brug |

**Anbefaling:** A, før de betalte nøgler tilføjes. Indtil da forbliver motorerne inaktive,
fordi der ikke findes credentials.

## 9. Næste etaper

1. Adgangskontrol (efter din beslutning).
2. Live-test af Claude API og Claude Code-rutinen med rigtige credentials.
3. Tilbud via Job Center: `quotes.proposal_text` med Nova. Priser forbliver deterministiske.
4. ~~Produktion & Levering~~ **Gennemført i etape 2** ([production.md](production.md)): projekter,
   faser med porte i AOS, agenttilknytning og Job Center-integration. Næste: implementér
   `production.agent_task` (rutine-slot + resultatformat), så Forge/Link/Vega kan udføre
   opgaver i Live Mode.
5. CRM og Dashboard på de samme jobs, hændelser og omkostningsdata.
6. Normaliserede tabeller og en egentlig jobkø, når belastningen kræver det.
