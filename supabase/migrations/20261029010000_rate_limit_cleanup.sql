-- Rydder udløbne rate limit-vinduer (platform/rate-limits) hvert kvarter,
-- så tabellen ikke vokser i den offentlige demo.
create extension if not exists pg_cron;

select cron.schedule(
  'agency-cleanup-rate-limits',
  '*/15 * * * *',
  $$delete from public.documents
    where module = 'platform'
      and collection = 'rate-limits'
      and updated_at < now() - interval '2 hours'$$
);
