-- =====================================================================
-- 20260608000100_cron_purge_bozze.sql
-- Cron giornaliero: purge delle bozze abbandonate oltre i 30 giorni.
--
-- Stesso pattern di purge-cestino (20260604000100) e sync (20260603000000):
-- pg_cron + pg_net chiamano l'endpoint Next /api/cron/purge-bozze che fa il
-- lavoro vero (cancella oggetti R2 di staging + thumb, poi elimina le righe
-- bozza con CASCADE su file_refs). L'endpoint richiede
-- `Authorization: Bearer $CRON_SECRET` (secret in Vault, nome 'cron_secret').
--
-- Cadenza: una volta al giorno, 03:31 UTC (sfalsata da purge-cestino 03:17).
-- =====================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

create or replace function public.trigger_bozze_purge(giorni int default 30)
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
    raise warning 'cron_secret assente in Vault: purge bozze saltato';
    return;
  end if;

  perform net.http_post(
    url := 'https://bertaiolaimpianti.vercel.app/api/cron/purge-bozze?giorni='
           || giorni::text,
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
  where jobname = 'purge-bozze';
exception when others then
  null;
end $$;

select cron.schedule(
  'purge-bozze',
  '31 3 * * *',
  $$select public.trigger_bozze_purge(30)$$
);
