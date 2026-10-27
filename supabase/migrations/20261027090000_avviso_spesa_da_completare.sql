-- ─────────────────────────────────────────────────────────────────────────────
-- L'avviso «Scontrino da completare» nel catalogo degli eventi di notifica.
--
-- La chiave esterna da `notification_preferences` impedisce di salvare la
-- preferenza di un avviso che non esiste: la voce va qui PRIMA che qualcuno
-- possa spegnerla. Le colonne `default_*` non si leggono piu' (vedi
-- 20261008100000): il predefinito vero sta in `@kommessa/api/avvisi`.
--
-- Idempotente: `on conflict do nothing`.
-- ─────────────────────────────────────────────────────────────────────────────
insert into public.notification_event_types (code, label, description, default_in_app, default_push, default_email, critical, ordine)
values (
  'spesa_da_completare',
  'Scontrino da completare',
  'La lettura automatica dello scontrino non e'' riuscita: i dati vanno messi a mano.',
  true, true, false, false, 70
)
on conflict (code) do nothing;
