'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { createServerSupabase } from '@kommessa/api/server';
import { requireTenantContext } from '@kommessa/api/tenant';
import type { AppRole } from '@kommessa/api';

/**
 * Server actions per gestire i TODO di una commessa.
 *
 * Permessi:
 *  - admin / office: full CRUD (crea, modifica titolo/desc/priorità/assegna,
 *    cambia stato, riordina, elimina, note, allegati).
 *  - tecnico: read; può cambiare stato (complete / annulla / in_corso) e
 *    aggiungere note + allegati. Non può creare/eliminare/riassegnare.
 *
 * RLS SQL applica già la maggior parte di questi vincoli (vedi
 * 20260101003400_todo_riunione.sql); qui rinforziamo lato applicativo
 * con messaggi italiani comprensibili + audit_events.
 */

const FULL_ROLES = new Set<AppRole>(['admin', 'office']);
const ALL_ROLES = new Set<AppRole>(['admin', 'office', 'tecnico']);

const TODO_PRIORITA = ['bassa', 'media', 'alta', 'urgente'] as const;
const TODO_STATO = ['aperto', 'in_corso', 'completato', 'annullato'] as const;

type TodoPriorita = (typeof TODO_PRIORITA)[number];
type TodoStato = (typeof TODO_STATO)[number];

export type TodoRow = {
  id: string;
  commessa_id: string;
  titolo: string;
  descrizione: string | null;
  stato: TodoStato;
  priorita: TodoPriorita;
  assegnato_a: string | null;
  scadenza_at: string | null;
  sort_order: number;
  metadata: Record<string, unknown> | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  completato_at: string | null;
  completato_da: string | null;
};

export type Result<T = void> =
  | (T extends void ? { ok: true } : { ok: true; data: T })
  | { ok: false; error: string };

// ────────────────────────────────────────────────────────────
// CREATE
// ────────────────────────────────────────────────────────────

