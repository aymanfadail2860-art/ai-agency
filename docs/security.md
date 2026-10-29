# Sikkerhed og kvalitet

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

1. **Autentificering og autorisation**: ingen login eller roller i V1. Alle med netværksadgang kan bruge platformen. Kræver fx Supabase Auth med rollebaseret adgang pr. modul.
2. **Rate limiting**: den delte tæller i Supabase koster ekstra databasekald pr. skrivning. Ved højere trafik bør Vercel Firewall eller Redis/Upstash bruges.
3. **DNS-rebinding**: IP-kontrollen sker før forbindelsen. En ondsindet DNS-server kan i teorien svare forskelligt. Løsning: pin den opløste IP i en egen `undici`-dispatcher (`connect.lookup`).
4. **Bag udgående proxy**: når `HTTP(S)_PROXY` er sat, og lokal DNS ikke kan opløse en vært, overlades opslaget til proxyen, så IP-kontrollen ikke kan udføres lokalt. IP-literaler og interne navne afvises stadig. I produktion bør proxyen selv blokere private net, eller lokal DNS bør være tilgængelig (`allowUnresolvedBehindProxy: false`).
5. **Database og backup**: lokalt har JSON-filer ingen transaktioner eller backup. På Vercel bruges Supabase, hvor adgang kræver headeren `x-agency-secret` (RLS; kun SHA-256-hashen gemmes i databasen). Dokumenterne er ikke normaliserede, og der er ingen transaktioner på tværs af dokumenter.
6. **Baggrundsjobs**: research kører i webprocessen og går tabt ved genstart (job, der ikke er opdateret i 10 minutter, markeres som fejlede ved næste start). Brug en jobkø (fx Supabase Queues, Inngest eller BullMQ).
7. **Audit-log og GDPR**: hændelsesloggen er ikke manipulationssikker. Der mangler sletning/indsigt (GDPR art. 15/17), databehandleraftaler og retention-politik for kildeuddrag.
8. **Juridisk gennemgang** af scraping-politik, søge-API-vilkår og brug af reklamebeskyttede virksomheder i salgsarbejde.
9. **CSP**: `'unsafe-inline'` for scripts og styles er nødvendigt for Next.js uden nonce. Indfør nonce-baseret CSP.
10. **Hemmelighedshåndtering**: brug en secret manager (fx Vercel/Supabase secrets) frem for `.env`-filer.
11. **Overvågning**: ingen fejlsporing (fx Sentry) eller metrikker.
12. **Prompt injection er ikke fuldt løst**: valideringen begrænser skaden, men en kilde kan stadig påvirke AI-formuleringer. Menneskelig gennemgang af tilbud før afsendelse er påkrævet.
