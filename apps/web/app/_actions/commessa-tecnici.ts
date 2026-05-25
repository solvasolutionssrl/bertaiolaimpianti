'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { createServerSupabase } from '@kommessa/api/server';
import { createServiceSupabase } from '@kommessa/api/service';
import { requireTenantContext } from '@kommessa/api/tenant';
import type { AppRole } from '@kommessa/api';

/**
 * Server actions per assegnare/togliere tecnici alle commesse.
 *
 * Solo `admin` e `office` possono modificare le assegnazioni. La RLS
 * SQL applica lo stesso constraint, queste action lo rinforzano lato
 * applicativo con messaggi di errore comprensibili.
 *
 * NB: la visibilità "tecnico vede solo le sue commesse" è applicata
 * lato query nelle pagine commesse (vedi mobile/commesse/page.tsx,
 * office/commesse/page.tsx) — non solo via RLS, perché office/admin
 * devono vedere tutto e RLS non distingue per ruolo nei SELECT.
 */

const ASSIGN_ROLES = new Set<AppRole>(['admin', 'office']);

const SingleInput = z.object({
  commessaId: z.string().uuid(),
  userId: z.string().uuid(),
});

const SetInput = z.object({
  commessaId: z.string().uuid(),
  /** Lista completa dei tecnici dopo la modifica (replace-all semantics). */
  userIds: z.array(z.string().uuid()),
});

export type AssignResult = { ok: true } | { ok: false; error: string };

/** Assegna un singolo tecnico a una commessa (idempotente). */
export async function assegnaTecnico(input: unknown): Promise<AssignResult> {
  const parsed = SingleInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Input non valido' };

  let ctx;
  try {
    ctx = await requireTenantContext();
  } catch {
    return { ok: false, error: 'Sessione non valida' };
  }
  if (!ASSIGN_ROLES.has(ctx.role)) {
    return { ok: false, error: 'Solo admin/office possono assegnare tecnici' };
  }

  const supabase = createServerSupabase();

  // Verifica che user appartenga al tenant e abbia ruolo "tecnico"
  const { data: user } = await supabase
    .from('users')
    .select('id, role, tenant_id, attivo')
    .eq('id', parsed.data.userId)
    .maybeSingle();
  if (!user || user.tenant_id !== ctx.tenantId) {
    return { ok: false, error: 'Utente non valido per questo tenant' };
  }
  if (user.role !== 'tecnico') {
    return { ok: false, error: 'Si possono assegnare solo utenti con ruolo tecnico' };
  }
  if (!user.attivo) {
    return { ok: false, error: 'Utente disattivato' };
  }

  // UPSERT atomico (idempotente)
  const { error } = await supabase
    .from('commessa_tecnici')
    .upsert(
      {
        commessa_id: parsed.data.commessaId,
        user_id: parsed.data.userId,
        tenant_id: ctx.tenantId,
        assegnato_da: ctx.userId,
      },
      { onConflict: 'commessa_id,user_id' },
    );

  if (error) return { ok: false, error: `Assegnazione fallita: ${error.message}` };

  await supabase.from('audit_events').insert({
    tenant_id: ctx.tenantId,
    actor_user_id: ctx.userId,
    actor_role: ctx.role,
    entity_type: 'commessa_tecnico',
    entity_id: parsed.data.commessaId,
    action: 'commessa.tecnico.assign',
    metadata: {
      commessa_id: parsed.data.commessaId,
      tecnico_user_id: parsed.data.userId,
    } as unknown as never,
  });

  revalidatePath(`/office/commesse/${parsed.data.commessaId}`);
  revalidatePath(`/mobile/commessa/${parsed.data.commessaId}`);
  return { ok: true };
}

/** Rimuove un tecnico da una commessa. */
export async function rimuoviTecnico(input: unknown): Promise<AssignResult> {
  const parsed = SingleInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Input non valido' };

  let ctx;
  try {
    ctx = await requireTenantContext();
  } catch {
    return { ok: false, error: 'Sessione non valida' };
  }
  if (!ASSIGN_ROLES.has(ctx.role)) {
    return { ok: false, error: 'Solo admin/office possono rimuovere tecnici' };
  }

  const supabase = createServerSupabase();
  const { error } = await supabase
    .from('commessa_tecnici')
    .delete()
    .eq('commessa_id', parsed.data.commessaId)
    .eq('user_id', parsed.data.userId);

  if (error) return { ok: false, error: `Rimozione fallita: ${error.message}` };

  await supabase.from('audit_events').insert({
    tenant_id: ctx.tenantId,
    actor_user_id: ctx.userId,
    actor_role: ctx.role,
    entity_type: 'commessa_tecnico',
    entity_id: parsed.data.commessaId,
    action: 'commessa.tecnico.unassign',
    metadata: {
      commessa_id: parsed.data.commessaId,
      tecnico_user_id: parsed.data.userId,
    } as unknown as never,
  });

  revalidatePath(`/office/commesse/${parsed.data.commessaId}`);
  revalidatePath(`/mobile/commessa/${parsed.data.commessaId}`);
  return { ok: true };
}

