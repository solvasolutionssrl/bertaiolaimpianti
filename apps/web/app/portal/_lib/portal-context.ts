import { redirect } from 'next/navigation';
import { createServerSupabase } from '@impiantixplus/api/server';

/**
 * Contesto runtime del portale cliente.
 *
 * Si differenzia dal `requireTenantContext` standard (riservato allo staff
 * del tenant) perché l'utente è un `external_users` con `role = 'cliente'`
 * e `external = true` nei custom claims JWT.
 *
 * Le query a valle assumono RLS attive sulle viste `portal_*` (vedi note
 * RLS in fondo al modulo).
 */
export interface PortalContext {
  /** UUID auth.users.id */
  authUserId: string;
  /** UUID del tenant (Bertaiola o futuri) */
  tenantId: string;
  /** Slug tenant (BER, ...) */
  tenantSlug: string;
  /** UUID di `clienti.id` — un cliente finale è sempre legato a un committente */
  clienteId: string;
  /** Email loggata via magic-link */
  email: string;
  /** Anagrafica brand tenant (header/footer) */
  tenant: {
    id: string;
    slug: string;
    nome: string;
    brandColor: string | null;
    logoUrl: string | null;
  };
  /** Anagrafica cliente loggato (ragione sociale visibile nell'header) */
  cliente: {
    id: string;
    ragioneSociale: string;
  };
}

/**
 * Recupera il contesto portale per la request corrente.
 * Reindirizza a `/login` se non autenticato o se l'utente non è esterno.
 */
export async function requirePortalContext(): Promise<PortalContext> {
  const supabase = createServerSupabase();
  const { data: userData, error } = await supabase.auth.getUser();
  if (error || !userData.user) {
    redirect('/login');
  }

  const user = userData.user;
  const claims = (user.app_metadata ?? {}) as Record<string, unknown>;
  const tenantId = (claims.tenant_id as string | undefined) ?? null;
  const tenantSlug = (claims.tenant_slug as string | undefined) ?? null;
  const clienteId = (claims.cliente_id as string | undefined) ?? null;
  const isExternal = claims.external === true;

  // Se mancano i claim (es. utente staff che è arrivato per sbaglio sul portale)
  // facciamo signOut + redirect login: il portale non è la loro casa.
  if (!isExternal || !tenantId || !tenantSlug || !clienteId) {
    await supabase.auth.signOut();
    redirect('/login');
  }

  // Branding tenant — RLS `tenants_select_own` lascia leggere il proprio tenant.
  const { data: tenantRow, error: tenantErr } = await supabase
    .from('tenants')
    .select('id, slug, nome, brand_color, logo_url')
    .eq('id', tenantId)
    .maybeSingle();
  if (tenantErr || !tenantRow) {
    await supabase.auth.signOut();
    redirect('/login');
  }

  // Anagrafica cliente — RLS `clienti_tenant_scope` + filtro cliente_id.
  const { data: clienteRow, error: clienteErr } = await supabase
    .from('clienti')
    .select('id, ragione_sociale')
    .eq('id', clienteId)
    .maybeSingle();
  if (clienteErr || !clienteRow) {
    await supabase.auth.signOut();
    redirect('/login');
  }

  return {
    authUserId: user.id,
    tenantId,
    tenantSlug,
    clienteId,
    email: user.email ?? '',
    tenant: {
      id: tenantRow.id as string,
      slug: tenantRow.slug as string,
      nome: tenantRow.nome as string,
      brandColor: (tenantRow.brand_color as string | null) ?? null,
      logoUrl: (tenantRow.logo_url as string | null) ?? null,
    },
    cliente: {
      id: clienteRow.id as string,
      ragioneSociale: clienteRow.ragione_sociale as string,
    },
  };
}

/**
 * Variante non-throwing: utile su `/login` per ridirezionare al portale
 * un utente che è già loggato.
 */
export async function getPortalContextOrNull(): Promise<PortalContext | null> {
  try {
    return await requirePortalContext();
  } catch {
    return null;
  }
}
