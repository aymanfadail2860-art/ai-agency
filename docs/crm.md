# CRM — internt salgs- og kundestyringssystem (V3, etape 3)

CRM er bureauets egen salgs- og kundestyring: leads, virksomheder, kontaktpersoner,
salgspipeline, aktiviteter og en 360-graders kundeprofil, der samler Research, Tilbud,
Produktion og AOS. CRM er internt. Kunderne har ikke adgang.

## Sider

| Route | Indhold |
|---|---|
| `/crm` | Overblik: 11 klikbare KPI'er, periodefilter (7/30/90 dage eller hele perioden), søgning, separate pipelinekort for engangsomsætning og MRR, kommende og forsinkede aktiviteter, seneste salgsaktiviteter og den guidede demo (kun i Demo Mode) |
| `/crm/companies` | Virksomheder: søgning (navn, CVR, hjemmeside, branche, tag), filtre for status, kilde og tag, oprettelse uden dubletter og import af eksisterende kunder fra Research, Tilbud og Produktion |
| `/crm/companies/:id` | 360-profil med fanerne Overblik, Research, Salgsmuligheder, Tilbud, Projekter, Aktiviteter, Økonomi og Dokumenter (`?tab=`) |
| `/crm/pipeline` | Kanban med 10 stadier, træk-og-slip, flyt via menu (tilgængelighed), filtre for søgning, ansvarlig og status. Vundet og tabt kræver bekræftelse |
| `/crm/activities` | Alle aktiviteter som liste eller tidslinje med visningerne alle, planlagte, forsinkede, næste 7 dage og udførte, samt filter på type (`?view=`, `?kind=`) |

KPI'erne linker til filtrerede visninger, fx *Forsinkede aktiviteter* → `/crm/activities?view=overdue`
og *Tabte aftaler* → `/crm/pipeline?status=lost`.

## Datamodel (`@agency/crm`)

| Entitet | Id | Indhold |
|---|---|---|
| Virksomhed (`CrmAccount`) | `acc_<brand-suffix>` | brandId, navn, CVR (valgfrit, 8 cifre), hjemmeside, branche, adresse, telefon, e-mail, størrelse, leadkilde, leadstatus med historik, ansvarlig, noter, tags, tilknyttede rapporter, dokumentlinks, `isDemo` |
| Kontaktperson (`Contact`) | `con_…` | navn, titel, e-mail, telefon, primær (højst én), markedsføringssamtykke, noter |
| Salgsmulighed (`Opportunity`) | `sop_…` | kunde, titel, services (katalog-id'er), **implementeringsværdi og månedlig værdi hver for sig**, forventet lukning, sandsynlighed, ansvarlig, stadie, status (åben/vundet/tabt), tabsårsag, referencer til rapport, tilbud og projekt, historik |
| Aktivitet (`Activity`) | `act_…` | type (opkald, e-mail, møde, opgave, opfølgning, note, påmindelse), tilknyttet virksomhed og evt. kontakt og salgsmulighed, tidspunkt, ansvarlig, prioritet, status, beskrivelse, resultat, næste skridt |

Stadier og standardsandsynlighed: Nyt lead (5 %), Research (10 %), Kontaktet (15 %),
Kvalificeret (25 %), Møde booket (35 %), Behov afdækket (50 %), Tilbud sendt (65 %),
Forhandling (80 %), Vundet (100 %), Tabt (0 %).

**Seneste kontakt** og **næste opfølgning** beregnes fra aktiviteterne og gemmes ikke
separat, så de aldrig kan blive forældede.

### Ingen dubletter

- En CRM-virksomhed *er* et brand i platformens fælles kundeidentitet. Virksomhedens id
  afledes af brand-id'et (`acc_<suffix>`), så der kan kun findes én virksomhed pr. brand.
- Brand-id'er er deterministiske (`brd_<sha256(tilstand:domæne)>` eller, uden hjemmeside,
  `brd_<sha256(tilstand:navn)>`). Samtidige oprettelser af samme kunde giver derfor samme
  brand og samme virksomhed. Det er testet med parallelle kald.
- Kontaktpersoner dedupliceres på e-mail eller, uden e-mail, på navn.
- Oprettes en virksomhed, der allerede findes, åbnes den eksisterende profil med en
  besked (`?existing=1`).

### Ingen kopier af tilbud og projekter

360-profilen (`apps/web/lib/crm.ts → getAccount360`) læser rapporter, tilbud, projekter,
filer, økonomi og Echo-jobs fra deres egne moduler via brandet. CRM gemmer kun referencer
(`reportId`, `quoteId`, `projectId`).

