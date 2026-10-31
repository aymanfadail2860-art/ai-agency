# API-kontrakter

Alle kontrakter er Zod-skemaer i `packages/core/src/contracts.ts`. Navngivning: `<afsender>.<formål>@<version>`. Brydende ændringer kræver en ny version.

Fejlsvar fra alle endepunkter har formen:

```json
{ "error": { "code": "validation_error", "message": "Dansk, brugervendt besked" } }
```

Koder: `validation_error` (400), `blocked_url` (400), `unauthorized` (401, ugyldig callback-nøgle), `forbidden` (403, anden oprindelse), `not_found` (404), `upstream_not_found` (404), `conflict` (409), `mode_mismatch` (409), `rate_limited` (429), `not_implemented` (501), `integration_error` (502), `integration_not_configured` (503), `timeout` (504), `internal_error` (500).

---

## 1a. `research.quote-handoff@2`: AKTIV (V2)

Brand-first: tilbud kan oprettes uden CVR. `legalEntity` er kun sat, når præcis én relation er bekræftet.

```ts
{
  contract: "research.quote-handoff", version: 2, handoffId: "hnd_…", createdAt, mode,
  brand: { brandId: "brd_…", name, website: "… | null" },
  legalEntity: { companyId, cvr, name, address } | null,
  researchReportId: "rrep_…", researchSummary, overallRecommendation,
  opportunities: [{ title, observed, potentialProblem, solution }],   // max 12
  services: [{ …v1-felter, proposedSolution: "… | null", customerQuestions: ["…"] }],  // min. 1
  userNotes
}
```

`POST /api/quotes/intake` accepterer både v1 og v2 (diskrimineret på `version`).

## 1b. `research.quote-handoff@1`: AKTIV (understøttes fortsat)

**Research → Tilbud.** Overfører kundeidentitet, researchresumé, valgte services, begrundelser og brugerbemærkninger. Ingen genindtastning.

Endepunkt (offentlig intake): `POST /api/quotes/intake` → `201 { quoteId, quoteNumber, versionId }`. Idempotent pr. `handoffId`.

```ts
{
  contract: "research.quote-handoff",
  version: 1,
  handoffId: "hnd_…",
  createdAt: "2026-10-28T12:00:00.000Z",
  mode: "demo" | "live",
  company: { companyId: "cmp_…", cvr: "12345678", name: "…", address: "… | null" },
  researchReportId: "rrep_…",
  researchSummary: "…",
  services: [                         // min. 1
    {
      recommendationId: "rec_…",
      catalogItemId: "svc_ai_receptionist",
      serviceName: "AI-receptionist",
      description: "…",               // brugerens redigerede tekst, ellers katalogbeskrivelse
      rationale: "…",                 // hvorfor relevant (fra research)
      keyFindings: ["…"],             // max 10, kun fakta/vurderinger
      priority: "high" | "medium" | "low",
      complexity: "low" | "medium" | "high",
      score: 0-100,
      note: "… | null"
    }
  ],
  userNotes: "…"
}
```

Orkestrering i UI: `POST /api/research/reports/:id/handoff`. Research bygger kontrakten, Tilbud modtager den via intake, og Research registrerer overførslen.

---

## 2. `quotes.production-intake@2` og `@1`: AKTIV (V3, etape 2)

V2 er brand-first og tillader tilbud uden CVR: `company` erstattes af `customer: { brandId | null, legalEntity: CompanyRef | null, name }`. Resten er som v1 nedenfor. Endpoint: `POST /api/production/intake` → `201 { projectId, created: true }` / `200` ved gentagelse (idempotent pr. `intakeId`). Tilbud bygger kontrakten med `buildProductionIntake(quote)` ved kundens accept (`POST /api/quotes/:id/accept`). Se [production.md](production.md).

### v1 (oprindelig specifikation)

**Tilbud → Produktion & Levering** (og senere **CRM → Produktion**, fx ved genkøb). Sendes, når et tilbud accepteres. Produktion opretter et `ProductionProject` og vælger et produktionsflow pr. service (`ProductionFlowTemplate` i `@agency/production`).

Endepunkt: `POST /api/production/intake`. Svarer **501** i V1.

