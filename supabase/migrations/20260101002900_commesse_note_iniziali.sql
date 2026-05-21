-- =====================================================================
-- 20260101002900_commesse_note_iniziali.sql
-- Nuovo campo `commesse.note_iniziali`: trascrizione completa della
-- prima nota dettata dal capo durante la creazione commessa.
--
-- Distinto da:
--  - descrizione_ai_proposta : output Claude raw (oggi sempre NULL)
--  - descrizione_ai_finale   : tagline editata, usata nel nome cartella
--  - note_iniziali           : trascrizione completa (verità sacrosanta)
--
-- Editabile dagli admin via UI dedicata.
-- =====================================================================

ALTER TABLE public.commesse
  ADD COLUMN IF NOT EXISTS note_iniziali text;

COMMENT ON COLUMN public.commesse.note_iniziali IS
  'Trascrizione completa della prima nota dettata dal capo durante la creazione (voice intake). Visualizzata come "Dettagli" sulla card commessa. Editabile dagli admin.';