/**
 * Replace-all: imposta la lista completa dei tecnici di una commessa.
 * Usata dalla UI multi-select.
 */
export async function impostaTecniciCommessa(
  input: unknown,
): Promise<AssignResult> {
  const parsed = SetInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Input non valido' };

  let ctx;
  try {
    ctx = await requireTenantContext();
  } catch {
    return { ok: false, error: 'Sessione non valida' };
  }
  if (!ASSIGN_ROLES.has(ctx.role)) {
    return { ok: false, error: 'Solo admin/office possono modificare le assegnazioni' };
  }

  const supabase = createServerSupabase();

  // Verifica che tutti gli userIds siano tecnici del tenant
  if (parsed.data.userIds.length > 0) {
    const { data: users } = await supabase
      .from('users')
      .select('id, role, tenant_id, attivo')
      .in('id', parsed.data.userIds);
    const invalid = parsed.data.userIds.find((id) => {
      const u = users?.find((x) => x.id === id);
      return !u || u.tenant_id !== ctx.tenantId || u.role !== 'tecnico' || !u.attivo;
    });
    if (invalid) {
      return { ok: false, error: 'Uno o più utenti non sono tecnici validi del tenant' };
    }
  }

  // Delta calc: current vs desired
  const { data: currentRows } = await supabase
    .from('commessa_tecnici')
    .select('user_id')
    .eq('commessa_id', parsed.data.commessaId);
  const current = new Set((currentRows ?? []).map((r) => r.user_id as string));
  const desired = new Set(parsed.data.userIds);
  const toAdd = parsed.data.userIds.filter((id) => !current.has(id));
  const toRemove = [...current].filter((id) => !desired.has(id));

  // INSERT new
  if (toAdd.length > 0) {
    const rows = toAdd.map((uid) => ({
      commessa_id: parsed.data.commessaId,
      user_id: uid,
      tenant_id: ctx.tenantId,
      assegnato_da: ctx.userId,
    }));
    const { error } = await supabase
      .from('commessa_tecnici')
      .upsert(rows, { onConflict: 'commessa_id,user_id' });
    if (error) return { ok: false, error: `Add fallito: ${error.message}` };
  }

  // DELETE removed
  if (toRemove.length > 0) {
    const { error } = await supabase
      .from('commessa_tecnici')
      .delete()
      .eq('commessa_id', parsed.data.commessaId)
      .in('user_id', toRemove);
    if (error) return { ok: false, error: `Remove fallito: ${error.message}` };
  }

  await supabase.from('audit_events').insert({
    tenant_id: ctx.tenantId,
    actor_user_id: ctx.userId,
    actor_role: ctx.role,
    entity_type: 'commessa_tecnico',
    entity_id: parsed.data.commessaId,
    action: 'commessa.tecnici.set',
    metadata: {
      commessa_id: parsed.data.commessaId,
      added: toAdd,
      removed: toRemove,
      total: parsed.data.userIds.length,
    } as unknown as never,
  });

  revalidatePath(`/office/commesse/${parsed.data.commessaId}`);
  revalidatePath(`/mobile/commessa/${parsed.data.commessaId}`);
  return { ok: true };
}

/** Lista tecnici disponibili del tenant (per il picker UI). */
export async function elencaTecniciTenant(): Promise<
  Array<{ id: string; display_name: string | null }>
> {
  let ctx;
  try {
    ctx = await requireTenantContext();
  } catch {
    return [];
  }
  if (!ASSIGN_ROLES.has(ctx.role)) return [];

  // Service role per leggere tutta la rosa (RLS filtrerebbe se non admin)
  const service = createServiceSupabase();
  const { data } = await service
    .from('users')
    .select('id, display_name')
    .eq('tenant_id', ctx.tenantId)
    .eq('role', 'tecnico')
    .eq('attivo', true)
    .order('display_name', { ascending: true });

  return (data ?? []).map((u) => ({
    id: u.id as string,
    display_name: (u.display_name as string | null) ?? null,
  }));
}

/** Lista tecnici già assegnati a una commessa. */
export async function elencaTecniciAssegnati(commessaId: string): Promise<
  Array<{ user_id: string; display_name: string | null; assegnato_at: string }>
> {
  try {
    await requireTenantContext();
  } catch {
    return [];
  }
  const supabase = createServerSupabase();
  const { data } = await supabase
    .from('commessa_tecnici')
    .select(
      'user_id, assegnato_at, user:users!commessa_tecnici_user_id_fkey ( display_name )',
    )
    .eq('commessa_id', commessaId)
    .order('assegnato_at', { ascending: true });

  return (data ?? []).map((r) => ({
    user_id: r.user_id as string,
    display_name:
      (Array.isArray(r.user) ? r.user[0]?.display_name : r.user?.display_name) ??
      null,
    assegnato_at: r.assegnato_at as string,
  }));
}
