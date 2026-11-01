# Dashboard — Executive Command Center (V3, etape 4)

Dashboard er bureauets ledelsesoverblik. Det samler salg, pipeline, kunder, aftalt
omsætning, levering, godkendelser, AI-agenter og omkostninger. Det er
handlingsorienteret: Action Center viser, hvad der kræver handling i dag, og alle
nøgletal linker til den filtrerede visning, de bygger på.

## Områder

| Route | Indhold |
|---|---|
| `/dashboard` | **Executive Overview**: aftalt MRR (heltal) og ARR, "Kræver opmærksomhed i dag", 12 klikbare KPI'er, MRR over tid, pipeline pr. fase, nøgletal for levering, AI og konvertering. I Demo Mode også Dashboard Demo Mode og det samlede seks-moduls forløb |
| `/dashboard/sales` | **Sales Intelligence**: leads over tid, vundne og tabte aftaler, pipeline-funnel, forventet lukning (vægtet), pipelineudvikling (engangs og månedlig som to grafer), salg pr. servicekategori, konverteringsrate, gennemsnitlig aftaleværdi og forventet omsætning |
| `/dashboard/finance` | **Financial Intelligence**: de fem økonomiske niveauer, aftalt implementering, MRR, ARR, projekt- og AI-omkostninger, omkostninger pr. kunde, projekt og motor, estimeret dækningsbidrag |
| `/dashboard/delivery` | **Delivery Intelligence**: projekter pr. fase, aktive og forsinkede projekter, afventende godkendelser, leverede projekter, gennemførelsestid, leveringsperformance, arbejdsbelastning, deadlines og agenttilknytninger |
| `/dashboard/ai` | **AI & Agent Intelligence**: job pr. status, agent og motor, gennemførelsestid, API-omkostninger (USD), Claude Code-kørsler (separat), budgetstatus og seneste agentaktivitet |
| `/dashboard/actions` | **Action Center**: alle handlinger fra faste regler, filtrerbare pr. regel. Hver handling åbner kunden, opgaven, godkendelsen eller projektet |

## Globale filtre

Filtrene er én række over indholdet og ligger i URL'en, så de følger med mellem
områderne og kan deles. Serveren validerer dem med zod. Ugyldige værdier falder
tilbage til standard med en synlig besked, og `GET /api/dashboard` svarer `400`.

| Filter | Værdier | Påvirker |
|---|---|---|
| Periode | 7, 30 eller 90 dage, indeværende år, hele perioden, valgfrit interval (højst 3 år) | Flow-målinger og tidsgrafer |
| Kunde | Brand | Alle områder |
| Servicekategori | Kundekontakt, salg og marketing, automatisering, data og software | Salgsmuligheder, tilbud, aftaler og projekter. Leads har ingen kategori |
| Projektstatus | Aktive, forsinkede, på pause, leverede, i drift, annullerede | Levering og projektrelaterede handlinger |
| AI-agent | AOS-agenter | AI-job og projekter med agenten |
| AI-motor | Intern, Claude API, Claude Code, ingen (blokeret) | AI-job og omkostninger pr. motor |

**Flow og beholdning.** Flow-tal (nye leads, vundne aftaler, omkostninger …) tæller
hændelser i perioden. Beholdninger (åben pipeline, aktive kunder, aftalt MRR,
aktive projekter, afventende godkendelser) er status pr. nu. De påvirkes ikke af
perioden og summeres aldrig over tid. Hvert KPI-kort viser, om det er "Pr. nu"
eller "Periode".

## Dataarkitektur

```text
Research · CRM · Tilbud · Produktion · AOS (Job Center, agenter, godkendelser, forbrug)
        │  offentlige server-API'er (læses — intet kopieres)
        ▼
apps/web/lib/dashboard.ts  ── buildSnapshot(mode) → normaliseret øjebliksbillede
        ▼
@agency/dashboard/analytics ── computeDashboard(snapshot, filter): rene, deterministiske funktioner
        ▼
sider (/dashboard/*) og GET /api/dashboard
```

- Dashboard har **ingen egen lagring** og ingen databaseændringer.
- Analytics-laget får "nu" fra øjebliksbilledet. Det kalder aldrig `Date.now()`,
  bruger ingen tilfældighed og ingen AI. Samme input giver samme output (testet).
- Kunder identificeres med brand-id (den fælles kundeidentitet). Projekter uden
  brand får en navnenøgle.
- Kontrakten `dashboard.metric-datapoint@1` (push fra modulerne) blev overflødig.
  Endepunktet svarer fortsat `501`.

### Ingen dobbeltoptælling — aftaler

En kunde kan have flere salgsmuligheder, tilbud og projekter for den samme aftale.
Én aftale tælles derfor præcis én gang, med denne prioritet:

