-- ============================================================================
-- 20261005090000_limiti_upload_configurabili.sql
--
-- I limiti di un invio di media (quanti file, quanto pesa una foto / un video /
-- un PDF) diventano DATO su due livelli, invece di costanti scritte dentro il
-- componente di selezione:
--
--   1. default globale  -> public.platform_settings, riga 'limiti_upload'
--   2. override tenant  -> public.tenants.upload_config
--
-- Una chiave assente EREDITA il livello sopra, non azzera. Per questo la
-- colonna nasce a '{}' e il seed globale e' identico ai valori con cui l'app
-- gira oggi (col conteggio file portato da 30 a 50, deciso il 05/10/2026):
-- all'apply NESSUN tenant cambia comportamento.
--
-- I tetti tecnici restano nel codice (packages/api/src/limiti-upload.ts): sono
-- un paracadute contro il refuso, non una scelta di prodotto.
--
-- Idempotente: rieseguibile a vuoto senza danni.
-- ============================================================================

-- ─── 1. Impostazioni globali di piattaforma ─────────────────────────────────
-- Tabella chiave/valore a scope piattaforma (nessun tenant_id): qui ci finiscono
-- le IMPOSTAZIONI che valgono per tutti i clienti.
--
-- 🚫 **MAI UN SEGRETO QUI.** Chiavi API, token, password e webhook secret
-- restano in env. Questa tabella e' leggibile dagli utenti (serve: il selettore
-- file deve sapere cosa accetta), quindi ci mettiamo solo numeri e scelte che
-- un cliente puo' vedere senza danno. Un segreto messo qui sarebbe leggibile da
-- ogni utente di ogni tenant: esattamente la falla che la migration
-- 20260627010000 e' servita a chiudere su tenants.storage_config.
--
-- Modello dei privilegi copiato da public.plans: scrittura solo al super admin.

CREATE TABLE IF NOT EXISTS public.platform_settings (
  chiave      text PRIMARY KEY,
  valore      jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  uuid
);

COMMENT ON TABLE public.platform_settings IS
  'Impostazioni globali di piattaforma (nessun tenant). Scrittura: solo super admin. Riga ''limiti_upload'': i default dei limiti di invio media, sovrascrivibili per tenant da tenants.upload_config.';

ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;

-- Lettura PER CHIAVE, non `USING (true)`.
-- I limiti di upload non sono segreti e vanno letti da ogni utente (il server
-- li legge col client dell'utente per decidere cosa accetta il selettore file).
-- Ma questa e' una tabella chiave/valore generica, e un `USING (true)` qui
-- sarebbe una trappola per chi aggiunge la SECONDA riga: si troverebbe
-- leggibile da qualunque utente di qualunque tenant senza accorgersene.
-- Quindi si elenca cosa e' pubblico, e una chiave nuova nasce NON leggibile
-- finche' qualcuno non la aggiunge qui di proposito.
DROP POLICY IF EXISTS platform_settings_read ON public.platform_settings;
CREATE POLICY platform_settings_read ON public.platform_settings
  FOR SELECT
  USING (chiave IN ('limiti_upload'));

DROP POLICY IF EXISTS platform_settings_write_platform ON public.platform_settings;
CREATE POLICY platform_settings_write_platform ON public.platform_settings
  FOR ALL
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

-- ⚠️ Le privilegi di default di Supabase concedono a anon/authenticated anche
-- INSERT/UPDATE/DELETE su ogni tabella nuova di `public`. La RLS sopra basta a
-- fermarli, ma il privilegio non serve e non va lasciato aperto: si revoca
-- tutto e si ri-concede solo la lettura. Le scritture passano dal service role
-- (le action del super admin usano createServiceSupabase).
REVOKE ALL ON public.platform_settings FROM anon, authenticated;
GRANT SELECT ON public.platform_settings TO authenticated;
GRANT ALL ON public.platform_settings TO service_role;

-- ─── 2. Override per singolo tenant ─────────────────────────────────────────

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS upload_config jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.tenants.upload_config IS
  'Override per-tenant dei limiti di invio media: {maxFile, maxFotoMb, maxVideoMb, maxDocMb}. Chiave assente = eredita il default globale (platform_settings.limiti_upload). NON e'' un segreto: SELECT concesso sulla colonna.';

-- Obbligatorio per la migration di hardening 20260627010000: su public.tenants
-- il SELECT di tabella e' revocato e si concede colonna per colonna. Una
-- colonna NON segreta va concessa, altrimenti il client la vede sparire.
GRANT SELECT (upload_config) ON public.tenants TO anon, authenticated;

-- ─── 3. Audit: un evento di piattaforma non appartiene a nessun tenant ──────
-- `audit_events.tenant_id` era NOT NULL, quindi un cambio GLOBALE non poteva
-- essere tracciato: l'insert veniva rifiutato e l'errore moriva nel try/catch
-- best-effort di `auditPlatform` (supabase-js non solleva, ritorna {error}).
-- Risultato: il super admin cambiava un'impostazione valida per tutti i clienti
-- e in /admin/audit non compariva niente.
--
-- La pagina /admin/audit era GIA' scritta per questo caso (`tenant_id ?? 'PLATFORM'`):
-- mancava solo il permesso nello schema. Le policy gestiscono il NULL come si
-- deve: `audit_events_read` vuole `tenant_id = current_tenant_id()`, che con
-- NULL non combacia mai (nessun cliente vede gli eventi di piattaforma), mentre
-- `audit_events_platform_admin_read` passa da `is_platform_admin()` e li vede.
--
-- Rilassare un vincolo e' idempotente: rieseguirlo non fa niente.

ALTER TABLE public.audit_events ALTER COLUMN tenant_id DROP NOT NULL;

COMMENT ON COLUMN public.audit_events.tenant_id IS
  'Tenant a cui appartiene l''evento. NULL = evento di PIATTAFORMA (nessun cliente): lo scrive il super admin, lo legge solo lui, e /admin/audit lo mostra come PLATFORM.';

-- ─── 4. Seed del default globale ────────────────────────────────────────────
-- ON CONFLICT DO NOTHING: se la riga esiste gia' (riesecuzione, o valori gia'
-- cambiati a mano dal pannello) NON si tocca nulla.

INSERT INTO public.platform_settings (chiave, valore)
VALUES (
  'limiti_upload',
  jsonb_build_object(
    'maxFile',    50,
    'maxFotoMb',  25,
    'maxVideoMb', 500,
    'maxDocMb',   50
  )
)
ON CONFLICT (chiave) DO NOTHING;

-- ─── 5. PostgREST: ricarica la cache di schema ──────────────────────────────
-- Tabella nuova + colonna nuova: senza il reload, nella finestra prima che
-- l'event trigger di Supabase se ne accorga, le letture tornerebbero {error} e
-- l'app scivolerebbe sui valori di sicurezza senza dirlo.
NOTIFY pgrst, 'reload schema';
