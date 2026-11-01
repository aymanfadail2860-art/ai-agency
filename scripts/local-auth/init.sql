-- KUN LOKAL TEST: roller og skema, som Supabase Auth (GoTrue) forventer.
create role supabase_auth_admin login createrole noinherit password 'local-e2e-auth';
create schema if not exists auth authorization supabase_auth_admin;
grant create on database postgres to supabase_auth_admin;
alter role supabase_auth_admin set search_path = 'auth';
create role anon nologin noinherit;
create role authenticated nologin noinherit;
create role service_role nologin noinherit bypassrls;
create role supabase_admin login superuser password 'local-e2e-admin';
