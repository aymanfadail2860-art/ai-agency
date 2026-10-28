# API-kontrakter

Alle kontrakter er Zod-skemaer i `packages/core/src/contracts.ts`. Navngivning: `<afsender>.<formål>@<version>`. Brydende ændringer kræver en ny version.

Fejlsvar fra alle endepunkter har formen:

```json
{ "error": { "code": "validation_error", "message": "Dansk, brugervendt besked" } }
```

Koder: `validation_error` (400), `blocked_url` (400), `forbidden` (403, anden oprindelse), `not_found` (404), `upstream_not_found` (404), `conflict` (409), `mode_mismatch` (409), `rate_limited` (429), `not_implemented` (501), `integration_error` (502), `integration_not_configured` (503), `timeout` (504), `internal_error` (500).

---

## 1. `research.quote-handoff@1`: AKTIV

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

## 2. `quotes.production-intake@1`: PLANLAGT (ikke implementeret)

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

Forventet svar (fremtid): `201 { projectId: "prj_…", flowTemplateIds: [...] }`.

---

## 3. `crm.activity-sync@1`: PLANLAGT

**Research/Tilbud → CRM.** Registrerer salgsaktiviteter på kunden. Endepunkt: `POST /api/crm/activities` (501 i V1).

```ts
{
  contract: "crm.activity-sync", version: 1,
  company: { companyId, cvr, name },
  activity:
    | { type: "research_completed", reportId, at }
    | { type: "quote_created", quoteId, at }
    | { type: "quote_version_created", quoteId, versionNumber, at }
    | { type: "quote_accepted", quoteId, at }
}
```

Kan genereres direkte fra platformens hændelseslog (`research.completed`, `quote.created`, `quote.version.created`).

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
| GET | `/api/research/companies?mode=` | Virksomheder med seneste job og rapport |
| POST | `/api/research/companies/lookup` | `{ cvr }` → Company (Live, rate limit 20/min) |
| POST | `/api/research/companies/demo` | `{ key }` → fiktiv Company |
| POST | `/api/research/jobs` | `{ companyId, websiteUrl? }` → 202 ResearchJob (rate limit 10/min) |
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
