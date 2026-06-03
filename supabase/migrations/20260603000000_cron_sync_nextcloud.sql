-- Cron sync R2 → Nextcloud via pg_cron + pg_net.
--
-- Contesto: su Vercel Hobby i cron sub-giornalieri non scattano (i file
-- restavano in 'uploaded' per ore). Spostiamo la schedulazione su Supabase
-- pg_cron, indipendente dal piano Vercel. Il sync vero gira sempre
-- nell'endpoint Next /api/sync/r2-to-nextcloud (logica TS, sharp, R2,
-- Nextcloud); qui lo invochiamo soltanto.
--
-- Cadenza richiesta dal cliente:
--   - ogni 5 min di giorno (05:00–20:00 Italia)
--   - ogni 30 min di notte (per alleggerire)
-- pg_cron gira in UTC. Italia CEST = UTC+2 → giorno = UTC 03–18.
-- NB DST: d'inverno (CET, UTC+1) la finestra si sposta di 1h (04:00–19:00).
--
-- Auth: l'endpoint richiede `Authorization: Bearer $CRON_SECRET`. Il valore
-- NON è in questo file: va messo una volta in Supabase Vault con nome
-- 'cron_secret' (vedi nota in fondo). La funzione lo legge a runtime.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Funzione helper: chiama l'endpoint sync con il Bearer preso dal Vault.
create or replace function public.trigger_nextcloud_sync(max_files int default 10)
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
    raise warning 'cron_secret assente in Vault: sync saltato';
    return;
  end if;

  perform net.http_get(
    url := 'https://bertaiolaimpianti.vercel.app/api/sync/r2-to-nextcloud?max='
           || max_files::text,
    headers := jsonb_build_object('Authorization', 'Bearer ' || v_secret),
    timeout_milliseconds := 60000
  );
end;
$$;

-- Idempotenza: rimuovi i job omonimi prima di ricrearli.
do $$
begin
  perform cron.unschedule(jobid)
  from cron.job
  where jobname in ('sync-nextcloud-giorno', 'sync-nextcloud-notte');
exception when others then
  null;
end $$;

-- Giorno: ogni 5 min, UTC 03–18 (≈ 05:00–20:55 Italia CEST).
select cron.schedule(
  'sync-nextcloud-giorno',
  '*/5 3-18 * * *',
  $$select public.trigger_nextcloud_sync(10)$$
);

-- Notte: ogni 30 min, UTC 19–23 e 00–02 (le ore non coperte dal giorno).
select cron.schedule(
  'sync-nextcloud-notte',
  '*/30 0-2,19-23 * * *',
  $$select public.trigger_nextcloud_sync(10)$$
);

-- ─────────────────────────────────────────────────────────────────────────
-- STEP MANUALE (una tantum, NON in questo file per non scrivere il secret):
--   select vault.create_secret(
--     '<VALORE_DI_CRON_SECRET>', 'cron_secret',
--     'CRON_SECRET per cron sync R2->Nextcloud'
--   );
-- Deve essere identico al CRON_SECRET configurato nelle env di Vercel.
-- ─────────────────────────────────────────────────────────────────────────
