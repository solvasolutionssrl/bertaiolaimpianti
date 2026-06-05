-- =====================================================================
-- 20260604000100_cron_purge_cestino.sql
-- Cron giornaliero: purge definitivo del cestino media oltre i 30 giorni.
--
-- Stesso pattern del sync R2→Nextcloud (20260603000000): pg_cron + pg_net
-- chiamano un endpoint Next che fa il lavoro vero (cancella oggetti R2 +
-- thumb, o file nelle dotfolder .cestino_solva). L'endpoint richiede
-- `Authorization: Bearer $CRON_SECRET` (lo stesso secret in Vault, nome
-- 'cron_secret').
--
-- Cadenza: una volta al giorno, 03:17 UTC (notte profonda, basso traffico).
-- Il purge è idempotente: ripassa solo i file con purge_after < now().
-- =====================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

create or replace function public.trigger_cestino_purge(max_files int default 50)
returns void
language plpgsql
security definer
set search_path = public, vault, net, extensions
as $$
declare
  v_secret text;
begin
  select decrypted_secret into v_secret
  from vault.decrypted_secrets
  where name = 'cron_secret'
  limit 1;

  if v_secret is null then
    raise warning 'cron_secret assente in Vault: purge cestino saltato';
    return;
  end if;

  perform net.http_post(
    url := 'https://bertaiolaimpianti.vercel.app/api/cron/purge-cestino?max='
           || max_files::text,
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || v_secret,
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
end;
$$;

-- Idempotenza: rimuovi un eventuale job omonimo prima di rischedularlo.
do $$
begin
  perform cron.unschedule(jobid)
  from cron.job
  where jobname = 'purge-cestino';
exception when others then
  null;
end $$;

select cron.schedule(
  'purge-cestino',
  '17 3 * * *',
  $$select public.trigger_cestino_purge(50)$$
);
