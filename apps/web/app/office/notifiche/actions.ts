'use server';

import { z } from 'zod';
import { createServerSupabase } from '@kommessa/api/server';
import { requireTenantContext } from '@kommessa/api/tenant';

const IdSchema = z.string().uuid();

/**
 * Marca una notifica come letta (`read_at`) per l'utente corrente. RLS-scoped:
 * l'update tocca solo la riga dell'utente loggato e solo se ancora non letta
 * (così il counter campanella scende una volta sola). Best-effort.
 */
export async function segnaNotificaLetta(id: string): Promise<{ ok: boolean }> {
  const parsed = IdSchema.safeParse(id);
  if (!parsed.success) return { ok: false };

  const ctx = await requireTenantContext();
  const supabase = createServerSupabase();
  const { error } = await supabase
    .from('notifiche')
    .update({ read_at: new Date().toISOString() })
    .eq('id', parsed.data)
    .eq('user_id', ctx.userId)
    .is('read_at', null);

  return { ok: !error };
}

/** Marca TUTTE le notifiche non lette dell'utente come lette (campanella → 0). */
export async function segnaTutteLette(): Promise<{ ok: boolean }> {
  const ctx = await requireTenantContext();
  const supabase = createServerSupabase();
  const { error } = await supabase
    .from('notifiche')
    .update({ read_at: new Date().toISOString() })
    .eq('user_id', ctx.userId)
    .is('read_at', null);

  return { ok: !error };
}
