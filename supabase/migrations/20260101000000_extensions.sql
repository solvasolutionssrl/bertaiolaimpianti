-- =====================================================================
-- 20260101000000_extensions.sql
-- Estensioni Postgres richieste dal prodotto impiantiXplus.
-- Idempotente: tutte le CREATE EXTENSION sono IF NOT EXISTS.
-- =====================================================================

-- Trigram index per ricerca fuzzy su filename / ragione_sociale / codici
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

-- gen_random_uuid() (preferito ai default uuid_generate_v4 di uuid-ossp)
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- unaccent: normalizzazione accenti per ricerca testuale italiana
CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA extensions;

-- citext: case-insensitive text (slug tenant, email)
CREATE EXTENSION IF NOT EXISTS citext WITH SCHEMA extensions;
