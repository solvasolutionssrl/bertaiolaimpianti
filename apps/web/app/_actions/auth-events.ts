'use server';

import { headers } from 'next/headers';

import { createServerSupabase } from '@kommessa/api/server';
import { createServiceSupabase } from '@kommessa/api/service';

/**
 * Registra un evento di accesso (login/logout) per il monitoraggio platform
 * admin. **Best-effort**: qualsiasi errore (tabella non ancora migrata, rete,
 * sessione assente) viene ingoiato — non deve MAI bloccare login/logout.
 *
 * Insert via service-role (la tabella `auth_events` è in sola lettura per i
 * platform admin via RLS). tenant_id deriva dal claim JWT dell'utente.
 */
export async function registraEventoAccesso(tipo: 'login' | 'logout'): Promise<void> {
  try {
    const supabase = createServerSupabase();
    const { data } = await supabase.auth.getUser();
    const user = data.user;
    if (!user) return;

    const meta = (user.app_metadata ?? {}) as Record<string, unknown>;
    const tenantId = typeof meta.tenant_id === 'string' ? meta.tenant_id : null;

    const h = headers();
    const ua = h.get('user-agent');
    const fwd = h.get('x-forwarded-for');
    const ip = fwd ? fwd.split(',')[0]?.trim() ?? null : null;

    const svc = createServiceSupabase();
    await svc.from('auth_events' as never).insert({
      tenant_id: tenantId,
      user_id: user.id,
      email: user.email ?? null,
      tipo,
      user_agent: ua,
      ip,
    } as never);
  } catch {
    // best-effort: non bloccare mai il flusso di autenticazione
  }
}
