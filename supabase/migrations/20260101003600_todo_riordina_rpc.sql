-- =====================================================================
-- 20260101003600_todo_riordina_rpc.sql
--
-- RPC atomica per il riordino dei TODO di una commessa: aggiorna
-- sort_order di una lista di id in UNA SOLA query (UPDATE ... FROM
-- (VALUES...)), invece di N UPDATE in sequenza.
--
-- Garantisce:
--   - tutti gli UPDATE riescono o nessuno (transazione implicita)
--   - tutti gli id devono appartenere alla stessa commessa (controllo
--     applicativo dentro la funzione)
--   - sort_order assegnato secondo l'ordine dell'array di input
--     (posizione 1-based)
--
-- Sicurezza: SECURITY INVOKER (default) → rispetta RLS della tabella
-- commessa_todo. Caller deve essere admin/office del tenant per via
-- delle policy `commessa_todo_update_full` / `commessa_todo_update_tecnico`
-- (questa funzione modifica solo sort_order, ma RLS valuta il role
-- comunque — tecnico viene bloccato dal trigger guard introdotto in
-- 20260101003500).
-- =====================================================================

CREATE OR REPLACE FUNCTION public.commessa_todo_riordina(
  p_commessa_id uuid,
  p_ids uuid[]
)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  updated_count integer;
BEGIN
  IF p_ids IS NULL OR array_length(p_ids, 1) IS NULL THEN
    RETURN 0;
  END IF;

  WITH ordered AS (
    SELECT id, ord
    FROM unnest(p_ids) WITH ORDINALITY AS t(id, ord)
  )
  UPDATE public.commessa_todo ct
  SET sort_order = ordered.ord
  FROM ordered
  WHERE ct.id = ordered.id
    AND ct.commessa_id = p_commessa_id;

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END
$$;

COMMENT ON FUNCTION public.commessa_todo_riordina(uuid, uuid[]) IS
  'Aggiorna sort_order di una lista di TODO in unica query atomica. Ritorna il numero di righe aggiornate.';
