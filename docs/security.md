# Sikkerhed og kvalitet

## V4.1 — Adgangsbeskyttelse (Supabase Auth)

AI Agency er en **privat intern platform**. Opsætning af administrator: [auth-setup.md](auth-setup.md).

| Område | Implementering |
|---|---|
| **Autentificering** | Supabase Auth (e-mail + adgangskode) i projektet `ai-agency`, via de officielle pakker `@supabase/ssr` og `@supabase/supabase-js`. Login, logout og sessionsfornyelse sker server-side. Ingen selvregistrering i brugerfladen; konti oprettes af administratoren i Supabase. |
| **Sessioner** | Sessionen ligger i cookies, der altid er `httpOnly`, `SameSite=Lax`, `Path=/` og `Secure` på https. Den offentlige Supabase-nøgle bruges kun på serveren. Hvert beskyttet kald validerer adgangstokenet hos Supabase Auth (`getUser`), ikke kun lokalt. Udløbne adgangstokens fornyes automatisk med refresh-tokenet (rotation er slået til hos Supabase). Logout tilbagekalder sessionen hos Supabase, så selv kopierede cookies afvises bagefter. |
| **Autorisation** | Rollen læses fra `app_metadata.agency_role`, som kun kan sættes med servernøglen eller i Supabase-dashboardet, aldrig af brugeren. Kun `admin` giver adgang i denne version. En gyldig konto uden rolle får 403. |
| **Første forsvarslinje: middleware** | Alle sider og API'er er beskyttet efter princippet *deny by default*. Kun `/login`, `POST /api/auth/login`, `POST /api/auth/logout` og Next.js' statiske filer er offentlige. Sider sendes til `/login?next=…`. API'er svarer med JSON (aldrig HTML): `401 unauthorized`, `403 forbidden` eller `503`, hvis Auth ikke er konfigureret. Forældede sessionscookies slettes. |
| **Forsvar i dybden** | Alle API-handlere kører gennem `route()`, som selv kræver en administratorsession (`requireAdmin`). Kun login/logout (`publicRoute`) og Claude Code-callbacks (`machineRoute`) er undtaget, og det håndhæves af en test. Layoutet for alle interne sider (`app/(app)/layout.tsx`) kontrollerer adgangen igen server-side. |
| **Maskine-til-maskine** | `POST /api/aos/jobs/:id/callback` bruger ikke browsersessioner, men jobbets egen engangsnøgle: 256 bit, kun SHA-256 gemt, udløb og sammenligning i konstant tid. Undtagelsen gælder kun præcis denne sti og metode, ikke en generel åbning. |
| **CSRF** | Cookies med `SameSite=Lax` plus en Origin-kontrol, hvor muterende API-kald fra en anden oprindelse afvises med 403. Login og logout er kun tilladt med POST. |
| **Brute force** | Login er begrænset til 10 forsøg pr. IP og 5 pr. e-mail pr. 15 minutter. Nøglerne hashes, så e-mails ikke gemmes i klartekst. Supabase Auth har derudover sine egne grænser. |
| **Brugeroptælling** | Login giver samme fejl ("E-mail eller adgangskode er forkert.") for ukendt e-mail og forkert adgangskode. Der findes ingen "glemt adgangskode"-funktion, der kan afsløre konti. |
| **Open redirect** | `next` accepterer kun interne stier (ikke `//…`, `https://…`, `/api/…` eller `/login`). |
| **Fejl og logs** | Adgangskoder, cookies, tokens og nøgler logges aldrig. Uventede fejl returneres som en generisk `internal_error`. |
| **Datalager** | Tabellen `public.documents` er låst til servernøglen (migration `20261101000000`): `anon` og `authenticated` har ingen rettigheder og ingen policies, så alt nægtes. En indlogget brugers JWT eller den offentlige nøgle kan derfor ikke gå udenom Next.js. Den tidligere vej med delt hemmelighed (`x-agency-secret`) er fjernet. `private.config` har RLS slået til og er ikke eksponeret. Supabase-rådgiveren viser kun INFO "RLS uden policies", og det er tilsigtet. Der er ingen storage-buckets. |

### Roller — fremtidigt design (ikke aktiveret)

