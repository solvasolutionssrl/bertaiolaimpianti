-- ============================================================
-- Si ritirano due tipi di avviso che non possono piu' accadere
-- ============================================================
-- `fase_target_raggiunto` e `fase_zero_foto` dipendevano dal conteggio foto
-- per singola fase (`commessa_voci.foto_caricate_count`), che si incrementa
-- solo quando un media viene caricato **con la fase indicata**. Il campo
-- «Fase» e' stato tolto dal caricamento il 07/10/2026, perche' in produzione
-- non era mai stato compilato: `file_refs.voce_id` valorizzato su 0 file su
-- 346.
--
-- Erano morti anche prima: `min_foto_richieste > 0` su 0 righe su 2650,
-- notifiche di quei due tipi mai inviate (0), e la Edge Function che li
-- gestiva senza nessun chiamante ne' cron.
--
-- Finche' restano in `notification_event_types` continuano a comparire in
-- qualunque pannello delle preferenze: due interruttori per cose che non
-- arriveranno mai. Si toglie la riga, non la colonna.
--
-- ⚠️ VERIFICATO PRIMA: 0 righe in `notifiche` con quei tipi, 3 righe in
-- `notification_preferences` su 6 totali (scelte fatte da qualcuno su eventi
-- che non accadono: si cancellano con il tipo).
--
-- Idempotente: due delete per chiave.
-- ============================================================

delete from public.notification_preferences
 where event_code in ('fase_target_raggiunto', 'fase_zero_foto');

delete from public.notification_event_types
 where code in ('fase_target_raggiunto', 'fase_zero_foto');
