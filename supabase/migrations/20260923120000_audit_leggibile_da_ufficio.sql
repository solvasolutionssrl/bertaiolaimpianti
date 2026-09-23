-- =====================================================================
-- Il registro delle modifiche lo legge anche l'ufficio.
--
-- Finora `audit_events` era leggibile solo da `owner` e `admin`. Ma le
-- domande a cui il registro serve a rispondere ("chi ha modificato le ore
-- del cantiere X il mese scorso?", "chi ha cambiato quel costo orario?")
-- se le pone chi sta in ufficio tutto il giorno, che oggi non poteva
-- vedere niente: l'unico occhio completo era il super admin di
-- piattaforma, fuori dall'azienda.
--
-- ⚠️ Si allarga SOLO a `office`, non a `tecnico`. L'ufficio vede gia'
-- costi orari e paghe nelle sue pagine, quindi il registro non gli mostra
-- niente di nuovo, solo chi le ha toccate. Il tecnico invece vedrebbe
-- dati di tutti i colleghi che altrove non gli sono mai mostrati.
--
-- Il log resta **immutabile**: nessuna policy di UPDATE o DELETE, come
-- prima. Un registro correggibile non e' un registro.
--
-- Idempotente: applicabile piu' volte senza danni.
-- =====================================================================

DROP POLICY IF EXISTS audit_events_read ON public.audit_events;

CREATE POLICY audit_events_read ON public.audit_events
  FOR SELECT
  USING (tenant_id = public.current_tenant_id()
         AND public.current_role() IN ('owner','admin','office'));