## Integrationer

| Retning | Hvordan |
|---|---|
| **Research → CRM** | Rapportsiden har et CRM-panel: *Opret lead*, *Opret lead og start salgsmulighed* med de anbefalede services, og *Knyt rapporten til en anden virksomhed*. `POST /api/crm/from-report`. Profilens Research-fane viser rapporter og anbefalinger og kan starte en salgsmulighed |
| **CRM → Tilbud** | *Opret tilbud* på en salgsmulighed sender kontrakten `crm.quote-request@1` til Tilbud. Udkastet forudfyldes med kunde, bekræftet juridisk enhed, services og researchopsummering. Idempotent pr. `requestId`: et eksisterende, ikke-afvist tilbud genbruges |
| **Tilbud → CRM** | `sent` flytter salgsmuligheden til *Tilbud sendt* (kun fremad). `accepted` markerer den *Vundet*. `rejected` noteres i historikken uden automatisk tab. **Et tilbud, der oprettes eller sendes, vinder aldrig aftalen.** Status ændres via `POST /api/quotes/:id/status` (sendt eller afvist) eller ved accept |
| **Tilbud → Produktion** | Uændret (`quotes.production-intake@2`, idempotent pr. tilbud). *Vundet* med tilbud accepterer tilbuddet og bruger samme vej, så der aldrig opstår dubletprojekter. Projektet knyttes til salgsmuligheden, og virksomheden bliver *Aktiv kunde* |
| **Produktion → CRM** | Profilens Projekter-fane viser fase, leverancer, afventende godkendelser, blokeringer og drift. Økonomi-fanen viser registrerede omkostninger og AI-forbrug. Projektsiden linker tilbage til kundeprofilen |
| **CRM → AOS** | Echo er primær CRM-specialist (agentdefinition v2). Fem opgavetyper er registreret: `crm.lead_qualification`, `crm.follow_up_draft`, `crm.meeting_prep`, `crm.sales_analysis` og `crm.upsell_identification`. De er markeret **Afventer implementering**. Bestilles de, oprettes et job i Job Center, som routeren blokerer med en ærlig begrundelse. Der bruges ingen betalt AI |

Regler, der håndhæves server-side (`packages/crm/src/server/service.ts`):

- *Vundet* sætter ikke i sig selv kundestatus. Det sker, når aftalen overføres til
  Produktion, eller ved manuel sejr uden tilbud.
- *Tabt* kræver en begrundelse.
- En salgsmulighed kan ikke oprettes som vundet eller tabt.
- Aktivitetens kontakt og salgsmulighed skal tilhøre samme virksomhed.
- Alle input valideres med Zod.

## Guidet demo (12 trin)

Kun i Demo Mode (`/crm`). Hvert trin kalder platformens rigtige funktioner på fiktive data
om *Bryggeriet Nordlys* (`bryggeriet-nordlys.example`):

1. Lead.
2. Brandresearch via Job Center (Scout, demodata).
3. Kontaktperson.
4. Første opkald (logget).
5. Møde planlagt.
6. Behov afdækket og lead kvalificeret.
7. Salgsmulighed fra anbefalingerne.
8. Tilbud via `crm.quote-request@1`, markeret som sendt.
9. Kundens accept, som vinder aftalen.
10. Projekt via `quotes.production-intake`.
11. Aktiv kunde med velkomstopkald.
12. Opfølgning og mersalg.

Alt er markeret **DEMO**. Der sendes ingen e-mails, foretages ingen opkald, og der startes
ingen betalte AI-opgaver. *Nulstil demo* sletter kun demoens egne poster: virksomheden med
kontakter, aktiviteter og salgsmuligheder, demotilbuddet (`handoffId` starter med
`crq_demo`) og demoprojektet. Derefter kan demoen køres forfra.

Demoen deler brand med Research-demoens *Bryggeriet Nordlys* for at genbruge
researchdataene. Er dette brand allerede gjort til en almindelig CRM-virksomhed (fx fra
Research), stopper demoen med en forklaring i stedet for at ændre de eksisterende data.

## API

