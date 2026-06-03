-- Cron sync R2 → Nextcloud via pg_cron + pg_net.
--
-- Contesto: su Vercel Hobby i cron sub-giornalieri non scattano (i file
-- restavano in 'uploaded' per ore). Spostiamo la schedulazione su Supabase
-- pg_cron, indipendente dal piano Vercel. Il sync vero gira sempre
-- nell'endpoint Next /api/sync/r2-to-nextcloud (logica TS, sharp, R2,
-- Nextcloud); qui lo invochiamo soltanto.
--
-- Cadenza richiesta dal cliente:
--   - ogni 5 min di giorno (05:00–20:00 ora italiana)
--   - ogni 30 min di notte (per alleggerire)
-- Il job pg_cron parte ogni 5 min sempre; è la funzione a decidere se è
-- giorno/notte usando l'ora 'Europe/Rome', che gestisce da sola il passaggio
-- ora solare/legale (niente da aggiustare ai cambi d'ora).
--
-- Auth: l'endpoint richiede `Authorization: Bearer $CRON_SECRET`. Il valore
-- NON è in questo file: va messo una volta in Supabase Vault con nome
-- 'cron_secret' (vedi nota in fondo). La funzione lo legge a runtime.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Funzione helper: gating orario (ora IT) + chiamata all'endpoint col Bearer.
create or replace function public.trigger_nextcloud_sync(max_files int default 10)
returns void
language plpgsql
security definer
set search_path = public, vault, net, extensions
as $$
declare
  v_secret text;
  v_hour int;
  v_min int;
begin
  -- Ora locale italiana: gestisce automaticamente ora solare/legale (DST).
  v_hour := extract(hour   from (now() at time zone 'Europe/Rome'))::int;
  v_min  := extract(minute from (now() at time zone 'Europe/Rome'))::int;

  -- Giorno (05:00–19:59 IT): ogni 5 min (il cron è */5, quindi sempre).
  -- Notte: solo ai minuti 00 e 30 → ogni 30 min.
  if not (v_hour >= 5 and v_hour < 20) and v_min not in (0, 30) then
    return;
  end if;

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

-- Idempotenza: rimuovi job omonimi (incluse le vecchie 2 finestre UTC).
do $$
begin
  perform cron.unschedule(jobid)
  from cron.job
  where jobname in ('sync-nextcloud-giorno', 'sync-nextcloud-notte', 'sync-nextcloud');
exception when others then
  null;
end $$;

-- Un solo job ogni 5 min; la finestra oraria la decide la funzione (ora IT).
select cron.schedule(
  'sync-nextcloud',
  '*/5 * * * *',
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