```ts
{
  contract: "quotes.production-intake",
  version: 1,
  intakeId: "…",
  sentBy: "quotes" | "crm",
  acceptedAt: "ISO-8601",
  mode: "demo" | "live",
  company: { companyId, cvr, name },
  quote: { quoteId: "qte_…", quoteNumber, versionId: "qver_…", versionNumber },
  lineItems: QuoteLineItem[],         // min. 1 — de accepterede services med leverancer og tidsestimat
  totals: { implementationExclVat, monthlyExclVat, firstYearExclVat },
  specialTerms: "…",
  requestedStartDate: "YYYY-MM-DD | null"
}
```

Svar: `201 { projectId: "prj_…", created: true }`.

---

## 3a. `crm.quote-request@1`: AKTIV (V3, etape 3)

**CRM → Tilbud.** En salgsmulighed bliver til et forudfyldt tilbudsudkast. Endepunkt:
`POST /api/crm/opportunities/:id/quote` (komposition i `apps/web/lib/crm.ts`) →
`intakeFromCrmRequest` i Tilbud. Idempotent pr. `requestId`, som gemmes i tilbuddets
`handoffId`. Et eksisterende, ikke-afvist tilbud genbruges.

```ts
{
  contract: "crm.quote-request", version: 1,
  requestId: "crq_…",             // demo: "crq_demo_<run>_…"
  createdAt: "ISO-8601", mode: "demo" | "live",
  brand: { brandId, name, website },
  legalEntity: { companyId, cvr, name, address } | null,   // kun ved én bekræftet relation
  opportunity: { opportunityId: "sop_…", title },
  services: [{ catalogItemId, note }],                     // 1-10, skal findes i kataloget
  researchReportId: "rrep_…" | null,
  researchSummary, overallRecommendation, notes
}
```

