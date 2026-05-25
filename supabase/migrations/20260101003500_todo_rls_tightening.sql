-- =====================================================================
-- 20260101003500_todo_rls_tightening.sql
--
-- Hardening della migration 20260101003400:
--   1. RLS commessa_todo_update: il tecnico può aggiornare SOLO lo stato
--      (e completato_at/completato_da, gestiti dal trigger). Tentativi di
--      modificare titolo/descrizione/priorita/assegnato_a da una sessione
--      tecnico vengono rigettati dal database, non solo dal server action.
--   2. Trigger commessa_todo_touch ora gira anche su INSERT — gestisce il
--      caso (raro) di insert con stato='completato' senza completato_at.
--   3. Audit lato server actions: già migrato a entity_type='commessa' (col
--      todo_id/riunione_id in metadata) → cronologia tab li include.
-- =====================================================================

-- ─── 1. Tecnico può aggiornare solo stato ───────────────────────────
-- Strategia: due policy update separate. Una per admin/office (full) e
-- una per tecnico che verifica via WITH CHECK che le colonne "sensibili"
-- non siano cambiate rispetto al record esistente.
DROP POLICY IF EXISTS commessa_todo_update ON public.commessa_todo;

CREATE POLICY commessa_todo_update_full ON public.commessa_todo
  FOR UPDATE
  USING (
    tenant_id = public.current_tenant_id()
    AND public.current_role() IN ('admin'::public.app_role, 'office'::public.app_role)
  )
  WITH CHECK (
    tenant_id = public.current_tenant_id()
    AND public.current_role() IN ('admin'::public.app_role, 'office'::public.app_role)
  );

-- Tecnico: USING permette di puntare alla riga (deve essere del suo tenant)
-- ma WITH CHECK impedisce di cambiare campi diversi da stato.
-- Usiamo una funzione helper per leggere il "vecchio" via OLD/NEW (Postgres
-- WITH CHECK confronta solo NEW; per fare un confronto con OLD serve un
-- BEFORE UPDATE trigger). Risolviamo con trigger.
CREATE POLICY commessa_todo_update_tecnico ON public.commessa_todo
  FOR UPDATE
  USING (
    tenant_id = public.current_tenant_id()
    AND public.current_role() = 'tecnico'::public.app_role
  )
  WITH CHECK (
    tenant_id = public.current_tenant_id()
    AND public.current_role() = 'tecnico'::public.app_role
  );

-- Trigger BEFORE UPDATE: se ruolo=tecnico e ha modificato campi diversi da
-- stato/completato_*/updated_at → RAISE EXCEPTION.
CREATE OR REPLACE FUNCTION public.commessa_todo_tecnico_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  role public.app_role;
BEGIN
  -- Solo se la sessione corrente è di un tecnico
  role := public.current_role();
  IF role IS NULL OR role <> 'tecnico'::public.app_role THEN
    RETURN NEW;
  END IF;

  -- Campi che il tecnico NON può cambiare
  IF NEW.titolo       IS DISTINCT FROM OLD.titolo       THEN RAISE EXCEPTION 'Tecnico: titolo non modificabile';        END IF;
  IF NEW.descrizione  IS DISTINCT FROM OLD.descrizione  THEN RAISE EXCEPTION 'Tecnico: descrizione non modificabile';   END IF;
  IF NEW.priorita     IS DISTINCT FROM OLD.priorita     THEN RAISE EXCEPTION 'Tecnico: priorita non modificabile';      END IF;
  IF NEW.assegnato_a  IS DISTINCT FROM OLD.assegnato_a  THEN RAISE EXCEPTION 'Tecnico: assegnazione non modificabile';  END IF;
  IF NEW.scadenza_at  IS DISTINCT FROM OLD.scadenza_at  THEN RAISE EXCEPTION 'Tecnico: scadenza non modificabile';      END IF;
  IF NEW.sort_order   IS DISTINCT FROM OLD.sort_order   THEN RAISE EXCEPTION 'Tecnico: riordino non consentito';        END IF;
  IF NEW.commessa_id  IS DISTINCT FROM OLD.commessa_id  THEN RAISE EXCEPTION 'Tecnico: commessa non modificabile';      END IF;
  IF NEW.metadata     IS DISTINCT FROM OLD.metadata     THEN RAISE EXCEPTION 'Tecnico: metadata non modificabile';      END IF;
  -- annullato è un'azione admin/office only
  IF NEW.stato = 'annullato'::public.todo_stato AND OLD.stato IS DISTINCT FROM 'annullato'::public.todo_stato THEN
    RAISE EXCEPTION 'Tecnico: stato annullato riservato ad admin/office';
  END IF;

  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS commessa_todo_tecnico_guard_trg ON public.commessa_todo;
CREATE TRIGGER commessa_todo_tecnico_guard_trg
  BEFORE UPDATE ON public.commessa_todo
  FOR EACH ROW
  EXECUTE FUNCTION public.commessa_todo_tecnico_guard();

-- ─── 2. Touch trigger anche su INSERT ──────────────────────────────
CREATE OR REPLACE FUNCTION public.commessa_todo_touch()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- INSERT: se nasce come 'completato', popola completato_at automaticamente
    -- (così il CHECK constraint passa).
    NEW.updated_at := COALESCE(NEW.updated_at, now());
    IF NEW.stato = 'completato' AND NEW.completato_at IS NULL THEN
      NEW.completato_at := now();
      NEW.completato_da := COALESCE(NEW.completato_da, auth.uid());
    ELSIF NEW.stato <> 'completato' AND NEW.completato_at IS NOT NULL THEN
      -- difensivo: stato non completato ma completato_at presente → nulla
      NEW.completato_at := NULL;
      NEW.completato_da := NULL;
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE (comportamento precedente, immutato)
  NEW.updated_at := now();
  IF NEW.stato = 'completato' AND OLD.stato IS DISTINCT FROM 'completato' THEN
    NEW.completato_at := COALESCE(NEW.completato_at, now());
    NEW.completato_da := COALESCE(NEW.completato_da, auth.uid());
  ELSIF NEW.stato <> 'completato' AND OLD.stato = 'completato' THEN
    NEW.completato_at := NULL;
    NEW.completato_da := NULL;
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS commessa_todo_touch_trg ON public.commessa_todo;
CREATE TRIGGER commessa_todo_touch_trg
  BEFORE INSERT OR UPDATE ON public.commessa_todo
  FOR EACH ROW
  EXECUTE FUNCTION public.commessa_todo_touch();
