-- =====================================================================
-- 20260608000000_commessa_bozze.sql
-- Bozze di commessa con autosave offline-first.
--
-- Una bozza e' uno stato intermedio PRIMA che la commessa diventi
-- ufficiale: nasce al primo contenuto reale (prima dettatura AI o primo
-- campo), viene salvata di continuo (client IndexedDB + sync server), e
-- diventa una commessa vera solo alla finalizzazione esplicita.
--
-- Design (vedi docs/superpowers/specs/2026-06-08-bozze-autosave-commesse-design.md):
--  - Tabella DEDICATA, isolata da `commesse`: la tabella commesse resta
--    "solo commesse vere" (nessuna query/conteggio/kanban da toccare).
--  - Numero bozza separato e per-tenant (buchi ammessi: le bozze sono
--    effimere). Il codice ufficiale gapless e' assegnato solo alla
--    finalizzazione da genera_codice_commessa().
--  - File: durante la bozza vanno su R2 staging legati a bozza_id; alla
--    finalizzazione l'oggetto R2 viene spostato nella cartella vera e poi
--    sincronizzato su Nextcloud.
--  - Visibilita': solo autore (created_by) + super admin SOLVA.
-- =====================================================================

-- ----- Tabella commessa_bozze -------------------------------------------
CREATE TABLE IF NOT EXISTS public.commessa_bozze (
  id              uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  created_by      uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  numero_bozza    integer,                                  -- assegnato al primo sync server (per-tenant, buchi ammessi)
  payload         jsonb NOT NULL DEFAULT '{}'::jsonb,        -- stato completo del form (cliente, voci, descrizione, note/transcript, referenti, ...)
  stato           text NOT NULL DEFAULT 'attiva'            -- attiva | finalizzata
                    CHECK (stato IN ('attiva', 'finalizzata')),
  commessa_id     uuid REFERENCES public.commesse(id) ON DELETE SET NULL, -- popolato alla finalizzazione
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  last_synced_at  timestamptz
);

CREATE INDEX IF NOT EXISTS commessa_bozze_tenant_idx
  ON public.commessa_bozze(tenant_id);
-- Elenco "Da completare" dell'autore: bozze attive piu' recenti prima.
CREATE INDEX IF NOT EXISTS commessa_bozze_autore_attive_idx
  ON public.commessa_bozze(created_by, updated_at DESC)
  WHERE stato = 'attiva';
-- Cron purge: bozze attive non toccate da X giorni.
CREATE INDEX IF NOT EXISTS commessa_bozze_purge_idx
  ON public.commessa_bozze(updated_at)
  WHERE stato = 'attiva';

DROP TRIGGER IF EXISTS trg_commessa_bozze_updated_at ON public.commessa_bozze;
CREATE TRIGGER trg_commessa_bozze_updated_at
  BEFORE UPDATE ON public.commessa_bozze
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

COMMENT ON TABLE public.commessa_bozze IS
  'Bozze di commessa (stato intermedio pre-ufficializzazione). Autosave offline-first: il client (IndexedDB) e'' la verita'' locale, questa tabella e'' il mirror server per durabilita'' + cross-device + super admin. Alla finalizzazione si materializza una riga in commesse e la bozza passa a stato=finalizzata.';
COMMENT ON COLUMN public.commessa_bozze.payload IS
  'Stato completo del form in JSONB: { clienteId?, clienteNew?, voci[], descrizioneFinale, noteIniziali, indirizzoCantiere, referenti[], presetId, transcript? }. Schema applicativo, evolvibile senza migration.';
COMMENT ON COLUMN public.commessa_bozze.numero_bozza IS
  'Progressivo per-tenant assegnato al primo sync server. Buchi ammessi (bozze abbandonate). NON e'' il codice commessa: quello e'' gapless e nasce alla finalizzazione.';

-- ----- Counter per-tenant per numero bozza ------------------------------
CREATE TABLE IF NOT EXISTS public.bozza_counter (
  tenant_id   uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  ultimo_num  integer NOT NULL DEFAULT 0
);

ALTER TABLE public.bozza_counter ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bozza_counter FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bozza_counter_tenant_scope ON public.bozza_counter;
CREATE POLICY bozza_counter_tenant_scope ON public.bozza_counter
  FOR SELECT
  USING (tenant_id = public.current_tenant_id());

COMMENT ON TABLE public.bozza_counter IS
  'Progressivo per-tenant per numero_bozza. Atomico via genera_numero_bozza(). Gap ammessi.';

