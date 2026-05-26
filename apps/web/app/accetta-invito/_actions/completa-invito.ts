'use server';

import { createServiceSupabase } from '@kommessa/api/service';
import { requireTenantContext } from '@kommessa/api/tenant';

/**
 * Chiamata dopo che l'utente ha impostato la password.
 * Setta invite_accepted_at per il tracking super-admin.
 */
export async function completaInvito(): Promise<void> {
  try {
    const ctx = await requireTenantContext();
    const service = createServiceSupabase();
    await (service as unknown as { from: (t: string) => any })
      .from('users')
      .update({ invite_accepted_at: new Date().toISOString() })
      .eq('id', ctx.userId)
      .is('invite_accepted_at', null);
  } catch {
    // Non bloccante — il login funziona anche senza questo aggiornamento
  }
}