const CreaInput = z.object({
  commessaId: z.string().uuid(),
  titolo: z.string().trim().min(1).max(200),
  descrizione: z.string().trim().max(2000).optional(),
  priorita: z.enum(TODO_PRIORITA).default('media'),
  assegnatoA: z.string().uuid().nullable().optional(),
  scadenzaAt: z.string().datetime().nullable().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export async function creaTodo(
  input: unknown,
): Promise<Result<{ id: string }>> {
  const parsed = CreaInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Input non valido' };

  const ctx = await safeCtx();
  if (!ctx) return { ok: false, error: 'Sessione non valida' };
  if (!FULL_ROLES.has(ctx.role)) {
    return { ok: false, error: 'Solo admin/office possono creare TODO' };
  }

  const supabase = createServerSupabase();

  // sort_order = max+1 dei todo aperti della commessa
  const { data: maxRow } = await supabase
    .from('commessa_todo' as never)
    .select('sort_order')
    .eq('commessa_id', parsed.data.commessaId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrder = (((maxRow as { sort_order?: number } | null)?.sort_order ?? 0) + 1);

  const insertRow = {
    tenant_id: ctx.tenantId,
    commessa_id: parsed.data.commessaId,
    titolo: parsed.data.titolo,
    descrizione: parsed.data.descrizione ?? null,
    priorita: parsed.data.priorita,
    assegnato_a: parsed.data.assegnatoA ?? null,
    scadenza_at: parsed.data.scadenzaAt ?? null,
    sort_order: nextOrder,
    metadata: parsed.data.metadata ?? {},
    created_by: ctx.userId,
  };
  const { data, error } = await supabase
    .from('commessa_todo' as never)
    .insert(insertRow as never)
    .select('id')
    .single();
  if (error) return { ok: false, error: `Creazione fallita: ${error.message}` };

  const id = (data as { id: string }).id;

  await audit(ctx, 'commessa.todo.crea', parsed.data.commessaId, id, {
    titolo: parsed.data.titolo,
    priorita: parsed.data.priorita,
    assegnato_a: parsed.data.assegnatoA,
  });

  revalidatePath(`/office/commesse/${parsed.data.commessaId}`);
  revalidatePath(`/mobile/commessa/${parsed.data.commessaId}`);
  return { ok: true, data: { id } };
}

// ────────────────────────────────────────────────────────────
// UPDATE (admin/office full; tecnico solo stato)
// ────────────────────────────────────────────────────────────

const AggiornaInput = z.object({
  id: z.string().uuid(),
  titolo: z.string().trim().min(1).max(200).optional(),
  descrizione: z.string().trim().max(2000).nullable().optional(),
  priorita: z.enum(TODO_PRIORITA).optional(),
  assegnatoA: z.string().uuid().nullable().optional(),
  scadenzaAt: z.string().datetime().nullable().optional(),
});

export async function aggiornaTodo(input: unknown): Promise<Result> {
  const parsed = AggiornaInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Input non valido' };

  const ctx = await safeCtx();
  if (!ctx) return { ok: false, error: 'Sessione non valida' };
  if (!FULL_ROLES.has(ctx.role)) {
    return { ok: false, error: 'Solo admin/office possono modificare un TODO' };
  }

  const supabase = createServerSupabase();
  const update: Record<string, unknown> = {};
  if (parsed.data.titolo !== undefined) update.titolo = parsed.data.titolo;
  if (parsed.data.descrizione !== undefined)
    update.descrizione = parsed.data.descrizione;
  if (parsed.data.priorita !== undefined) update.priorita = parsed.data.priorita;
  if (parsed.data.assegnatoA !== undefined)
    update.assegnato_a = parsed.data.assegnatoA;
  if (parsed.data.scadenzaAt !== undefined)
    update.scadenza_at = parsed.data.scadenzaAt;

  if (Object.keys(update).length === 0) {
    return { ok: false, error: 'Nessun campo da aggiornare' };
  }

  const { data: existing, error: fErr } = await supabase
    .from('commessa_todo' as never)
    .update(update as never)
    .eq('id', parsed.data.id)
    .select('id, commessa_id')
    .single();
  if (fErr) return { ok: false, error: `Update fallito: ${fErr.message}` };

  const commessaId = (existing as { commessa_id: string }).commessa_id;
  await audit(ctx, 'commessa.todo.aggiorna', commessaId, parsed.data.id, update);

  revalidatePath(`/office/commesse/${commessaId}`);
  revalidatePath(`/mobile/commessa/${commessaId}`);
  return { ok: true };
}

// ────────────────────────────────────────────────────────────
// CAMBIA STATO (tutti i ruoli)
// ────────────────────────────────────────────────────────────

const StatoInput = z.object({
  id: z.string().uuid(),
  stato: z.enum(TODO_STATO),
});

export async function cambiaTodoStato(input: unknown): Promise<Result> {
  const parsed = StatoInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Input non valido' };

  const ctx = await safeCtx();
  if (!ctx) return { ok: false, error: 'Sessione non valida' };
  if (!ALL_ROLES.has(ctx.role)) {
    return { ok: false, error: 'Permessi insufficienti' };
  }
  // annullato solo admin/office (è una "cancellazione soft")
  if (parsed.data.stato === 'annullato' && !FULL_ROLES.has(ctx.role)) {
    return { ok: false, error: 'Solo admin/office possono annullare un TODO' };
  }

  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from('commessa_todo' as never)
    .update({ stato: parsed.data.stato } as never)
    .eq('id', parsed.data.id)
    .select('id, commessa_id, stato')
    .single();
  if (error) return { ok: false, error: `Cambio stato fallito: ${error.message}` };

  const commessaId = (data as { commessa_id: string }).commessa_id;
  await audit(
    ctx,
    parsed.data.stato === 'completato'
      ? 'commessa.todo.completa'
      : 'commessa.todo.stato',
    commessaId,
    parsed.data.id,
    { stato: parsed.data.stato },
  );

  revalidatePath(`/office/commesse/${commessaId}`);
  revalidatePath(`/mobile/commessa/${commessaId}`);
  return { ok: true };
}

// ────────────────────────────────────────────────────────────
// RIORDINA (admin/office)
// ────────────────────────────────────────────────────────────

const RiordinaInput = z.object({
  commessaId: z.string().uuid(),
  idsOrdinati: z.array(z.string().uuid()).min(1).max(200),
});

export async function riordinaTodo(input: unknown): Promise<Result> {
  const parsed = RiordinaInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Input non valido' };

  const ctx = await safeCtx();
  if (!ctx) return { ok: false, error: 'Sessione non valida' };
  if (!FULL_ROLES.has(ctx.role)) {
    return { ok: false, error: 'Solo admin/office possono riordinare' };
  }

  const supabase = createServerSupabase();
  // Update batch — un round per ogni id (Postgres non ha UPDATE ... FROM
  // VALUES facile da Supabase JS). 5-10 todo aperti tipici → 10 query max.
  let i = 0;
  for (const id of parsed.data.idsOrdinati) {
    i += 1;
    const { error } = await supabase
      .from('commessa_todo' as never)
      .update({ sort_order: i } as never)
      .eq('id', id)
      .eq('commessa_id', parsed.data.commessaId);
    if (error)
      return { ok: false, error: `Riordino fallito su ${id}: ${error.message}` };
  }
  revalidatePath(`/office/commesse/${parsed.data.commessaId}`);
  return { ok: true };
}

// ────────────────────────────────────────────────────────────
// ELIMINA (admin/office)
// ────────────────────────────────────────────────────────────

export async function eliminaTodo(input: unknown): Promise<Result> {
  const parsed = z.object({ id: z.string().uuid() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Input non valido' };

  const ctx = await safeCtx();
  if (!ctx) return { ok: false, error: 'Sessione non valida' };
  if (!FULL_ROLES.has(ctx.role)) {
    return { ok: false, error: 'Solo admin/office possono eliminare un TODO' };
  }

  const supabase = createServerSupabase();
  const { data: todo } = await supabase
    .from('commessa_todo' as never)
    .select('commessa_id, titolo')
    .eq('id', parsed.data.id)
    .maybeSingle();
  if (!todo) return { ok: false, error: 'TODO non trovato' };
  const t = todo as { commessa_id: string; titolo: string };

  const { error } = await supabase
    .from('commessa_todo' as never)
    .delete()
    .eq('id', parsed.data.id);
  if (error) return { ok: false, error: `Eliminazione fallita: ${error.message}` };

  await audit(ctx, 'commessa.todo.elimina', t.commessa_id, parsed.data.id, {
    titolo: t.titolo,
  });
  revalidatePath(`/office/commesse/${t.commessa_id}`);
  revalidatePath(`/mobile/commessa/${t.commessa_id}`);
  return { ok: true };
}

// ────────────────────────────────────────────────────────────
// NOTE
// ────────────────────────────────────────────────────────────

const NotaInput = z.object({
  todoId: z.string().uuid(),
  body: z.string().trim().min(1).max(2000),
});

export async function aggiungiNotaTodo(input: unknown): Promise<Result> {
  const parsed = NotaInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Input non valido' };

  const ctx = await safeCtx();
  if (!ctx) return { ok: false, error: 'Sessione non valida' };

  const supabase = createServerSupabase();
  const { data: todo } = await supabase
    .from('commessa_todo' as never)
    .select('id, commessa_id, tenant_id')
    .eq('id', parsed.data.todoId)
    .maybeSingle();
  if (!todo) return { ok: false, error: 'TODO non trovato' };
  const t = todo as { commessa_id: string };

  const { error } = await supabase
    .from('commessa_todo_nota' as never)
    .insert({
      tenant_id: ctx.tenantId,
      todo_id: parsed.data.todoId,
      author_id: ctx.userId,
      body: parsed.data.body,
    } as never);
  if (error) return { ok: false, error: `Nota fallita: ${error.message}` };

  revalidatePath(`/office/commesse/${t.commessa_id}`);
  revalidatePath(`/mobile/commessa/${t.commessa_id}`);
  return { ok: true };
}

export async function eliminaNotaTodo(input: unknown): Promise<Result> {
  const parsed = z.object({ id: z.string().uuid() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Input non valido' };

  const ctx = await safeCtx();
  if (!ctx) return { ok: false, error: 'Sessione non valida' };

  const supabase = createServerSupabase();
  // RLS controlla: l'autore o admin/office
  const { error } = await supabase
    .from('commessa_todo_nota' as never)
    .delete()
    .eq('id', parsed.data.id);
  if (error) return { ok: false, error: `Eliminazione nota fallita: ${error.message}` };

  return { ok: true };
}

// ────────────────────────────────────────────────────────────
// ALLEGATI (link a file_refs già esistenti)
// ────────────────────────────────────────────────────────────

const AttachInput = z.object({
  todoId: z.string().uuid(),
  fileRefId: z.string().uuid(),
});

export async function allegaFileTodo(input: unknown): Promise<Result> {
  const parsed = AttachInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Input non valido' };

  const ctx = await safeCtx();
  if (!ctx) return { ok: false, error: 'Sessione non valida' };

  const supabase = createServerSupabase();
  const { error } = await supabase
    .from('commessa_todo_allegato' as never)
    .upsert(
      {
        tenant_id: ctx.tenantId,
        todo_id: parsed.data.todoId,
        file_ref_id: parsed.data.fileRefId,
      } as never,
      { onConflict: 'todo_id,file_ref_id' },
    );
  if (error) return { ok: false, error: `Allegato fallito: ${error.message}` };
  return { ok: true };
}

// ────────────────────────────────────────────────────────────
// helpers
// ────────────────────────────────────────────────────────────

async function safeCtx() {
  try {
    return await requireTenantContext();
  } catch {
    return null;
  }
}

async function audit(
  ctx: { tenantId: string; userId: string; role: AppRole },
  action: string,
  commessaId: string,
  entityId: string,
  metadata: Record<string, unknown>,
) {
  // entity_type='commessa' + entity_id=commessaId così la tab Cronologia
  // (filtrata per entity_type='commessa') include questi eventi.
  // L'id specifico del TODO va in metadata.todo_id.
  const supabase = createServerSupabase();
  await supabase.from('audit_events').insert({
    tenant_id: ctx.tenantId,
    actor_user_id: ctx.userId,
    actor_role: ctx.role,
    entity_type: 'commessa',
    entity_id: commessaId,
    action,
    metadata: {
      todo_id: entityId,
      ...metadata,
    } as unknown as never,
  });
}
