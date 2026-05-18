'use server';

import { revalidatePath } from 'next/cache';

import { createServerSupabase } from '@impiantixplus/api/server';
import { requireTenantContext } from '@impiantixplus/api/tenant';

/**
 * Server Actions per il tour di onboarding.
 *
 * Tutte e tre richiedono un tenant context valido (utente loggato). Il
 * flag persistito è `public.users.onboarded_at`:
 *  - NULL → il prossimo render di /office o /mobile mostra ancora il tour
 *  - timestamp → utente ha già completato (o saltato) il tour
 *
 * Ogni azione registra un evento in `audit_events` per tracciabilità GDPR
 * e analisi di engagement.
 */

/**
 * L'utente è arrivato alla fine del tour: marca `onboarded_at = now()`
 * e registra audit `onboarding.completed`.
 */
export async function completaOnboarding(): Promise<{ ok: true } | { ok: false; error: string }> {
  let ctx;
  try {
    ctx = await requireTenantContext();
  } catch {
    return { ok: false, error: 'Sessione non valida.' };
  }

  const supabase = createServerSupabase();

  const { error } = await supabase
    .from('users')
    .update({ onboarded_at: new Date().toISOString() })
    .eq('id', ctx.userId)
    .eq('tenant_id', ctx.tenantId);

  if (error) {
    return { ok: false, error: `Update fallito: ${error.message}` };
  }

  // Audit (non bloccante: errori di audit non rompono l'onboarding).
  await supabase.from('audit_events').insert({
    tenant_id: ctx.tenantId,
    actor_user_id: ctx.userId,
    actor_role: ctx.role,
    entity_type: 'user',
    entity_id: ctx.userId,
    action: 'onboarding.completed',
    after_data: { source: 'office_or_mobile_tour' } as Record<string, unknown>,
  });

  revalidatePath('/office');
  revalidatePath('/mobile');
  return { ok: true };
}

/**
 * L'utente ha premuto "Salta tour" o ESC: stessa scrittura
 * `onboarded_at = now()` ma audit differenziato (`onboarding.skipped`),
 * così possiamo monitorare quanti utenti lo saltano.
 */
export async function skipOnboarding(): Promise<{ ok: true } | { ok: false; error: string }> {
  let ctx;
  try {
    ctx = await requireTenantContext();
  } catch {
    return { ok: false, error: 'Sessione non valida.' };
  }

  const supabase = createServerSupabase();

  const { error } = await supabase
    .from('users')
    .update({ onboarded_at: new Date().toISOString() })
    .eq('id', ctx.userId)
    .eq('tenant_id', ctx.tenantId);

  if (error) {
    return { ok: false, error: `Update fallito: ${error.message}` };
  }

  await supabase.from('audit_events').insert({
    tenant_id: ctx.tenantId,
    actor_user_id: ctx.userId,
    actor_role: ctx.role,
    entity_type: 'user',
    entity_id: ctx.userId,
    action: 'onboarding.skipped',
    after_data: { source: 'office_or_mobile_tour' } as Record<string, unknown>,
  });

  revalidatePath('/office');
  revalidatePath('/mobile');
  return { ok: true };
}

/**
 * Re-mette `onboarded_at = NULL` per l'utente corrente. Utile in DEV per
 * rifare il tour. In produzione non è esposta da nessuna UI: la invochi
 * a mano da una console o da uno script di test.
 */
export async function resetOnboarding(): Promise<{ ok: true } | { ok: false; error: string }> {
  let ctx;
  try {
    ctx = await requireTenantContext();
  } catch {
    return { ok: false, error: 'Sessione non valida.' };
  }

  const supabase = createServerSupabase();

  const { error } = await supabase
    .from('users')
    .update({ onboarded_at: null })
    .eq('id', ctx.userId)
    .eq('tenant_id', ctx.tenantId);

  if (error) {
    return { ok: false, error: `Reset fallito: ${error.message}` };
  }

  await supabase.from('audit_events').insert({
    tenant_id: ctx.tenantId,
    actor_user_id: ctx.userId,
    actor_role: ctx.role,
    entity_type: 'user',
    entity_id: ctx.userId,
    action: 'onboarding.reset',
    metadata: { dev_only: true } as Record<string, unknown>,
  });

  revalidatePath('/office');
  revalidatePath('/mobile');
  return { ok: true };
}
