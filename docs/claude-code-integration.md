# Claude Code som eksekveringsmotor — verificerede muligheder og begrænsninger

Undersøgt 31.10.2026 i Anthropics officielle dokumentation:

- [Automate work with routines](https://code.claude.com/docs/en/routines)
- [Trigger a routine through the API](https://platform.claude.com/docs/en/api/claude-code/routines-fire)

Funktionen er i *research preview*, så adfærd og grænser kan ændre sig.

## Hvad der er understøttet

| Spørgsmål | Svar (dokumenteret) | Konsekvens i AI Agency |
|---|---|---|
| Ekstern opgavestart | Ja: `POST https://api.anthropic.com/v1/claude_code/routines/{trig_…}/fire` | `fireRoutine()` i `integrations/claude-code/routines.ts` |
| Autentificering | Ét bearer-token pr. rutine (`sk-ant-oat01-…`), oprettet i webbrugerfladen og vist én gang. Ingen API til tokenstyring. Tokenet giver ingen læseadgang | Gemmes som Sensitive i Vercel (`CLAUDE_CODE_ROUTINE_RESEARCH_TOKEN`) |
| Header | `anthropic-version` (fx `2023-06-01`). Den ældre beta-header accepteres stadig | Sendes |
| Inputparametre | Kun `text` (fritekst, højst 65.536 tegn). Den pakkes ind som utroværdige data (`<routine-fire-payload>`), og rutinens prompt skal udtrykkeligt bruge den | JSON-payload med `protocol`, `jobId`, `input` og callback; rutineprompten henviser til `routines/ai-agency-job.md` |
| Sessionidentifikation | Svar: `claude_code_session_id` + `claude_code_session_url` | Gemmes på jobbet og vises som link |
| Resultataflevering | Intet resultat-API. Sessionen afslutter i sin egen transskription | Sessionen melder tilbage med `curl` til `/api/aos/jobs/:id/callback` med en engangsnøgle |
| Statusrapportering | Intet status-API for tokenet. Historik ses kun i webbrugerfladen | Kun tilbagemeldte hændelser vises. Uden svar efter `CLAUDE_CODE_JOB_TIMEOUT_MINUTES` markeres jobbet som "forsinket" |
| Idempotens | Ingen: hvert kald starter en ny session | Fejl uden entydigt svar (5xx/timeout) kræver bekræftelse før genforsøg |
| Grænser | 30 kald/time pr. rutine og 100/time pr. konto (`429` + `Retry-After`) | Vises i fejlen. Eget dagligt loft: `CLAUDE_CODE_DAILY_LIMIT` |
| Forbrug | Trækker på abonnementets forbrug som interaktive sessioner. Kører som kontoens ejer (GitHub-commits og connectors som dig) | Registreres som "kørsler", ikke USD |
| Godkendelser under kørsel | Sessionen kører i auto mode. Handlinger, der matcher en ask-regel, venter på svar i sessionen | Kritiske handlinger godkendes i AI Agency *før* afsendelse. Rutinens prompt forbyder alt andet |
| Netværk | Standardmiljøet har en tilladelsesliste. Egne domæner skal tilføjes | AI Agency's domæne skal tillades i rutinens miljø |
| Planer | Pro, Max, Ultra, Team og Enterprise | — |

## Hvad der ikke er understøttet, og hvordan vi håndterer det

- **Kontinuerlig status eller streaming fra sessionen**: findes ikke via API. AI Agency
  viser derfor kun de hændelser, sessionen selv sender, og opdigter aldrig aktivitet.
- **Stop af en kørende session via API**: findes ikke. "Annullér" i AI Agency lukker
  callback-nøglen og siger tydeligt, at sessionen skal stoppes i Claude Code.
- **Interaktive opgaver**, hvor brugeren venter på svaret: rutiner er ikke egnede
  (sessionsopstart og ingen streaming). Routeren sender dem til Claude API.
- **Automatisk opsætning af rutiner**: rutiner og tokens kan kun oprettes i webbrugerfladen
  eller med `/schedule`. Engangsopsætningen står i `routines/ai-agency-job.md` §5.

## Claude API som alternativ og supplement

Claude API (motor B) bruges til interaktive opgaver og som fallback. Den er implementeret
med structured outputs, Zod-validering, modelverifikation, dagligt budget og
omkostningsregistrering pr. job. Den kræver `ANTHROPIC_API_KEY` og betales pr. token.

## Sikkerhed

- Callback-nøglen er 256 bit tilfældig, unik pr. job og gemmes kun som SHA-256. Den
  sammenlignes i konstant tid, udløber efter `CLAUDE_CODE_CALLBACK_HOURS` (standard 24) og
  annulleres ved resultat eller annullering.
- Tilbagemeldinger valideres med Zod, og resultatet mod opgavetypens skema (fx
  `DeepResearchResultSchema`, der nedgraderer "fakta" uden gyldig kilde). Der er højst 150
  hændelser pr. job og en hastighedsgrænse pr. job.
- Rutinens token ligger kun i Vercel. Et lækket token kan kun starte netop den rutine,
  hvis fire-tekst behandles som utroværdige data.
