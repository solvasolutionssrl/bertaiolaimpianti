-- ============================================================
-- Le preferenze degli avvisi: una sola risposta alla stessa domanda
-- ============================================================
-- L'08/10/2026 le notifiche push vengono collegate per la prima volta
-- (c'erano l'invio e il service worker, mancava un client che potesse
-- sottoscriversi). Collegandole, il mittente unico `avvisa()` ha iniziato a
-- leggere `notification_preferences` — e si e' scoperto che alla domanda
-- «questa persona vuole questo avviso sul telefono?» il sistema sapeva
-- rispondere in **due modi diversi**:
--
--   1. la vista `notification_preferences_effective`, che unisce la scelta
--      della persona al predefinito GLOBALE di `notification_event_types`;
--   2. il nuovo `pushAttiva` di `@kommessa/api/avvisi`, che la unisce al
--      predefinito **del mestiere**.
--
-- Non sono equivalenti, e la differenza non e' teorica: con un predefinito
-- solo per tutti, a un tecnico arriverebbero sul telefono le richieste di
-- permesso da approvare, che non puo' approvare. Il predefinito dipende dal
-- mestiere, e il mestiere si sa — non e' una preferenza da scoprire.
--
-- Due risposte alla stessa domanda sono peggio di nessuna: la prima che
-- qualcuno trova diventa quella giusta per sbaglio. Si tiene quella che
-- qualcuno legge davvero, e l'altra si toglie.
--
-- ⚠️ La **tabella** `notification_event_types` RESTA, e non e' un residuo:
-- `notification_preferences.event_code` ha una chiave esterna verso di lei,
-- ed e' quella chiave che impedisce di scriversi in tabella la preferenza di
-- un avviso che non esiste. Restano anche le righe: sono il vocabolario dei
-- cinque avvisi veri. Quello che non si legge piu' sono le sue colonne
-- `default_*`, e il commento qui sotto lo dice a chi le trovera'.
--
-- Idempotente: drop ... if exists.
-- ============================================================

-- ── 1. La vista con la seconda verita' ──────────────────────────────────────
drop view if exists public.notification_preferences_effective;

-- ── 2. Dove sta la verita' adesso ───────────────────────────────────────────
comment on table public.notification_event_types is
  'Vocabolario degli avvisi. Serve ancora per la chiave esterna di notification_preferences.event_code: e'' cio'' che impedisce di salvare la preferenza di un avviso inesistente. ⚠️ Le colonne default_in_app / default_push / default_email NON sono piu'' lette da nessuno: il predefinito dipende dal mestiere e sta in @kommessa/api/avvisi (AVVISI[].pushPredefinita + ruoli). Aggiungendo un avviso: prima la riga di codice che lo manda, poi la voce nel modulo, poi questa riga.';

comment on table public.notification_preferences is
  'Cosa ha scelto una persona, per avviso. Solo la colonna `push` e'' letta: la decide la pagina /mobile/profilo/notifiche e la rispetta avvisa(). ⚠️ `in_app` ed `email` non sono lette: l''avviso in app e'' il registro di cosa e'' successo e si scrive sempre, e nessuna riga di codice manda email di avviso. Una riga assente significa «non ha scelto» e vale il predefinito del mestiere.';

comment on column public.users.quiet_hours_start is
  '⚠️ NON letta da nessuna riga di codice dall''08/10/2026, e NULL su tutti gli utenti: le ore di silenzio erano governate dalla rotta /api/push/send-internal, che non ha mai avuto chiamanti ed e'' stata rimossa. La colonna resta perche'' e'' inerte; se un giorno si vuole il silenzio notturno, il posto dove leggerla e'' avvisa().';

comment on column public.users.quiet_hours_end is
  'Vedi quiet_hours_start: non letta.';

-- ── 3. Preferenze rimaste orfane ────────────────────────────────────────────
-- La pulizia del 07/10 ha cancellato quattro tipi di avviso senza mittente e
-- con loro le relative preferenze. Questa riga non ha niente da fare oggi:
-- c'e' perche' la stessa migration, rieseguita dopo che qualcuno avra'
-- ritirato un altro avviso, non lasci caselle che governano il nulla.
delete from public.notification_preferences p
 where not exists (
   select 1 from public.notification_event_types t where t.code = p.event_code
 );
