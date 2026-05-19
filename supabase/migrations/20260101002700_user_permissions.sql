-- ============================================================
-- user_permissions: sistema permessi granulari per utente
-- ============================================================
-- Ogni utente ha permessi di default dal proprio ruolo.
-- La colonna `permissions` (JSONB) contiene override per-utente
-- impostabili da owner/admin/platform_admin.
--
-- Struttura JSONB permissions:
-- {
--   "commesse":    "none" | "view" | "edit" | "full",
--   "clienti":     "none" | "view" | "edit" | "full",
--   "ticket":      "none" | "view" | "create" | "full",
--   "turni":       "none" | "own" | "team" | "approve",
--   "documenti":   "none" | "view" | "upload" | "full",
--   "utenti":      "none" | "view" | "invite" | "full",
--   "statistiche": "none" | "aggregati" | "dettaglio" | "export"
-- }
-- Campi assenti = usa il default del ruolo.
-- ============================================================

alter table public.users
  add column if not exists permissions jsonb default null;

-- -------------------------------------------------------
-- Default permessi per ruolo (usati come fallback)
-- -------------------------------------------------------
create or replace function public.role_default_permissions(p_role app_role)
returns jsonb
language sql
immutable
as $$
  select case p_role
    when 'owner' then jsonb_build_object(
      'commesse',    'full',
      'clienti',     'full',
      'ticket',      'full',
      'turni',       'approve',
      'documenti',   'full',
      'utenti',      'full',
      'statistiche', 'export'
    )
    when 'admin' then jsonb_build_object(
      'commesse',    'full',
      'clienti',     'full',
      'ticket',      'full',
      'turni',       'approve',
      'documenti',   'full',
      'utenti',      'invite',
      'statistiche', 'export'
    )
    when 'office' then jsonb_build_object(
      'commesse',    'edit',
      'clienti',     'edit',
      'ticket',      'create',
      'turni',       'own',
      'documenti',   'upload',
      'utenti',      'none',
      'statistiche', 'aggregati'
    )
    when 'capo' then jsonb_build_object(
      'commesse',    'edit',
      'clienti',     'view',
      'ticket',      'create',
      'turni',       'team',
      'documenti',   'upload',
      'utenti',      'none',
      'statistiche', 'aggregati'
    )
    when 'tecnico' then jsonb_build_object(
      'commesse',    'view',
      'clienti',     'none',
      'ticket',      'none',
      'turni',       'own',
      'documenti',   'view',
      'utenti',      'none',
      'statistiche', 'none'
    )
    when 'cliente' then jsonb_build_object(
      'commesse',    'none',
      'clienti',     'none',
      'ticket',      'none',
      'turni',       'none',
      'documenti',   'none',
      'utenti',      'none',
      'statistiche', 'none'
    )
    else jsonb_build_object(
      'commesse',    'none',
      'clienti',     'none',
      'ticket',      'none',
      'turni',       'none',
      'documenti',   'none',
      'utenti',      'none',
      'statistiche', 'none'
    )
  end;
$$;

-- -------------------------------------------------------
-- Effective permissions: merge default + override per-utente
-- -------------------------------------------------------
create or replace function public.get_effective_permissions(
  p_role app_role,
  p_overrides jsonb
)
returns jsonb
language sql
immutable
as $$
  select role_default_permissions(p_role) || coalesce(p_overrides, '{}'::jsonb);
$$;

-- View comoda per il frontend: un record per utente con permessi effettivi
create or replace view public.users_with_permissions as
select
  u.id,
  u.tenant_id,
  u.role,
  u.display_name,
  u.attivo,
  u.permissions as permission_overrides,
  get_effective_permissions(u.role, u.permissions) as effective_permissions
from public.users u;

-- RLS sulla view: solo platform_admin e owner/admin dello stesso tenant
-- (la view non ha RLS diretta — usa sicurezza della tabella users sottostante)
grant select on public.users_with_permissions to authenticated;

comment on column public.users.permissions is
  'Override permessi per-utente (JSONB). NULL = usa defaults del ruolo. Struttura: {commesse, clienti, ticket, turni, documenti, utenti, statistiche}.';
