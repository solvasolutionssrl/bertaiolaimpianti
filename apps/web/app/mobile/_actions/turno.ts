'use server';

import { revalidatePath } from 'next/cache';

import { createServerSupabase } from '@impiantixplus/api/server';
import { requireTenantContext } from '@impiantixplus/api/tenant';

/**
 * Server Actions per il time tracking lato PWA tecnici.
 *
 * Regole:
 *  - massimo UN intervento aperto per utente (vincolo DB:
 *    partial unique index `interventi_unique_open_per_user`)
 *  - geo (lat/lng) è best-effort: se non disponibile lato client va
 *    salvata come null senza errori
 *  - audit_events scritto come `intervento.start` / `intervento.stop`
 */

export interface IniziaTurnoInput {
  commessaId: string;
  voceId?: number | null;
  geoLat?: number | null;
  geoLng?: number | null;
}

export interface IniziaTurnoResult {
  ok: boolean;
  interventoId?: string;
  error?: string;
}

export async function iniziaTurno(
  input: IniziaTurnoInput,
): Promise<IniziaTurnoResult> {
  let ctx;
  try {
    ctx = await requireTenantContext();
  } catch {
    return { ok: false, error: 'UNAUTHENTICATED' };
  }

  const supabase = createServerSupabase();

  // Verifica che la commessa appartenga al tenant corrente (RLS lo
  // farebbe comunque ma vogliamo errore esplicito invece di "row not found").
  const { data: commessa, error: commErr } = await supabase
    .from('commesse')
    .select('id, tenant_id, codice_interno')
    .eq('id', input.commessaId)
    .maybeSingle();
  if (commErr || !commessa) {
    return { ok: false, error: 'Commessa non trovata o non accessibile.' };
  }

  // Insert nuovo intervento. Se l'utente ha già un turno aperto il
  // partial unique index respinge l'insert con codice 23505.
  const insertPayload: Record<string, unknown> = {
    tenant_id: ctx.tenantId,
    commessa_id: input.commessaId,
    voce_id: input.voceId ?? null,
    user_id: ctx.userId,
    geo_lat: input.geoLat ?? null,
    geo_lng: input.geoLng ?? null,
  };

  const { data, error } = await (supabase.from('interventi') as any)
    .insert(insertPayload)
    .select('id')
    .single();

  if (error) {
    if ((error as any).code === '23505') {
      return {
        ok: false,
        error:
          'Hai già un turno aperto. Termina il turno corrente prima di iniziarne un altro.',
      };
    }
    return { ok: false, error: error.message };
  }

  // Audit log (best-effort)
  await (supabase.from('audit_events') as any).insert({
    tenant_id: ctx.tenantId,
    actor_user_id: ctx.userId,
    actor_role: ctx.role,
    entity_type: 'intervento',
    entity_id: (data as { id: string }).id,
    action: 'start',
    metadata: {
      commessa_id: input.commessaId,
      commessa_codice: (commessa as { codice_interno: string }).codice_interno,
    },
  });

  revalidatePath('/mobile/turno');
  revalidatePath('/office/turni');
  return { ok: true, interventoId: (data as { id: string }).id };
}

export interface TerminaTurnoInput {
  note?: string;
}

export interface TerminaTurnoResult {
  ok: boolean;
  durationMinutes?: number;
  error?: string;
}

export async function terminaTurno(
  input: TerminaTurnoInput = {},
): Promise<TerminaTurnoResult> {
  let ctx;
  try {
    ctx = await requireTenantContext();
  } catch {
    return { ok: false, error: 'UNAUTHENTICATED' };
  }

  const supabase = createServerSupabase();

  // Recupera l'unico intervento aperto dell'utente.
  const { data: aperto, error: openErr } = await supabase
    .from('interventi')
    .select('id, start_at, commessa_id')
    .eq('user_id', ctx.userId)
    .is('end_at', null)
    .maybeSingle();

  if (openErr) return { ok: false, error: openErr.message };
  if (!aperto) return { ok: false, error: 'Nessun turno aperto da terminare.' };

  const startAt = new Date((aperto as any).start_at as string).getTime();
  const endAt = Date.now();
  const durationMinutes = Math.max(0, Math.round((endAt - startAt) / 60000));

  const { error: updErr } = await (supabase.from('interventi') as any)
    .update({
      end_at: new Date(endAt).toISOString(),
      duration_minutes: durationMinutes,
      note: input.note ?? null,
    })
    .eq('id', (aperto as { id: string }).id);

  if (updErr) return { ok: false, error: updErr.message };

  // Audit log
  await (supabase.from('audit_events') as any).insert({
    tenant_id: ctx.tenantId,
    actor_user_id: ctx.userId,
    actor_role: ctx.role,
    entity_type: 'intervento',
    entity_id: (aperto as { id: string }).id,
    action: 'stop',
    metadata: {
      duration_minutes: durationMinutes,
      commessa_id: (aperto as { commessa_id: string }).commessa_id,
    },
  });

  revalidatePath('/mobile/turno');
  revalidatePath('/office/turni');
  return { ok: true, durationMinutes };
}