Kun `admin` er aktiv. De øvrige roller kan stå i `app_metadata`, men giver bevidst **ingen adgang**, indtil de er implementeret og testet. Det er testet for `manager`.

| Rolle | Planlagt adgang |
|---|---|
| `admin` | **Aktiv.** Fuld adgang til platform, konfiguration, integrationer og godkendelser |
| `manager` | Kunder, salg, projekter, agenter og godkendelser inden for eget område. Ingen integrationsindstillinger eller agentversioner |
| `sales` | Research, CRM og Tilbud (læse og skrive). Dashboardets salgsområde. Ingen økonomi pr. projekt, AOS-konfiguration eller produktion |
| `production` | Produktion & Levering (læse og skrive), egne agentopgaver og faseporte. Kun læseadgang til kunde (navn og kontakt) |
| `viewer` | Kun læsning af udvalgte områder. Ingen skrivende API'er, demo-handlinger, godkendelser eller AI-opgaver |

**Sådan aktiveres rollerne senere:**

1. Gør `ACTIVE_ROLES` rollebaseret pr. modul og metode (en tilladelsesmatrix i `lib/auth/roles.ts`).
2. Lad `route()` tage den krævede tilladelse som parameter.
3. Filtrér navigationen efter rolle.
4. Udvid adgangstestene med en matrix over rolle × route × metode.

### Tilbageværende risici

- **Ingen MFA** endnu. Anbefales, før rigtige kundedata eller betalte AI-nøgler tages i brug: Supabase Auth MFA (TOTP) med krav om AAL2 i middleware.
- **Selvregistrering skal slås fra i Supabase** (manuelt trin i [auth-setup.md](auth-setup.md)). Selv hvis den står til, får en selvoprettet konto ingen adgang, fordi den ikke har nogen rolle.
- **Ingen adgangskodenulstilling i appen.** Administratoren nulstiller via Supabase (se auth-setup.md).
- **Rate limiting** bruger den delte tæller i datalageret. Ved højere trafik eller målrettede angreb bør Vercel Firewall eller WAF bruges.
- **Ingen manipulationssikker audit-log** af logins (Supabase Auth logger dem i Auth-loggen).

## Tilføjet i V3 (fælles AI-infrastruktur og AOS)

| Område | Implementering |
|---|---|
| **Godkendelser** | Kritiske handlinger (deployment, kundesystemer, betalte handlinger, massehandlinger, destruktive databaseændringer, kundekommunikation, agentændringer) kræver eksplicit godkendelse i AOS. Beslutninger registreres præcis én gang. |
| **Agentændringer** | Instruktioner ændres aldrig direkte. En ændring bliver en ny, uforanderlig og valideret version (kun kendte værktøjer, motorer og opgavetyper), der først aktiveres efter godkendelse. Grundversionerne ligger i GitHub. |
| **Claude Code-callbacks** | Engangsnøgle pr. job (256 bit), kun SHA-256 gemt, sammenligning i konstant tid, udløb, annullering ved resultat/annullering, maks. 150 hændelser pr. job, hastighedsgrænse pr. job og Zod-validering af hver besked. Resultatet valideres mod opgavetypens skema. |
| **Ingen dobbelt eksekvering** | Rutine-API'et har ingen idempotens: et kald uden entydigt svar genforsøges aldrig automatisk og kræver brugerens bekræftelse. Åbne job dedupliceres pr. idempotensnøgle. |
| **Ingen opdigtet aktivitet** | Agentstatus, Agent Office og Live Activity udledes kun af registrerede job. Modellernes interne ræsonnement vises ikke. Demo-data er markeret. |
| **Omkostninger** | Daglige lofter pr. motor, godkendelsestærskel for API-job og omkostning registreret pr. job, kunde, modul og motor. Abonnementsforbrug rapporteres separat. |
| **Credentials** | Rutine-tokens og API-nøgler ligger kun i Vercel (Sensitive). Integration Manager viser variabelnavne, aldrig værdier. Intet er bundet til en personlig konto i koden. |

**(V3, nu løst i V4.1) Kendt risiko, før betalte motorer aktiveres:** platformen havde intet login. Med `ANTHROPIC_API_KEY` eller et rutine-token kan alle med linket bruge budgettet. Lofterne begrænser skaden, men adgangskontrol (anbefalet: Supabase Auth med én tilladt e-mail) bør indføres først. Se [v3-architecture.md §8](v3-architecture.md).

