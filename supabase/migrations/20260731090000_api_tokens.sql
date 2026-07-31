-- =====================================================================
-- 20260731090000_api_tokens.sql
-- Token di accesso per integrazioni esterne senza sessione browser.
--
-- Nasce per il comando iOS "Carica su Kommessa" (menu Condividi dell'app
-- Foto): gli Shortcut non condividono i cookie di Safari, quindi servono
-- credenziali proprie. Il token e' PERSONALE (un utente, un tenant), ha uno
-- scope ristretto e si revoca in un istante dal pannello super admin.
--
-- Regole di sicurezza:
--  * in tabella finisce solo lo SHA-256 del token, mai il valore in chiaro:
--    chi legge il DB non puo' risalire alla credenziale;
--  * RLS attiva SENZA policy → nessun accesso da `anon`/`authenticated`.
--    Si legge e scrive esclusivamente con la service role (server-side),
--    come per gli altri segreti (vedi hardening `tenants` del 27/06);
--  * `revoked_at` valorizzato = token morto all'istante (telefono smarrito).
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.api_tokens (
  id            uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  -- Utente per conto del quale il token agisce: i file caricati risultano suoi.
  user_id       uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  -- Etichetta leggibile ("iPhone di Luca") per riconoscerlo nell'elenco.
  label         text NOT NULL,
  -- SHA-256 esadecimale del token in chiaro. UNIQUE = lookup diretto in login.
  token_hash    text NOT NULL UNIQUE,
  -- Permessi concessi. Oggi solo 'upload' (elenco commesse + invio file).
  scopes        text[] NOT NULL DEFAULT ARRAY['upload']::text[],
  last_used_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  created_by    uuid REFERENCES public.users(id) ON DELETE SET NULL,
  revoked_at    timestamptz
);

CREATE INDEX IF NOT EXISTS api_tokens_tenant_idx
  ON public.api_tokens(tenant_id, created_at DESC);
-- Lookup del login: solo i token vivi.
CREATE INDEX IF NOT EXISTS api_tokens_attivi_idx
  ON public.api_tokens(token_hash)
  WHERE revoked_at IS NULL;

ALTER TABLE public.api_tokens ENABLE ROW LEVEL SECURITY;

-- Nessuna policy, e privilegi revocati: la tabella e' raggiungibile SOLO
-- dalla service role. Il token e' una credenziale, non un dato di dominio.
REVOKE ALL ON public.api_tokens FROM anon, authenticated;

COMMENT ON TABLE public.api_tokens IS
  'Token personali per integrazioni esterne (comando iOS "Carica su Kommessa"). Solo hash, solo service role, revocabili.';
