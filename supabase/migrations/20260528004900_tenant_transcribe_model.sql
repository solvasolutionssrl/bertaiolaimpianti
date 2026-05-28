-- =====================================================================
-- 20260528004900_tenant_transcribe_model.sql
--
-- Permette al super admin di scegliere il modello di trascrizione audio
-- per ogni tenant. Override del valore di OPENAI_MODEL_TRANSCRIBE env.
--
-- Modelli supportati (al 28/05/2026):
--   - 'whisper-1'              → legacy OpenAI, $0.006/min, accuratezza base
--   - 'gpt-4o-mini-transcribe' → nuovo OpenAI, $0.003/min, ~22% meno errori,
--                                ottimo su audio cantiere
--   - 'gpt-4o-transcribe'      → top OpenAI, $0.006/min, max accuratezza
--
-- NULL = usa OPENAI_MODEL_TRANSCRIBE env (fallback piattaforma).
-- =====================================================================

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS transcribe_model text
    CHECK (
      transcribe_model IS NULL
      OR transcribe_model IN (
        'whisper-1',
        'gpt-4o-mini-transcribe',
        'gpt-4o-transcribe'
      )
    );

COMMENT ON COLUMN public.tenants.transcribe_model IS
  'Modello OpenAI per la trascrizione audio del tenant. Override di OPENAI_MODEL_TRANSCRIBE env. NULL = fallback piattaforma. Solo super admin può modificarlo.';

-- ----- Default per Bertaiola: gpt-4o-mini-transcribe ---------------------
-- Richiesta cliente: attivazione immediata del nuovo modello (più accurato
-- su audio cantiere E più economico del whisper-1).
UPDATE public.tenants
SET transcribe_model = 'gpt-4o-mini-transcribe'
WHERE slug = 'BER';