**CRM (V3.3) — persondata uden login (løst i V4.1):** CRM gemmer kontaktpersoners navne, e-mails og telefonnumre. Uden adgangskontrol kan alle med URL'en læse og ændre dem. Brug kun demodata eller fiktive kontakter, indtil login er indført. CRM sender ingen e-mails, foretager ingen opkald og starter ingen betalte AI-opgaver (Echo-opgaverne er planlagte og blokeres af routeren). Se [crm.md](crm.md#sikkerhed-og-adgang).

**Dashboard (V3.4, adgangsbeskyttet i V4.1):** Dashboard samler bureauets økonomi- og kundetal på én side. Adgangsbeskyttelse er bevidst udskudt, indtil alle seks moduler har en færdig demo, og er næste etape. Indtil da: kun fiktive data, ingen betalte AI-credentials i produktion og ingen automatisk ekstern kommunikation. Dashboard-demoen skriver kun demo-markerede poster og kan ikke ændre rigtige data.

**Supabase-rådgivning:** `private.config` har RLS slået fra. Tabellen er kun tilgængelig for rollen `postgres` (ingen rettigheder for `anon`/`authenticated`), og `private`-skemaet eksponeres ikke via API'et, så den reelle risiko er lav. Anbefalet hærdning (kræver din godkendelse): `alter table private.config enable row level security;` (uden policies; påvirker ikke server-rollen).

## Implementeret i V1