1. **Produktionsprojekt** (ikke annulleret): projektets aftalte priser.
2. **Accepteret tilbud**, som ikke er blevet til et projekt.
3. **Vundet CRM-salgsmulighed** uden tilbud eller projekt, der allerede tælles.

Aftaledato er projektets oprettelse (eller startdato, hvis den er tidligere),
tilbuddets accept eller salgsmulighedens lukning.

## KPI-definitioner

| Nøgletal | Type | Kilde | Regel |
|---|---|---|---|
| Samlet pipelineværdi | Beholdning | CRM | Σ (implementering + 12 × månedlig) for åbne salgsmuligheder. Engangs og månedlig vises også hver for sig |
| Vægtet pipeline | Estimat | CRM | Σ sandsynlighed × beløb |
| Aktive kunder | Beholdning | CRM, Tilbud, Produktion | Unikke brands med CRM-status Aktiv kunde eller mindst én aftale |
| Nye leads | Flow | CRM | Virksomheder oprettet i perioden |
| Vundne / tabte | Flow | CRM | Salgsmuligheder lukket i perioden |
| Konverteringsrate | Flow | CRM | Vundne ÷ (vundne + tabte) lukket i perioden. Vises som "–", hvis ingen er lukket |
| Gennemsnitlig aftaleværdi | Flow | Aftaler | Gennemsnit af aftaler indgået i perioden, implementering og månedlig hver for sig |
| Aftalt MRR | Beholdning | Aftaler | Σ månedlige beløb for ikke-annullerede aftaler. ARR = MRR × 12 |
| MRR-udvikling | Beholdning | Aftaler | MRR ved udgangen af hvert interval. Annulleringer har ingen dato og er udeladt fra hele historikken |
| Pipelineudvikling | Beholdning | CRM | Åben pipeline ved udgangen af hvert interval, rekonstrueret fra oprettelses- og lukkedatoer med aktuelle beløb |
| Salg pr. servicekategori | Flow | Servicekatalog | Beløb fordeles på services, vægtet efter katalogets implementeringspris |
| Forventet omsætning (12 mdr.) | Estimat | Aftaler + CRM | Kontraheret: MRR × 12. Pipeline: Σ sandsynlighed × (implementering + 12 × månedlig). Vises hver for sig |
| Projektomkostninger | Flow | Produktion | Σ registrerede omkostninger (DKK). Demoposter er markeret simulerede |
| AI-omkostninger | Flow | AOS | Σ registreret API-omkostning (USD). Claude Code vises som antal kørsler uden USD-pris. Ingen valutaomregning |
| Estimeret dækningsbidrag | Estimat | Produktion | Kun projekter med registrerede omkostninger: første års værdi − omkostninger (DKK). AI i USD indgår ikke |
| Aktive / forsinkede projekter | Beholdning | Produktion | Aktiv = status aktiv eller pause. Forsinket = Produktions egen regel, som ikke genberegnes her |
| Leveringsperformance | Flow | Produktion | Til tiden = overgang til Leveret senest på leveringsdatoen. Gennemførelsestid = start (eller oprettelse) → Leveret |
| AI-jobs | Flow + beholdning | AOS | Job oprettet i perioden pr. status, agent og motor. Aktive job er en beholdning |

### De fem økonomiske niveauer

| Niveau | Tilgængelig | Bemærkning |
|---|---|---|
| 1. Pipelineværdi | Ja | Åbne salgsmuligheder. Ikke vundet |
| 2. Vundne aftaler | Ja | CRM-salgsmuligheder vundet i perioden |
| 3. Kontraktligt aftalt | Ja | Aftaler (se ovenfor), hver én gang |
| 4. Faktisk faktureret | **Nej** | Ingen faktureringsdata. Vises som "Ikke tilgængelig", aldrig som tal |
| 5. Faktisk modtaget betaling | **Nej** | Ingen betalingsdata. Vises som "Ikke tilgængelig", aldrig som tal |

## Action Center — regler

| Regel | Alvor | Åbner |
|---|---|---|
| Forsinket CRM-opfølgning (planlagt, tidspunktet passeret) | Høj fra 3 dage, ellers middel | Kundens aktiviteter |
| Åben salgsmulighed uden fremtidig aktivitet | Middel | Kundens aktiviteter |
| Forventet lukning passeret | Middel | Kundens salgsmuligheder |
| Forsinket projekt | Høj | Projektet |
| Aktivt projekt uden projektleder | Middel | Projektets agenter |
| Blokerede opgaver | Middel | Projektets opgaver |
| Levering inden for 14 dage | Info | Projektet |
| Afventende godkendelse | Høj fra 2 dage, ellers middel | AOS-godkendelser |
| Fejlet AI-job (seneste 30 dage) | Middel | Jobbet i Job Center |
| Sendt tilbud uden svar i 14 dage | Middel | Tilbuddet |
| Tilbud uden salgsmulighed i CRM | Info | Tilbuddet |

