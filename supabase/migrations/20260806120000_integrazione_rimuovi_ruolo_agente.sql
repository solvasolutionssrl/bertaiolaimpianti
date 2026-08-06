-- =====================================================================
-- 20260806120000_integrazione_rimuovi_ruolo_agente.sql
-- Rimuove il ruolo Postgres dedicato e il registro degli agenti.
--
-- PERCHE'. Per un giorno l'agente di sync doveva collegarsi direttamente al
-- database (ruolo `kommessa_sync`, policy RLS su misura). Scelta rivista: gli
-- agenti passano da un'**API HTTPS con token**. Le ragioni, in ordine di peso:
--
--  1. Con il collegamento diretto ogni cliente custodisce una credenziale del
--     nostro database di produzione — quello con i dati di TUTTI i tenant. Il
--     confinamento RLS regge finche' ogni tabella futura e' protetta bene: una
--     migration distratta fra sei mesi allarga il raggio d'azione. Un token
--     apre solo le rotte di integrazione, e non c'e' altro da rubare.
--  2. La porta Postgres e' spesso chiusa in uscita nelle reti aziendali; la 443
--     non lo e' mai. Con dieci clienti sarebbero dieci trattative con dieci
--     reparti IT.
--  3. Con l'API lo schema resta privato: si possono rinominare tabelle e
--     colonne senza rompere N agenti scritti in momenti diversi.
--
-- COSA RESTA. Tutto il resto della 20260805090000: le quattro tabelle, le
-- policy dell'app, il payload canonico. L'API e' uno strato sottile sopra le
-- stesse tabelle — cambia il tubo, non il progetto.
--
-- Le policy dell'app restano ristrette `TO authenticated` (introdotto dalla
-- 20260806090000): non serviva piu' a escludere l'agente, ma e' comunque giusto
-- che queste tabelle non siano raggiungibili da `anon`.
-- =====================================================================

drop policy if exists integrazione_outbox_agente_read       on public.integrazione_outbox;
drop policy if exists integrazione_outbox_agente_update     on public.integrazione_outbox;
drop policy if exists integrazione_staging_agente_write     on public.integrazione_staging;
drop policy if exists integrazione_esecuzioni_agente_read   on public.integrazione_esecuzioni;
drop policy if exists integrazione_esecuzioni_agente_insert on public.integrazione_esecuzioni;
drop policy if exists integrazione_esecuzioni_agente_update on public.integrazione_esecuzioni;
drop policy if exists integrazione_mappature_agente_read    on public.integrazione_mappature;
drop policy if exists integrazione_mappature_agente_insert  on public.integrazione_mappature;
drop policy if exists integrazione_mappature_agente_update  on public.integrazione_mappature;

drop policy if exists integrazione_agenti_self_read           on public.integrazione_agenti;
drop policy if exists integrazione_agenti_platform_admin_read on public.integrazione_agenti;
drop table if exists public.integrazione_agenti;

-- Il ruolo esiste solo se la 20260806090000 e' passata su questo database.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'kommessa_sync') then
    revoke all on public.integrazione_outbox     from kommessa_sync;
    revoke all on public.integrazione_staging    from kommessa_sync;
    revoke all on public.integrazione_esecuzioni from kommessa_sync;
    revoke all on public.integrazione_mappature  from kommessa_sync;
    revoke usage on schema public from kommessa_sync;
    drop role kommessa_sync;
  end if;
end
$$;