| Område | Implementering |
|---|---|
| **API-nøgler server-side** | Alle nøgler læses i `packages/integrations/src/config.ts` fra miljøet. Klienten ser kun `configured: true/false` (`/api/integrations/status`). `.env*.local` er git-ignoreret, og ZIP-eksporten udelader dem og afbryder ved nøgle-lignende indhold. |
| **Inputvalidering** | Alle API-input og alle lagrede data valideres med Zod. Body-størrelse er maks. 512 KB. CVR valideres med modulus 11. |
| **Fejlhåndtering** | Ensartede fejlsvar med stabile koder og danske beskeder. Interne fejl logges server-side og returneres som generisk `internal_error` uden stacktrace. |
| **Timeouts** | CVR 10-12 s, websider 8 s, robots.txt 5 s, søgning 8 s, Claude 180 s med 2 retries. |
| **Rate limiting** | Alle muterende kald (og PDF-eksport) begrænses pr. klient (60/min) og samlet for hele platformen (3000/time). Strengere grænser gælder for CVR-opslag (20/min), research (10/min), tekstgenerering (10/min) og PDF (20/min). På Vercel tælles i Supabase, så grænserne holder på tværs af serverinstanser. IP-adresser gemmes kun som en kort SHA-256-hash, og udløbne tællere slettes hvert kvarter (pg_cron). |
| **SSRF-beskyttelse** | `assertSafeUrl` tillader kun `http(s)` på port 80/443 og ingen loginoplysninger i URL. Interne værtsnavne (`localhost`, `*.local`, `*.internal`, metadata) afvises, DNS opløses, og alle adresser tjekkes mod private, loopback-, link-local-, CGNAT-, multicast-, dokumentations- og IPv4-mapped IPv6-net. Omdirigeringer følges manuelt med kontrol pr. hop (maks. 4). Kun HTML/tekst hentes, maks. 1,5 MB. |
| **Lovlig indsamling** | `robots.txt` respekteres. Bot-user-agent er identificerbar. Kun offentlige sider hentes, og kun op til 5 sider pr. virksomhed. Websøgning sker via et officielt API med egne vilkår. |
| **Kildehenvisninger** | Alle fund refererer kilde-id'er. Kilder har type, URL, udbyder og hentetidspunkt. |
| **Prompt injection** | Kildeindhold pakkes i `<source>`-tags, hvor forsøg på at lukke tagget neutraliseres. Systemprompten instruerer i at behandle kilder som data. Claude får **ingen værktøjer**. Output valideres med structured outputs og Zod. Kilde-id'er filtreres mod kendte kilder, "fakta" uden gyldig kilde nedgraderes, konkurrenter uden kilde kasseres, og længder begrænses. Scoren beregnes deterministisk og kan ikke påvirkes af AI. React escaper al tekst. |
| **Omkostningskontrol (V2)** | Dagligt budget for Claude (`AI_DAILY_BUDGET_USD`) med tokens og estimeret pris logget pr. døgn; daglige lofter for websøgning, CVR-opslag og researchjob; maks. sider pr. crawl (`RESEARCH_MAX_PAGES`); maks. tegn til AI (`AI_MAX_INPUT_CHARS`). Forbruget vises under Indstillinger. Ved nået budget falder analysen tilbage til regelbaseret — tydeligt markeret. |
| **Juridiske relationer (V2)** | CVR-relationer gættes aldrig: fund fra hjemmeside og navnesøgning er forslag med kilde; kun brugerbekræftede relationer bruges som fakta og på tilbud. AI-modellen verificeres via Models API i stedet for at stole på et hardcodet navn. |
| **Fakta vs. hypoteser** | Klassifikation på hvert fund (`fact`/`assessment`/`hypothesis`/`unknown`). Fravær af funktioner er altid en vurdering. Branchebaserede antagelser er hypoteser. |
| **Dataminimering** | Hemmelige CVR-kontaktoplysninger frasorteres. Kildeuddrag begrænses (maks. 4000 tegn), hentede sider afkortes, og der lagres ingen personoplysninger ud over offentlige virksomhedsdata. Reklamebeskyttelse vises tydeligt. |
| **Demo/live-adskillelse** | `mode` på alle entiteter. Virksomheder er unikke pr. `(cvr, mode)`. Demo-kilder bruger `.example`-domæner og ugyldige CVR-numre. Der er ingen fiktiv fallback i Live Mode. |
| **CSRF** | Middleware afviser muterende `/api`-kald med fremmed `Origin`. |
| **HTTP-headere** | CSP, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`. `X-Powered-By` er slået fra. |

## Mangler før produktionsbrug

1. **Autentificering og autorisation**: implementeret i V4.1 (se øverst). Tilbage: MFA og de fremtidige roller.
2. **Rate limiting**: den delte tæller i Supabase koster ekstra databasekald pr. skrivning. Ved højere trafik bør Vercel Firewall eller Redis/Upstash bruges.
3. **DNS-rebinding**: IP-kontrollen sker før forbindelsen. En ondsindet DNS-server kan i teorien svare forskelligt. Løsning: pin den opløste IP i en egen `undici`-dispatcher (`connect.lookup`).
4. **Bag udgående proxy**: når `HTTP(S)_PROXY` er sat, og lokal DNS ikke kan opløse en vært, overlades opslaget til proxyen, så IP-kontrollen ikke kan udføres lokalt. IP-literaler og interne navne afvises stadig. I produktion bør proxyen selv blokere private net, eller lokal DNS bør være tilgængelig (`allowUnresolvedBehindProxy: false`).
5. **Database og backup**: lokalt har JSON-filer ingen transaktioner eller backup. På Vercel bruges Supabase, hvor tabellen kun kan tilgås med servernøglen (V4.1). Dokumenterne er ikke normaliserede, og der er ingen transaktioner på tværs af dokumenter.
6. **Baggrundsjobs**: research kører i webprocessen og går tabt ved genstart (job, der ikke er opdateret i 10 minutter, markeres som fejlede ved næste start). Brug en jobkø (fx Supabase Queues, Inngest eller BullMQ).
7. **Audit-log og GDPR**: hændelsesloggen er ikke manipulationssikker. Der mangler sletning/indsigt (GDPR art. 15/17), databehandleraftaler og retention-politik for kildeuddrag.
8. **Juridisk gennemgang** af scraping-politik, søge-API-vilkår og brug af reklamebeskyttede virksomheder i salgsarbejde.
9. **CSP**: `'unsafe-inline'` for scripts og styles er nødvendigt for Next.js uden nonce. Indfør nonce-baseret CSP.
10. **Hemmelighedshåndtering**: brug en secret manager (fx Vercel/Supabase secrets) frem for `.env`-filer.
11. **Overvågning**: ingen fejlsporing (fx Sentry) eller metrikker.
12. **Prompt injection er ikke fuldt løst**: valideringen begrænser skaden, men en kilde kan stadig påvirke AI-formuleringer. Menneskelig gennemgang af tilbud før afsendelse er påkrævet.
