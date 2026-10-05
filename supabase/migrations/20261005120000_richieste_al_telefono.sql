-- ============================================================================
-- 20261005120000_richieste_al_telefono.sql
--
-- LA RICHIESTA AL TELEFONO (mondo commesse).
--
-- L'ufficio risponde al telefono — «c'e' da cambiare la caldaia, signora Elena,
-- e' una Viessmann» — e oggi scrive un post-it che poi porta a mano a chi deve
-- occuparsene. Il flusso del prodotto, invece, parte dal SOPRALLUOGO: questo
-- momento sta a monte di tutto e non esisteva da nessuna parte.
--
-- Non e' una commessa: una commessa nasce dal sopralluogo e porta con se' un
-- codice interno bruciato da un contatore senza buchi e ~15 cartelle fisiche su
-- Nextcloud, roba irreversibile per una telefonata che a volte non diventa
-- niente.
--
-- E' invece **un task senza commessa**. La lista condivisa di cose da fare
-- esiste gia' (`commessa_todo`, pagina «Task»: stati, priorita', assegnatario,
-- scadenza, note, allegati, vista cross-commessa e «i miei task» sulla PWA):
-- l'unica cosa che le mancava era poter contenere qualcosa che non e' ancora un
-- lavoro. Quando il lavoro si concretizza, la richiesta **si aggancia** alla
-- commessa nuova invece di essere buttata: il post-it diventa la prima riga di
-- storia del lavoro.
--
-- La RLS di `commessa_todo` e' sempre stata **per tenant**, non per commessa,
-- quindi togliere il vincolo non apre nulla che non fosse gia' aperto.
--
-- Idempotente: rieseguibile a vuoto senza danni.
-- ============================================================================

-- ─── 1. Un task puo' non avere (ancora) una commessa ────────────────────────

ALTER TABLE public.commessa_todo ALTER COLUMN commessa_id DROP NOT NULL;

COMMENT ON COLUMN public.commessa_todo.commessa_id IS
  'Commessa di appartenenza. NULL = RICHIESTA: arrivata al telefono e non ancora diventata un lavoro. Si valorizza quando la richiesta viene convertita in commessa.';

-- ─── 2. I pochi dati che arrivano al telefono ───────────────────────────────
-- Chi chiama a volte e' in anagrafica e a volte no: si tiene il collegamento
-- quando c'e' (`cliente_id`) e il nome cosi' come e' stato detto quando non c'e'
-- (`cliente_testo`). I dettagli veri (indirizzo, partita IVA, referenti) li
-- chiede il form di creazione commessa al momento della conversione: al telefono
-- si scrive quello che si ha.

ALTER TABLE public.commessa_todo
  ADD COLUMN IF NOT EXISTS cliente_id uuid REFERENCES public.clienti(id) ON DELETE SET NULL;

ALTER TABLE public.commessa_todo
  ADD COLUMN IF NOT EXISTS cliente_testo text;

ALTER TABLE public.commessa_todo
  ADD COLUMN IF NOT EXISTS contatto text;

COMMENT ON COLUMN public.commessa_todo.cliente_id IS
  'Cliente in anagrafica, se chi ha chiamato c''era gia''.';
COMMENT ON COLUMN public.commessa_todo.cliente_testo IS
  'Il nome come e'' stato detto al telefono, quando il cliente NON e'' in anagrafica. Non si crea una riga in `clienti` per una telefonata: la si crea alla conversione in commessa.';
COMMENT ON COLUMN public.commessa_todo.contatto IS
  'Come richiamare: numero di telefono, o email. Testo libero, e'' quello che si scrive di fretta.';

-- Le richieste si cercano sempre come «quelle senza commessa»: indice parziale.
CREATE INDEX IF NOT EXISTS commessa_todo_richieste_idx
  ON public.commessa_todo(tenant_id, stato, created_at DESC)
  WHERE commessa_id IS NULL;

CREATE INDEX IF NOT EXISTS commessa_todo_cliente_idx
  ON public.commessa_todo(cliente_id)
  WHERE cliente_id IS NOT NULL;

-- ─── 3. Chi viene assegnato lo deve sapere ──────────────────────────────────
-- Assegnare un task finora scriveva solo su `audit_events`: nessuna notifica.
-- Un post-it digitale che non avvisa nessuno e' ancora un post-it.

INSERT INTO public.notification_event_types
  (code, label, description, default_in_app, default_push, default_email, critical, ordine)
VALUES
  ('todo_assegnato', 'Task assegnato a me',
   'Quando l''ufficio ti assegna un task o una richiesta arrivata al telefono.',
   true, true, false, false, 85)
ON CONFLICT (code) DO NOTHING;

-- ─── 4. PostgREST: ricarica la cache di schema ──────────────────────────────
NOTIFY pgrst, 'reload schema';
