'use server';

import { createServiceSupabase } from '@kommessa/api/service';

import { requireTenantContextCached } from '@/app/_lib/tenant-cache';
import { auditTenant } from '@/app/_actions/_lib/audit';

/**
 * Spegne il cancello del primo accesso, dopo che la persona ha scelto la sua
 * password.
 *
 * ⚠️ **Va chiamata DOPO** `supabase.auth.updateUser({ password })`, mai prima.
 * L'ordine inverso lascerebbe, se il cambio password fallisse, un account senza
 * cancello e ancora sulla password dettata al telefono — cioè esattamente la
 * cosa che questo meccanismo esiste per evitare. Nell'ordine giusto, il caso
 * peggiore è che la schermata ricompaia una volta di troppo.
 *
 * Passa dal service role perché `must_change_password` è protetta dal trigger
 * `users_proteggi_privilegi`: dall'app non la scrive nessuno, nemmeno chi la
 * sta spegnendo per se stesso. Altrimenti chi non vuole cambiare la password
 * se la spegnerebbe da solo.
 */
export async function confermaCambioPassword(): Promise<
  { ok: true } | { ok: false; error: string }
> {
  const ctx = await requireTenantContextCached();
  let service: ReturnType<typeof createServiceSupabase>;
  try {
    service = createServiceSupabase();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Configurazione del server incompleta.' };
  }

  const { error } = await service
    .from('users')
    .update({
      // Entrambe: il cancello e lo stato. Spegnere solo il primo lascerebbe il
      // promemoria addosso a chi ha appena fatto quello che chiedeva.
      must_change_password: false,
      password_provvisoria: false,
      password_changed_at: new Date().toISOString(),
    } as never)
    .eq('id', ctx.userId);
  if (error) return { ok: false, error: error.message };

  await auditTenant(service as never, {
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    actorRole: ctx.role,
    entityType: 'utente',
    entityId: ctx.userId,
    action: 'account.password_scelta',
  });

  return { ok: true };
}
