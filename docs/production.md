# Produktion & Levering (modul 3) — V3, etape 2

Bureauets produktionssystem: fra accepteret tilbud til leveret og vedligeholdt AI-løsning.
Modulet har **intet eget agentsystem**. Agenter, agentjob, godkendelser og
AI-omkostninger kommer fra AOS:

| Behov | Bruger |
|---|---|
| Agenter på projekter | AOS Agent Manager (`agt_*`, versionerede) |
| Agentopgaver | AOS Job Center (`production.agent_task`) via Execution Router |
| Faseporte | AOS Approval Manager (`subject.ref = { module: "production", action: "phase_gate" }`) |
| AI-omkostninger pr. projekt | Job Center-job med `subject.projectId` |
| Aktivitet | Projektets egen tidslinje + AOS Live Activity for rigtige job |

## Funktioner

- **Dashboard** (`/production`):
  - Nøgletal for aktive projekter, planlægning, udvikling, test, afventende godkendelse,
    leverede og forsinkede projekter. Nøgletallene er klikbare filtre.
  - Søgning og filtre for fase og prioritet, med kort- eller tabelvisning.
  - Kommende deadlines, tilknyttede agenter og seneste aktivitet.
- **Projektoprettelse** (`/production/new`):
  - Kunden vælges blandt eksisterende brands (ingen dublerede kundedata) eller
    angives med navn.
  - Servicebase fra Service Factory, leverancer, implementerings- og månedspris (standard
    fra servicekataloget), datoer, prioritet, AOS-agenter med roller og noter.
  - Accepterede tilbud kan overføres direkte.
- **Projektside** (`/production/projects/:id`) med interaktiv faseproces (11 faser) og fanerne
  Overview, Tasks, Agents, Architecture, Files & Deliverables, Testing & QA, Activity og
  Finance.
- **Tilbud → Produktion:**
  - På tilbudssiden registreres "Kunden har accepteret". Tilbuddet sættes til
    `accepted`, og kontrakten `quotes.production-intake@2` opretter projektet.
  - Overførslen er idempotent pr. `intakeId`.
- **Service Factory** (`/production/service-factory`):
  - Otte versionerede grundsystemer: AI-receptionist, AI-chatbot, CRM-system, Workflow
    Automation, AI Customer Support, Lead Generation System, Website/Web Application og
    AI Content Production.
  - Hver base har funktioner, integrationer, tilpasningsmuligheder, stak, version,
    status, repository-referencer og standardteam. Basen giver projektets opgaver,
    testplan, arkitektur og vedligeholdelsesplan.

## Faser og porte

```text
Oprettet → Kravafdækning → Arkitektur og planlægning → Udvikling → Integrationer → Kvalitetssikring
→ Intern godkendelse ─[AOS-godkendelse: production]→ Kundegodkendelse ─[kundens accept registreret
+ AOS-godkendelse: deployment]→ Deployment → Leveret → Vedligeholdelse
```

- En fase kan kun afsluttes, når fasens påkrævede opgaver er udført.
- Overgangene til *Kundegodkendelse* og *Deployment* opretter en godkendelse i AOS.
  Projektet går videre, når den godkendes, og bliver i fasen, hvis den afvises. Begge
  dele logges.
- *Kundegodkendelse* kræver, at kundens godkendelse registreres (hvem og hvornår).

## Demo og live

| | Demo Mode | Live Mode (senere) |
|---|---|---|
| Projekter | Demoportefølje (fiktive kunder) + egne projekter | Rigtige projekter |
| Agentarbejde | "Simulér fase" i guidet demo — markeret *Demo-simulering* | Agentjob via Job Center |
| Agentjob | Routeren blokerer (Demo Mode / opgavetypen er planlagt) | Kræver implementering af `production.agent_task` + rutine/API |
| Faseporte | Rigtige demogodkendelser i AOS | Samme |
| Deployment | Ingen — kun simuleret | Kun efter godkendelse |

Restaurant Nord indlæses med "Indlæs demo" på dashboardet:
1. Demokunden oprettes.
2. Et fiktivt tilbud accepteres og overføres via kontrakten.
3. Projektet beriges med demoscenariet.

Baggrundsporteføljen består af fire fiktive projekter i forskellige faser, heraf ét
bevidst forsinket. "Nulstil demo" afviser åbne demogodkendelser og sletter kun
demoprojekter.

Simuleret arbejde opretter ingen job i Job Center og gør ingen agent "aktiv" i AOS.

## Data (Supabase)

**Ingen nye tabeller eller migrationer.** Alle data gemmes i den eksisterende
`public.documents` (JSONB, RLS) under modulet `production`, ligesom de andre moduler:

| Samling | Indhold |
|---|---|
| `production/projects` | Projekt: kundereference (brand/CVR-id + navn), servicebase, leverancer, priser, datoer, prioritet, status, fase og fasehistorik, AOS-agenter med roller, arkitektur, vedligeholdelse, åben faseport, kundegodkendelse, kilde (tilbud/intake) |
| `production/tasks` | Opgaver pr. fase: ansvarlig agent, prioritet, status, deadline, påkrævet, `aiJobId`, `simulated` |
| `production/tests` | Testcases med resultat, fejl og `simulated` |
| `production/files` | Dokumenter, kodereferencer, rapporter og leverancer (links/referencer) |
| `production/events` | Projektets tidslinje (`simulated` for demo) |
| `production/costs` | Manuelle omkostningsposter (DKK) |
| `production/service-bases` | Service Factory-katalog (indlæst idempotent fra repositoriet) |

Job Center-modellen dubleres ikke. Opgaver refererer til `aiJobId`, og job refererer til
projektet via `subject.projectId`.

## API

| Metode | Sti | Beskrivelse |
|---|---|---|
| GET · POST | `/api/production/projects` | Liste med fremdrift · opret projekt |
| GET · PATCH | `/api/production/projects/:id` | Projekt + opgaver, tests, filer, hændelser, omkostninger og økonomi · opdatér |
| POST | `/api/production/projects/:id/phase` | Næste fase (409 med blokeringer, eller faseport i AOS) |
| POST | `/api/production/projects/:id/customer-approval` | `{ approvedBy, note? }` |
| PUT | `/api/production/projects/:id/agents` | `{ agents: [{ agentId, role }] }` (valideres mod AOS) |
| POST · PATCH | `/api/production/projects/:id/tasks` · `/tasks/:taskId` | Ny opgave · status, ansvarlig, prioritet, deadline |
| POST | `/api/production/projects/:id/tasks/:taskId/job` | Send til AOS' Job Center (ét job pr. opgave) |
| POST · PATCH | `/api/production/projects/:id/tests` · `/tests/:testId` | Ny testcase · registrér resultat/fejl |
| POST | `/api/production/projects/:id/files` · `/costs` | Fil/reference · omkostningspost |
| POST | `/api/production/projects/:id/simulate` | Guidet demo — kun demoprojekter i Demo Mode |
| POST | `/api/production/demo` | `{ reset? }` — indlæs eller nulstil demoporteføljen (kun Demo Mode) |
| POST | `/api/production/intake` | Kontrakt `quotes.production-intake@1/@2` |
| POST | `/api/quotes/:id/accept` | Kundens accept → intake → projekt |
| GET | `/api/production/service-factory` | Servicebaser |
