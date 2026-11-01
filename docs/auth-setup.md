# Adgang til AI Agency — opsætning og administration

AI Agency bruger **Supabase Auth** i projektet `ai-agency` (ref `vkyrposfwdcnwpexgkvw`).
Der er ingen e-mails eller adgangskoder i kildekoden. Administratoren oprettes i Supabase og får
rollen via `app_metadata`, som brugeren ikke selv kan ændre.

## 1. Engangsindstillinger i Supabase (dashboard)

Supabase-dashboardet → projektet **ai-agency**:

1. **Authentication → Sign In / Providers → Email**
   - *Email*: **slået til**.
   - *Allow new users to sign up*: **slået fra**, så ingen selvregistrering er mulig.
   - *Confirm email*: må gerne være slået til. Administratoren oprettes som bekræftet (trin 2).
2. **Authentication → URL Configuration**
   - *Site URL*: `https://ai-agency-skrotnu.vercel.app`.
   - *Redirect URLs*: kun `https://ai-agency-skrotnu.vercel.app/**`. Login sender ingen e-mails med links, men det forhindrer redirects til andre domæner.
3. *(Anbefalet, senere)* **Authentication → Multi-Factor**: TOTP. Kræver en kodeændring, før det håndhæves (se security.md).

Vercel-projektet `ai-agency` skal have:

| Variabel | Værdi | Status |
|---|---|---|
| `SUPABASE_URL` | `https://vkyrposfwdcnwpexgkvw.supabase.co` | Findes |
| `SUPABASE_SECRET_KEY` | Servernøgle (Sensitive) — kun til datalageret | Findes |
| `SUPABASE_PUBLISHABLE_KEY` | Den offentlige `sb_publishable_…`-nøgle (ikke hemmelig) — til login | Sat i V4.1 |

Mangler `SUPABASE_PUBLISHABLE_KEY`, er platformen lukket. Alle sider viser "Adgangskontrol er ikke
konfigureret", og API'er svarer 503. Systemet fejler altså lukket, aldrig åbent.

## 2. Opret den første administrator

1. **Authentication → Users → Add user → Create new user**
   - E-mail: din arbejds-e-mail.
   - Adgangskode: en stærk, unik adgangskode på mindst 16 tegn. Gem den i din adgangskodemanager. Del den aldrig i chat eller e-mail.
   - Sæt flueben i **Auto Confirm User**.
2. **Giv administratorrollen**: SQL Editor → kør (erstat e-mailen):

   ```sql
   update auth.users
   set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"agency_role": "admin"}'::jsonb
   where email = 'DIN-EMAIL@EKSEMPEL.DK';
   ```

   Kontrollér resultatet (der skal stå `admin`):

   ```sql
   select email, raw_app_meta_data->>'agency_role' as rolle, last_sign_in_at
   from auth.users order by created_at;
   ```
3. Log ind på `https://ai-agency-skrotnu.vercel.app/login`.

En konto uden rollen får beskeden "Kontoen har ikke adgang til AI Agency" og ingen session.

## 3. Giv adgang til flere personer (senere)

Gentag trin 2 for hver person. I denne version findes kun rollen `admin`. De planlagte roller
(`manager`, `sales`, `production`, `viewer`) giver endnu **ingen** adgang (se security.md).

## 4. Tilbagekald adgang

Fjern rollen. Det har effekt med det samme, fordi hvert kald validerer brugeren hos Supabase Auth:

```sql
update auth.users set raw_app_meta_data = raw_app_meta_data - 'agency_role'
where email = 'PERSON@EKSEMPEL.DK';
```

Log desuden personen ud af alle enheder: **Authentication → Users → brugeren → … → Sign out user**,
eller med SQL `delete from auth.sessions where user_id = (select id from auth.users where email = 'PERSON@EKSEMPEL.DK');`.

Skal kontoen helt væk: **Authentication → Users → brugeren → Delete user**.

## 5. Nulstil en adgangskode

Platformen har bevidst ingen "glemt adgangskode"-funktion, så den ikke afslører, hvilke konti der findes.

- **Brugeren kan stadig logge ind**: administratoren giver en ny adgangskode i **Authentication → Users → brugeren**, hvor dashboardet tilbyder det.
- **Ellers med SQL**: Skriv selv adgangskoden direkte i SQL Editor, og indsæt den ikke andre steder.

  ```sql
  update auth.users set encrypted_password = extensions.crypt('NY-STÆRK-ADGANGSKODE', extensions.gen_salt('bf'))
  where email = 'PERSON@EKSEMPEL.DK';
  ```
- Log derefter brugeren ud af eksisterende sessioner (se punkt 4).

## 6. Skift administrator

1. Opret den nye administrator (punkt 2) og log ind for at bekræfte adgangen.
2. Tilbagekald den gamle (punkt 4), og slet eventuelt kontoen.

Der skal altid være mindst én aktiv administrator. Ellers kan ingen logge ind, men data er urørt.

## 7. Lokal udvikling og test

Lokalt og i e2e-testene startes en rigtig Supabase Auth-server (det officielle `supabase/auth`-image)
med Postgres i Docker: `node scripts/local-auth/start.mjs`. Den kører under
`http://127.0.0.1:54321/auth/v1` med selvregistrering slået fra. Testbrugere oprettes med tilfældige
adgangskoder via Auth-serverens admin-API (`tests/e2e/auth.setup.ts`). Den lokale JWT-hemmelighed
i `scripts/local-auth/jwt.mjs` er kun til den lokale testserver.
