-- =====================================================================
-- 20260812090000_cron_integrazioni_salute.sql
-- Controllo periodico dei collegamenti verso i gestionali dei clienti.
--
-- PERCHE': un'integrazione non si rompe con un errore in faccia, smette di
-- farsi viva. L'agente gira su una macchina del cliente, dietro la sua VPN:
-- se si spegne, da noi non succede niente di visibile — le ore semplicemente
-- non arrivano piu', e ce ne accorgiamo a fine mese quando chiama il cliente.
--
-- L'endpoint valuta ogni collegamento con la stessa logica pura che colora i
-- semafori in /admin/integrazioni (`valutaCollegamento`), e manda una mail al
-- super admin SOLO per i clienti in modalita' `attiva` e in stato `guasto`.
-- Deduplica 12 ore per cliente: un agente fermo resta fermo per ore.
--
-- Cadenza: ogni 4 ore al minuto 41 (fuori dagli orari tondi, dove si
-- accalcano tutti i cron). Piu' fitto sarebbe rumore: la soglia di silenzio
-- predefinita e' 24 ore.
--
-- Stesso pattern degli altri tre cron (sync Nextcloud, purge cestino, purge
-- bozze): pg_cron + pg_net verso un endpoint Next protetto da
-- `Authorization: Bearer $CRON_SECRET` (segreto in Vault, nome 'cron_secret').
-- =====================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

create or replace function public.trigger_integrazioni_salute()
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
    raise warning 'cron_secret assente in Vault: controllo integrazioni saltato';
    return;
  end if;

  perform net.http_post(
    url := 'https://www.kommessa.it/api/cron/integrazioni-salute',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || v_secret,
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
end;
$$;

-- Idempotenza: rimuovi un eventuale job omonimo prima di rischedularlo.
do $$
begin
  perform cron.unschedule(jobid)
  from cron.job
  where jobname = 'integrazioni-salute';
exception when others then
  null;
end $$;

select cron.schedule(
  'integrazioni-salute',
  '41 */4 * * *',
  $$select public.trigger_integrazioni_salute()$$
);