CREATE OR REPLACE FUNCTION public.genera_numero_bozza(p_tenant_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_num integer;
BEGIN
  INSERT INTO public.bozza_counter (tenant_id, ultimo_num)
       VALUES (p_tenant_id, 1)
  ON CONFLICT (tenant_id)
       DO UPDATE SET ultimo_num = public.bozza_counter.ultimo_num + 1
  RETURNING ultimo_num INTO v_num;
  RETURN v_num;
END;
$$;

COMMENT ON FUNCTION public.genera_numero_bozza IS
  'Restituisce il prossimo numero_bozza per-tenant (atomico). Gap ammessi.';

-- ----- RLS commessa_bozze: solo autore + super admin --------------------
ALTER TABLE public.commessa_bozze ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commessa_bozze FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS commessa_bozze_autore ON public.commessa_bozze;
-- L'autore gestisce solo le proprie bozze, nel proprio tenant.
CREATE POLICY commessa_bozze_autore ON public.commessa_bozze
  FOR ALL
  USING (tenant_id = public.current_tenant_id() AND created_by = auth.uid())
  WITH CHECK (tenant_id = public.current_tenant_id() AND created_by = auth.uid());

DROP POLICY IF EXISTS commessa_bozze_platform_admin_read ON public.commessa_bozze;
-- Super admin SOLVA: sola lettura cross-tenant (supporto/debug).
CREATE POLICY commessa_bozze_platform_admin_read ON public.commessa_bozze
  FOR SELECT
  USING (public.is_platform_admin());

-- ----- file_refs: aggancio a una bozza ----------------------------------
-- Un file durante la bozza ha bozza_id valorizzato e commessa_id NULL
-- (staging R2, NON sincronizzato su Nextcloud). Alla finalizzazione la
-- riga viene "ri-agganciata": bozza_id->NULL, commessa_id-><vero>.
ALTER TABLE public.file_refs
  ADD COLUMN IF NOT EXISTS bozza_id uuid REFERENCES public.commessa_bozze(id) ON DELETE CASCADE;

-- commessa_id non e' piu' obbligatorio: i file di bozza ne sono privi
-- finche' la commessa non viene materializzata.
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='file_refs' AND table_schema='public'
      AND column_name='commessa_id' AND is_nullable='NO'
  ) THEN
    ALTER TABLE public.file_refs ALTER COLUMN commessa_id DROP NOT NULL;
  END IF;
END $$;

-- Invariante: ogni file appartiene a una commessa OPPURE a una bozza.
ALTER TABLE public.file_refs
  DROP CONSTRAINT IF EXISTS file_refs_commessa_o_bozza_chk;
ALTER TABLE public.file_refs
  ADD CONSTRAINT file_refs_commessa_o_bozza_chk
  CHECK (commessa_id IS NOT NULL OR bozza_id IS NOT NULL);

-- Index per elencare i file staged di una bozza.
CREATE INDEX IF NOT EXISTS file_refs_bozza_idx
  ON public.file_refs(bozza_id)
  WHERE bozza_id IS NOT NULL;

COMMENT ON COLUMN public.file_refs.bozza_id IS
  'Se valorizzato: file in staging R2 legato a una bozza, NON ancora sincronizzato su Nextcloud. Alla finalizzazione viene azzerato e commessa_id valorizzato.';

-- ----- Purge bozze abbandonate (rows-only) ------------------------------
-- Elimina le bozze ATTIVE non toccate da p_giorni giorni. Il CASCADE su
-- file_refs.bozza_id rimuove le righe dei file staged. La cancellazione
-- FISICA degli oggetti R2 di staging e' fatta dall'endpoint applicativo
-- /api/cron/purge-bozze (SQL non puo' parlare con R2): la cron chiama
-- prima l'endpoint (che cancella R2) e questo come backstop per le righe.
CREATE OR REPLACE FUNCTION public.purge_bozze_scadute(p_giorni integer DEFAULT 30)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer := 0;
BEGIN
  WITH deleted AS (
    DELETE FROM public.commessa_bozze
     WHERE stato = 'attiva'
       AND updated_at < now() - make_interval(days => p_giorni)
    RETURNING 1
  )
  SELECT count(*) INTO v_count FROM deleted;
  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION public.purge_bozze_scadute IS
  'Elimina bozze attive non toccate da p_giorni (default 30). CASCADE pulisce file_refs. Gli oggetti R2 di staging vanno cancellati prima via /api/cron/purge-bozze.';