## Grafer

Graferne er egne, lette SVG- og HTML-komponenter (`packages/dashboard/src/components/charts.tsx`).
Der er ingen nye afhængigheder. De følger dataviz-metoden:

- tynde mærker: søjler ≤ 24 px med 4 px afrundet dataende, 2 px linjer, 2 px mellemrum;
- hårfine gitterlinjer og kun én y-akse (engangs og månedlig vises i separate grafer);
- legende ved to eller flere serier;
- hover og tastaturfokus med værdier;
- **"Vis som tabel"** på alle grafer.

Kategoriske farver er i fast rækkefølge (blå, orange, aqua) og valideret med
`validate_palette.js` mod kortfladen. Aqua er under 3:1 på hvid, og derfor har alle
grafer tabelvisning og legende.

## Dashboard Demo Mode

Kun i Demo Mode (`/dashboard`). **Indlæs demo-portefølje** genbruger de eksisterende
demodata. Der laves ingen kopier af kunder eller projekter:

- **Produktion**: demoporteføljen (Klinik Havblik, Studio Fjord, Fjordhuset Events,
  Nordlys VVS) og Restaurant Nord.
- **CRM-lag** (tag `dashboard-demo`, demo-markeret), på de eksisterende brands:
  - en kunde pr. demoprojekt med en vunden aftale knyttet til projektet;
  - et mersalg og en driftsopfølgning;
  - fem prospects i forskellige faser: et nyt lead, et kvalificeret, et med møde
    booket, en forhandling med forsinket opfølgning og et tabt.
- **Simulerede projektomkostninger**, markeret simuleret.
- **En faseport i AOS**: Studio Fjord afventer intern godkendelse.
- **AI-job**: brandresearch (intern motor, demodata) for et prospect og en
  Echo-opgave, som routeren blokerer ærligt.

Demo-poster kan tilbagedateres (`backdateDemoRecord`), så graferne viser et forløb
over tid. Funktionen afviser alt, der ikke er demo-markeret i Demo Mode.

**Nulstil demo** sletter kun demo-markerede poster og genindlæser Produktions
grundportefølje. Det gælder CRM-demoen, Dashboard-demoens virksomheder og
Produktions demoprojekter med deres godkendelser, som afvises. Registrerede AI-job
bevares i Job Centers historik (log, ingen sletning).

## Det samlede seks-moduls forløb

**Kør hele forløbet** bruger de rigtige funktioner på demodata, uden betalte AI-kald:

1. Research undersøger *Bryggeriet Nordlys* via Job Center (intern motor, demodata).
2. Research identificerer relevante AI-services.
3. Virksomheden bliver lead i CRM.
4. Der oprettes en salgsmulighed.
5. Der laves et tilbud via `crm.quote-request@1`.
6. Kunden accepterer.
7. Et projekt oprettes via `quotes.production-intake@2`.
8. Agenter tilknyttes fra servicebasen.
9. Opgaver udføres (simuleret), og en faseport oprettes.
10. AOS viser job og den afventende godkendelse.
11. Dashboard viser konsekvenserne (filtreret på kunden: én aftale, MRR, levering).

Panelet viser hvert trins status, beregnet fra de faktiske data, med et link til
modulet.

## API

| Metode og sti | Formål |
|---|---|
| `GET /api/dashboard?period=&from=&to=&customer=&category=&projectStatus=&agent=&engine=` | Beregnede data (samme som siderne). `400` ved ugyldige filtre |
| `GET /api/dashboard/demo` | Demo-status og forløbets trin |
| `POST /api/dashboard/demo {action: "load" \| "flow" \| "reset"}` | Kun Demo Mode, rate-limited |
| `GET/POST /api/dashboard/metrics` | `501`: push af datapunkter bruges ikke |

## Hvad kan ikke beregnes endnu

- Faktureret omsætning og modtagne betalinger: der er ingen faktura- eller
  betalingsdata.
- Churn og annulleringsdatoer: projekter har ingen annulleringsdato. MRR-historikken
  udelader derfor annullerede aftaler helt.
- Historiske beløb: pipelineudviklingen bruger salgsmulighedernes aktuelle beløb.
- Dækningsbidrag inklusive AI: AI-omkostninger er i USD, og der laves ingen
  valutaomregning.
- Tokenforbrug og API-omkostninger er 0, indtil Claude API eller Claude Code
  faktisk har kørt. Intet vises som opdigtet.

## Sikkerhed

Adgangsbeskyttelse er bevidst udskudt til næste etape. Indtil da gælder:

- kun fiktive demodata;
- ingen betalte AI-credentials i produktion;
- ingen automatisk ekstern kommunikation.

Alle med URL'en kan se Dashboardets samlede økonomi- og kundetal. Se
[security.md](security.md).
