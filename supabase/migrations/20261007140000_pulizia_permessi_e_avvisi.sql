-- ============================================================
-- Si toglie cio' che prometteva e non faceva
-- ============================================================
-- Due pulizie, stessa forma: strutture che esistono, si possono interrogare, e
-- non cambiano niente.
--
-- ## 1. Il vecchio sistema di permessi
--
-- `role_default_permissions()`, `get_effective_permissions()` e la vista
-- `users_with_permissions` nascono con la migration `20260101002700` per un
-- sistema a **sette aree per quattro livelli**. In produzione: zero utenti su
-- cinquantaquattro con un override, zero letture dal codice, zero policy che
-- le usino. L'unica cosa viva di quella migration e' la **colonna**
-- `users.permissions`, che dal 07/10/2026 contiene i poteri nuovi
-- (`{"capo_squadra": true}`) — quella resta, e non si tocca.
--
-- ⚠️ L'ordine conta: la vista dipende da `get_effective_permissions`, che
-- dipende da `role_default_permissions`. Si smonta dall'alto.
--
-- ## 2. Quattro tipi di avviso senza mittente
--
-- `ticket_assigned`, `ticket_created` e `dico_mancante` erano inviati solo
-- dalla Edge Function `notify-event`, che **non ha mai avuto un chiamante** —
-- nessun `functions.invoke`, nessun `net.http_post`, nessun cron — ed e' stata
-- rimossa oggi. `intervento_oggi` non ha mai avuto un mittente nemmeno in
-- teoria: non compare da nessuna parte nel codice.
--
-- Finche' restano in tabella sono interruttori per cose che non accadono. Si
-- toglie la riga, non la colonna: `notifiche.type` resta testo libero e nessuna
-- chiave esterna lo vincola, quindi una riga storica con quei tipi continua a
-- leggersi.
--
-- ⚠️ `commessa_assegnata`, `todo_assegnato`, `pianificazione_pubblicata`,
-- `permesso_richiesto` e `permesso_esito` **restano**: hanno un mittente vivo.
--
-- Idempotente: drop if exists e delete per chiave.
-- ============================================================

-- ── 1. Il vecchio sistema di permessi ───────────────────────────────────────
drop view if exists public.users_with_permissions;
drop function if exists public.get_effective_permissions(public.app_role, jsonb);
drop function if exists public.role_default_permissions(public.app_role);

comment on column public.users.permissions is
  'Poteri in piu'' di quelli del ruolo, booleani piatti: {"capo_squadra": true}. Letta da @kommessa/api/capacita. Protetta dal trigger users_proteggi_privilegi: non si cambia dall''app.';

-- ── 2. Gli avvisi senza mittente ────────────────────────────────────────────
delete from public.notification_preferences
 where event_code in ('ticket_assigned', 'ticket_created', 'dico_mancante', 'intervento_oggi');

delete from public.notification_event_types
 where code in ('ticket_assigned', 'ticket_created', 'dico_mancante', 'intervento_oggi');
