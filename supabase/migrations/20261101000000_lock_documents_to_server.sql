-- V4.1 — Adgangsbeskyttelse: dokumentlageret kan KUN tilgås af platformens server.
--
-- Før: anon/authenticated havde tabelrettigheder, beskyttet af en RLS-policy, der
-- krævede en delt hemmelighed i headeren `x-agency-secret`. Produktionen bruger
-- servernøglen (service_role), så den vej er ubrugt — og med Supabase Auth slået
-- til ville enhver indlogget brugers JWT (rollen `authenticated`) ellers kunne
-- forsøge at gå udenom Next.js direkte mod PostgREST.
--
-- Efter: anon og authenticated har ingen rettigheder og ingen policies (RLS er
-- slået til → alt nægtes). service_role (kun server-side, Sensitive i Vercel)
-- omgår RLS og beholder sine rettigheder. Ingen data ændres.

drop policy if exists "agency server access" on public.documents;
revoke all on table public.documents from anon, authenticated;
alter table public.documents enable row level security;

-- Den delte hemmelighed bruges ikke længere.
revoke execute on function private.has_agency_secret() from anon, authenticated;
drop function if exists private.has_agency_secret();
revoke usage on schema private from anon, authenticated;
alter table private.config enable row level security;