| Metode og sti | Formål |
|---|---|
| `GET/POST /api/crm/accounts` | Liste og oprettelse (idempotent pr. brand) |
| `GET/PATCH /api/crm/accounts/:id` | 360-profil og stamdata |
| `POST /api/crm/accounts/:id/contacts`, `PATCH /api/crm/contacts/:id` | Kontaktpersoner |
| `POST /api/crm/accounts/:id/documents` | Dokumentlink (kun http/https) |
| `POST /api/crm/accounts/:id/ai-tasks` | Echo-opgave i Job Center (planlagt og blokeret) |
| `GET/POST /api/crm/opportunities`, `PATCH /api/crm/opportunities/:id` | Salgsmuligheder |
| `POST /api/crm/opportunities/:id/stage` | Flyt stadie (tabt kræver `lostReason`) |
| `POST /api/crm/opportunities/:id/quote` | CRM → Tilbud (`crm.quote-request@1`) |
| `POST /api/crm/opportunities/:id/win` | Vundet: accept → Produktion (idempotent) eller manuel sejr |
| `GET/POST /api/crm/activities`, `PATCH /api/crm/activities/:id` | Aktiviteter (`?view=`, `?kind=`, `?accountId=`) |
| `POST /api/crm/from-report` | Research → CRM (`lead`, `opportunity`, `attach`) |
| `GET /api/crm/dashboard?period=` | KPI'er og pipelineværdier |
| `GET/POST /api/crm/demo` | Guidet demo (`step` eller `reset`, kun Demo Mode) |
| `POST /api/quotes/:id/status` | Tilbudsstatus `sent` eller `rejected` → synk til CRM |

Alle skrivende endepunkter er omfattet af platformens rate limit og origin-kontrol.

## Vurdering af datamodellen

CRM bruger platformens generiske dokumentlager (`public.documents`: ét JSONB-dokument pr.
entitet, optimistisk låsning via `rev`) i fem samlinger under modulet `crm`.

**Vurdering: tilstrækkeligt i dag.** Der er én bruger og lav volumen. Deterministiske id'er
og optimistisk låsning forhindrer dubletter og tabte opdateringer. Der var derfor ikke behov
for en databasemigration i denne etape, og eksisterende data er urørt.

**Begrænsninger:** lageret indlæser hele samlinger pr. forespørgsel (filtrering sker i
applikationen), og det har ingen fremmednøgler eller indeks på stadie eller forfaldsdato.

**Forslag, når login og flere brugere kommer, eller volumen vokser (>~5.000 aktiviteter):**
normaliserede tabeller med RLS.

```sql
crm_accounts      (id pk, brand_id unique, mode, status, owner, cvr, … , created_at, updated_at)
crm_contacts      (id pk, account_id fk → crm_accounts, email, is_primary, …)
crm_opportunities (id pk, account_id fk, stage, status, implementation_value numeric,
                   monthly_value numeric, expected_close date, quote_id, project_id, …)
crm_activities    (id pk, account_id fk, contact_id fk null, opportunity_id fk null,
                   kind, status, due_at timestamptz, owner, …)
-- indeks: (mode, stage), (mode, status, due_at), (account_id)
-- unik delvis indeks: én primær kontakt pr. virksomhed
```

Migrationen kan laves uden nedetid ved at kopiere JSONB-dokumenterne én gang og skifte
`CollectionStore`-implementeringen for modulet `crm`. Service-API'et er uændret.

## Sikkerhed og adgang

- **Adgangsrisiko (dokumenteret, ikke løst i denne etape):** platformen har stadig intet
  login. Alle med URL'en kan læse og ændre CRM-data, herunder kontaktpersoners navne,
  e-mails og telefonnumre (persondata). Brug derfor kun demodata eller fiktive kontakter,
  indtil adgangskontrol er indført. Se [v3-architecture.md §8](v3-architecture.md).
- Ingen automatisk ekstern kommunikation: e-mails, opkald og tilbud *registreres* kun.
  Platformen sender intet.
- Ingen nye betalte AI-kald: Echo-opgaverne er planlagte og blokeres af routeren.
- Ingen nøgler i klienten. Dokumentlinks accepterer kun http/https.
- Demo-sletning er begrænset til demo-markerede poster.

## Test

- **Enhedstests** (`packages/crm/test/crm.test.ts`):
  - parallel dedupe pr. domæne og navn;
  - CVR-validering;
  - kontaktdedupe og én primær kontakt;
  - separate værdier;
  - tabsårsag;
  - tilbudssynk-regler;
  - vundet ≠ kunde;
  - aktivitetskobling og -visninger;
  - demo-sletning.
- **E2E** (`tests/e2e/sales-crm.spec.ts`):
  - dashboard-KPI'er;
  - oprettelse uden dubletter;
  - kontakt, stamdata og 360-faner;
  - aktiviteter som liste og tidslinje;
  - CRM → Tilbud → sendt → vundet → ét projekt (idempotens);
  - Kanban-træk og tabt med begrundelse;
  - Research → CRM;
  - Echo-blokering;
  - guidet demo med nulstilling;
  - mobil uden overløb.
