-- =====================================================================
-- 20260814150000_cron_purge_upload_morti.sql
-- Cron ogni 3 giorni: spazzino dei caricamenti mai finiti.
--
-- Ogni upload nasce con una riga file_refs in 'uploading', creata da
-- /api/upload/media/init PRIMA che parta un byte. Se il caricamento non
-- arriva mai in fondo (telefono chiuso, rete caduta, app disinstallata) la
-- riga resta lì per sempre, insieme alla sessione multipart aperta su R2 —
-- che occupa spazio e viene fatturata.
--
-- Misurato in produzione il 10/08/2026: 66 righe appese, la piu' vecchia di
-- due mesi. Invisibili in ogni galleria (le query filtrano uploaded/synced),
-- quindi crescevano in silenzio.
--
-- Stesso pattern di purge-cestino / purge-bozze: pg_cron + pg_net chiamano
-- l'endpoint Next, che fa il lavoro vero. Auth: Bearer $CRON_SECRET (Vault,
-- nome 'cron_secret').
--
-- Finestra di grazia 24h: un video da 200 MB su rete di cantiere puo'
-- legittimamente restare 'uploading' per ore, e la coda del telefono lo
-- riprende da sola alla riapertura dell'app.
--
-- Cadenza: ogni 3 giorni (72 ore) alle 03:47 UTC — sfalsata da purge-cestino
-- (03:17, giornaliero) e purge-bozze (03:31, giornaliero). Piu' rada di quelle
-- perche' qui non c'e' fretta: la finestra di grazia e' comunque 24h, quindi al
-- massimo una riga morta resta in giro qualche giorno in piu' senza dare
-- fastidio a nessuno (non e' visibile in nessuna galleria). Meno corse a vuoto.
-- =====================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

create or replace function public.trigger_purge_upload_morti(ore int default 24)
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
    raise warning 'cron_secret assente in Vault: purge upload morti saltato';
    return;
  end if;

  perform net.http_post(
    url := 'https://bertaiolaimpianti.vercel.app/api/cron/purge-upload-morti?ore='
           || ore::text || '&max=200',
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
  where jobname = 'purge-upload-morti';
exception when others then
  null;
end $$;

-- `*/3` sul giorno del mese: gira il 1, 4, 7 … 31. A cavallo di fine mese il
-- passo puo' accorciarsi a un giorno: e' voluto, meglio una corsa in piu' che
-- una schedulazione che nessuno riesce a leggere.
select cron.schedule(
  'purge-upload-morti',
  '47 3 */3 * *',
  $$select public.trigger_purge_upload_morti(24)$$
);