Svar: `{ quoteId, quoteNumber, created }`. Statusændringer går den anden vej via
`POST /api/quotes/:id/status` (`sent` | `rejected`) og accept. Reglerne for, hvordan
salgsmuligheden følger med, står i [crm.md](crm.md#integrationer).

## 3b. `crm.activity-sync@1`: PLANLAGT (ikke i brug)

Oprindeligt tænkt som hændelsesbaseret aktivitetssynk fra Research/Tilbud. I V3.3 læser
CRM i stedet rapporter, tilbud og projekter direkte via brandet (ingen kopier), og
tilbudsstatus synkroniseres ved ændringen. `POST /api/crm/activities` er nu CRM's egen
aktivitets-API (valideret, `400` ved ugyldige data). Alle CRM-endepunkter står i
[crm.md](crm.md#api).

---

## 4. `dashboard.metric-datapoint@1`: PLANLAGT

**Alle moduler → Dashboard.** Endepunkt: `POST /api/dashboard/metrics` (501 i V1).

```ts
{
  contract: "dashboard.metric-datapoint", version: 1,
  metricKey: "mrr" | "leads_count" | …,
  source: "research" | "quotes" | "production" | "crm",
  value: number, unit: "count" | "dkk" | "percent" | "days",
  periodStart: "ISO-8601", periodEnd: "ISO-8601",
  mode: "demo" | "live"
}
```

---

## Øvrige endepunkter (V1)

| Metode | Sti | Beskrivelse |
|---|---|---|
| GET/PUT | `/api/settings` | Platformtilstand `{ mode }` |
| GET | `/api/integrations/status` | Status for CVR, AI, søgning og webhentning (uden nøgler) |
| POST | `/api/research/discover` | `{ type: "cvr"\|"url", value }` → brand-, CVR-, P-nummer- og hjemmesidefund (rate limit 20/min) |
| GET/POST | `/api/research/brands` | Liste / opret brand `{ type, name, websiteUrl?, legalEntityId?, suggestedLegalEntityIds? }` (genbruger samme domæne) |
| GET | `/api/research/brands/:id` | Brand, hjemmesider, relationer, P-numre, rapporter |
| POST | `/api/research/brands/:id/relations` | `{ cvr }` → foreslået relation (verificeres via CVR) |
| PATCH | `/api/research/brands/:id/relations/:relationId` | `{ decision: "confirmed"\|"rejected" }` |
| GET | `/api/research/companies?mode=` | V1-kompatibel: lister nu brands |
| POST | `/api/research/companies/lookup` | `{ cvr }` → Company (Live, rate limit 20/min) |
| POST | `/api/research/companies/demo` | `{ key }` → fiktiv Company |
| POST | `/api/research/jobs` | `{ brandId, websiteUrl?, policy? }` (eller V1 `{ companyId }`) → 202 ResearchJob + `aiJob { id, status, engine, policy, fallback, explanation }`. Kører via Job Center. 409 hvis routeren blokerer (fx `CLAUDE_API_ONLY` uden nøgle eller deaktiveret agent) |
| POST | `/api/research/brands/:id/deep-research` | `{ focus? }` → 202 AiJob (`research.deep_research` via Claude Code-rutine; `blocked` med begrundelse, hvis den ikke er tilgængelig) |
| GET | `/api/research/jobs/:id` | Jobstatus med trin |
| GET/PATCH | `/api/research/reports/:id` | Rapport; PATCH `{ notes?, status?, recommendations?: [{ id, selected?, editedDescription?, note? }] }` |
| POST | `/api/research/reports/:id/handoff` | Opretter tilbud via kontrakt 1 |
| GET | `/api/quotes?mode=` | Tilbud med totaler |
| GET/PUT | `/api/quotes/:id` | PUT `{ versionId, patch }` gemmer udkast af aktuel version |
| POST | `/api/quotes/:id/versions` | Ny version (forrige låses) |
| POST | `/api/quotes/:id/generate` | `{ versionId }`: tilbudstekst (Claude/skabelon) |
| GET | `/api/quotes/:id/pdf?version=` | PDF-download |
| GET | `/api/catalog` | Servicekatalog med aktuelle demopriser |
| PUT/DELETE | `/api/catalog/:id` | Redigér eller nulstil pris, beskrivelse og leverancer |

## AOS og fælles AI-infrastruktur (V3)

| Metode | Sti | Beskrivelse |
|---|---|---|
| GET | `/api/aos/overview` | Command Center-tal + agentstatus (polles af Agent Office) |
| GET | `/api/aos/jobs?status=&module=&agentId=&brandId=&taskType=` | Job Center for aktuel tilstand |
| GET | `/api/aos/jobs/:id` | Job med routing, tidslinje, resultat og omkostning (uden callback-hash) |
| POST | `/api/aos/jobs/:id/cancel` | Annullér. Claude Code-sessioner stoppes ikke automatisk (vises tydeligt) |
| POST | `/api/aos/jobs/:id/retry` | `{ confirmPossibleDuplicate? }`. Ny routing, maks. 3 forsøg |
| POST | `/api/aos/jobs/:id/callback` | Tilbagemelding fra Claude Code-session. `Authorization: Bearer <engangsnøgle>` |
| GET | `/api/aos/activity?since=` | Live Activity (registrerede hændelser) |
| GET | `/api/aos/agents` · `/api/aos/agents/:id` | Agenter med status · agent + versioner |
| PATCH | `/api/aos/agents/:id` | `{ enabled }` |
| POST | `/api/aos/agents/:id/versions` | Ny version (valideret). Afventer godkendelse |
| GET · POST | `/api/aos/approvals` · `/api/aos/approvals/:id` | Liste · `{ decision: "approved"\|"rejected", note? }` |
| GET · POST | `/api/aos/integrations` · `/api/aos/integrations/:key/test` | Integration Manager · omkostningsfri test |

### Callback-protokol `ai-agency.routine-job@1`

Fire-teksten til rutinen er JSON: `{ protocol, jobId, taskType, title, agent, agentVersion, callback: { url, token, expiresAt }, input }`. Sessionen svarer:

```ts
{ type: "progress", kind: "step" | "tool_call" | "file" | "test", message }          // 0..n
{ type: "result", status: "succeeded", summary, data, artifacts?: [{ kind, label, url }] }
{ type: "result", status: "failed", error: { message } }
```

`data` valideres mod opgavetypens skema. For `research.deep_research`: `DeepResearchResultSchema` i `packages/research/src/deep-research.ts`. Fuld beskrivelse i [routines/ai-agency-job.md](../routines/ai-agency-job.md).
