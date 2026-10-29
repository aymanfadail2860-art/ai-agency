-- AI Agency Platform — lagring for alle moduler (erstatter lokale JSON-filer på Vercel).
-- Hver række er ét dokument i et moduls samling: (module, collection, id) → data (JSONB).
-- Moduler tilgår kun deres egne samlinger via platformens CollectionStore.

create schema if not exists private;

create table if not exists public.documents (
  module      text        not null,
  collection  text        not null,
  id          text        not null,
  data        jsonb       not null,
  rev         integer     not null default 1,
  updated_at  timestamptz not null default now(),
  primary key (module, collection, id)
);

create index if not exists documents_collection_idx on public.documents (module, collection);

-- Kun platformens server har adgang. Den sender headeren `x-agency-secret`;
-- databasen gemmer kun SHA-256-hashen af hemmeligheden.
create table if not exists private.config (
  key   text primary key,
  value text not null
);

create or replace function private.has_agency_secret()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    encode(extensions.digest(coalesce(current_setting('request.headers', true)::json ->> 'x-agency-secret', ''), 'sha256'), 'hex')
      = (select value from private.config where key = 'api_secret_sha256'),
    false
  );
$$;

revoke all on function private.has_agency_secret() from public;
grant usage on schema private to anon, authenticated;
grant execute on function private.has_agency_secret() to anon, authenticated;

alter table public.documents enable row level security;

drop policy if exists "agency server access" on public.documents;
create policy "agency server access" on public.documents
  for all
  to anon, authenticated
  using (private.has_agency_secret())
  with check (private.has_agency_secret());

grant select, insert, update, delete on public.documents to anon, authenticated;
