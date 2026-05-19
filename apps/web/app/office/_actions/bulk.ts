'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { createServerSupabase } from '@impiantixplus/api/server';
import { createServiceSupabase } from '@impiantixplus/api/service';
import { requireTenantContext } from '@impiantixplus/api/tenant';

import { aggiornaPriorita } from './tickets';

/**
 * Bulk actions per Tickets e Commesse.
 *
 * Convenzioni:
 * - Tutte le action passano da `requireTenantContext` + check ruolo office.
 * - Update eseguiti in batch con `in('id', ids)` per minimizzare round-trip.
 * - Per ridurre lo spam audit, registriamo UN solo record aggregato
 *   per batch con `metadata.bulk = true, count, ids`.
 * - Ritorno discriminato `{ ok: true, updated } | { ok: false, error }` —
 *   niente throw, niente unhandled rejection sul client.
 */

type BulkResult =
  | { ok: true; updated: number }
  | { ok: false; error: string };

const STATI_TICKET = ['aperto', 'in_lavorazione', 'attesa_cliente', 'chiuso'] as const;
const PRIORITA_TICKET = ['bassa', 'media', 'alta', 'urgente'] as const;
const STATI_COMMESSA = [
  'bozza',
  'aperta',
  'in_corso',
  'collaudo',
  'completata',
  'archiviata',
] as const;

const idsSchema = z.array(z.string().uuid()).min(1).max(500);

function assertOfficeRole(role: string): void {
  if (role !== 'owner' && role !== 'admin' && role !== 'office') {
    throw new Error('FORBIDDEN: solo office/admin/owner possono eseguire bulk action.');
  }
}

async function logBulkAudit(params: {
  tenantId: string;
  actorUserId: string;
  actorRole: string;
  entityType: 'ticket' | 'commessa';
  ids: string[];
  action: 'update' | 'assign' | 'tag';
  field: string;
  value: unknown;
}): Promise<void> {
  const supabase = createServerSupabase();
  // Un solo record per batch (entity_id = primo per fk, restanti in metadata.ids).
  await supabase.from('audit_events').insert({
    tenant_id: params.tenantId,
    actor_user_id: params.actorUserId,
    actor_role: params.actorRole,
    entity_type: params.entityType,
    entity_id: params.ids[0],
    action: params.action,
    after_data: { [params.field]: params.value },
    metadata: {
      bulk: true,
      count: params.ids.length,
      ids: params.ids,
      field: params.field,
    },
  });
}

// ---------------------------------------------------------------------------
// TICKETS
// ---------------------------------------------------------------------------

const bulkAssegnaSchema = z.object({
  ids: idsSchema,
  userId: z.string().uuid(),
});

export async function bulkAssegna(
  ids: string[],
  userId: string,
): Promise<BulkResult> {
  try {
    const ctx = await requireTenantContext();
    assertOfficeRole(ctx.role);
    const parsed = bulkAssegnaSchema.parse({ ids, userId });
    const supabase = createServerSupabase();

    const { error, count } = await supabase
      .from('tickets')
      .update({ assegnato_a: parsed.userId })
      .in('id', parsed.ids)
      .select('id', { count: 'exact', head: true });
    if (error) return { ok: false, error: error.message };

    await logBulkAudit({
      tenantId: ctx.tenantId,
      actorUserId: ctx.userId,
      actorRole: ctx.role,
      entityType: 'ticket',
      ids: parsed.ids,
      action: 'assign',
      field: 'assegnato_a',
      value: parsed.userId,
    });

    revalidatePath('/office/tickets');
    return { ok: true, updated: count ?? parsed.ids.length };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Errore' };
  }
}

const bulkCambiaStatoSchema = z.object({
  ids: idsSchema,
  stato: z.enum(STATI_TICKET),
});

export async function bulkCambiaStato(
  ids: string[],
  stato: (typeof STATI_TICKET)[number],
): Promise<BulkResult> {
  try {
    const ctx = await requireTenantContext();
    assertOfficeRole(ctx.role);
    const parsed = bulkCambiaStatoSchema.parse({ ids, stato });
    const supabase = createServerSupabase();

    // Se passiamo a "chiuso" e closed_at è null, valorizziamolo.
    const updates: Record<string, string | null> = { stato: parsed.stato };
    if (parsed.stato === 'chiuso') {
      updates.closed_at = new Date().toISOString();
    }

    const { error, count } = await supabase
      .from('tickets')
      .update(updates)
      .in('id', parsed.ids)
      .select('id', { count: 'exact', head: true });
    if (error) return { ok: false, error: error.message };

    await logBulkAudit({
      tenantId: ctx.tenantId,
      actorUserId: ctx.userId,
      actorRole: ctx.role,
      entityType: 'ticket',
      ids: parsed.ids,
      action: 'update',
      field: 'stato',
      value: parsed.stato,
    });

    revalidatePath('/office/tickets');
    return { ok: true, updated: count ?? parsed.ids.length };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Errore' };
  }
}

const bulkCambiaPrioritaSchema = z.object({
  ids: idsSchema,
  priorita: z.enum(PRIORITA_TICKET),
});

/**
 * Cambia priorità per N ticket. Per ciascuno invoca `aggiornaPriorita` (che
 * ricalcola target_response_at / target_close_at usando la sla_policy del
 * tenant). Non parallelizziamo per non saturare la connection pool di
 * Supabase — i batch sono attesi piccoli (<50 elementi).
 */
export async function bulkCambiaPriorita(
  ids: string[],
  priorita: (typeof PRIORITA_TICKET)[number],
): Promise<BulkResult> {
  try {
    const ctx = await requireTenantContext();
    assertOfficeRole(ctx.role);
    const parsed = bulkCambiaPrioritaSchema.parse({ ids, priorita });

    let updated = 0;
    const errors: string[] = [];
    for (const id of parsed.ids) {
      try {
        await aggiornaPriorita({ ticketId: id, nuovaPriorita: parsed.priorita });
        updated += 1;
      } catch (e) {
        errors.push(`${id}: ${e instanceof Error ? e.message : 'errore'}`);
      }
    }

    // L'audit per-ticket lo fa già aggiornaPriorita. Aggiungiamo un record
    // bulk aggregato per tracciare l'azione massiva.
    await logBulkAudit({
      tenantId: ctx.tenantId,
      actorUserId: ctx.userId,
      actorRole: ctx.role,
      entityType: 'ticket',
      ids: parsed.ids,
      action: 'update',
      field: 'priorita',
      value: parsed.priorita,
    });

    revalidatePath('/office/tickets');
    if (errors.length > 0 && updated === 0) {
      return { ok: false, error: errors.join('; ') };
    }
    return { ok: true, updated };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Errore' };
  }
}

// ---------------------------------------------------------------------------
// COMMESSE
// ---------------------------------------------------------------------------

const bulkCambiaStatoCommessaSchema = z.object({
  ids: idsSchema,
  stato: z.enum(STATI_COMMESSA),
});

export async function bulkCambiaStatoCommessa(
  ids: string[],
  stato: (typeof STATI_COMMESSA)[number],
): Promise<BulkResult> {
  try {
    const ctx = await requireTenantContext();
    assertOfficeRole(ctx.role);
    const parsed = bulkCambiaStatoCommessaSchema.parse({ ids, stato });
    const supabase = createServerSupabase();

    // Snapshot commesse prima del cambio (per notifica al responsabile)
    const { data: commesseInfo } = await supabase
      .from('commesse')
      .select('id, codice_interno, responsabile_id, cliente:clienti(ragione_sociale)')
      .in('id', parsed.ids);

    const { error, count } = await supabase
      .from('commesse')
      .update({ stato: parsed.stato })
      .in('id', parsed.ids)
      .select('id', { count: 'exact', head: true });
    if (error) return { ok: false, error: error.message };

    await logBulkAudit({
      tenantId: ctx.tenantId,
      actorUserId: ctx.userId,
      actorRole: ctx.role,
      entityType: 'commessa',
      ids: parsed.ids,
      action: 'update',
      field: 'stato',
      value: parsed.stato,
    });

    // Notifica responsabile commessa su transizioni significative
    // (completata, collaudo, archiviata, critica). Best-effort.
    if (['completata', 'collaudo', 'archiviata'].includes(parsed.stato)) {
      try {
        const service = createServiceSupabase();
        const rows = ((commesseInfo ?? []) as any[])
          .filter((c) => c.responsabile_id)
          .map((c) => {
            const cli = Array.isArray(c.cliente) ? c.cliente[0] : c.cliente;
            return {
              tenant_id: ctx.tenantId,
              user_id: c.responsabile_id as string,
              type: `commessa_${parsed.stato}`,
              payload: {
                commessa_id: c.id,
                codice: c.codice_interno,
                cliente: cli?.ragione_sociale ?? null,
                descrizione: `Commessa ${c.codice_interno} → ${parsed.stato}${cli?.ragione_sociale ? ` (${cli.ragione_sociale})` : ''}`,
                actor_user_id: ctx.userId,
              },
            };
          });
        if (rows.length > 0) {
          await service.from('notifiche').insert(rows);
        }
      } catch (e) {
        console.warn('[bulkCambiaStatoCommessa] notifica fallita', e);
      }
    }

    revalidatePath('/office/commesse');
    return { ok: true, updated: count ?? parsed.ids.length };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Errore' };
  }
}

const bulkAssegnaResponsabileSchema = z.object({
  ids: idsSchema,
  userId: z.string().uuid(),
});

export async function bulkAssegnaResponsabile(
  ids: string[],
  userId: string,
): Promise<BulkResult> {
  try {
    const ctx = await requireTenantContext();
    assertOfficeRole(ctx.role);
    const parsed = bulkAssegnaResponsabileSchema.parse({ ids, userId });
    const supabase = createServerSupabase();

    // Leggi codici delle commesse PRIMA dell'update così abbiamo info
    // ricche per la notifica al nuovo responsabile
    const { data: commesseInfo } = await supabase
      .from('commesse')
      .select('id, codice_interno, cliente:clienti(ragione_sociale)')
      .in('id', parsed.ids);

    const { error, count } = await supabase
      .from('commesse')
      .update({ responsabile_id: parsed.userId })
      .in('id', parsed.ids)
      .select('id', { count: 'exact', head: true });
    if (error) return { ok: false, error: error.message };

    await logBulkAudit({
      tenantId: ctx.tenantId,
      actorUserId: ctx.userId,
      actorRole: ctx.role,
      entityType: 'commessa',
      ids: parsed.ids,
      action: 'assign',
      field: 'responsabile_id',
      value: parsed.userId,
    });

    // Notifica il nuovo responsabile — best-effort, non blocca l'assegnazione.
    // Service role per bypass RLS (l'attore office magari non vede notifiche
    // dell'utente target).
    try {
      const service = createServiceSupabase();
      const rows = ((commesseInfo ?? []) as any[]).map((c) => {
        const cli = Array.isArray(c.cliente) ? c.cliente[0] : c.cliente;
        return {
          tenant_id: ctx.tenantId,
          user_id: parsed.userId,
          type: 'commessa_assigned',
          payload: {
            commessa_id: c.id,
            codice: c.codice_interno,
            cliente: cli?.ragione_sociale ?? null,
            descrizione: `Ti è stata assegnata la commessa ${c.codice_interno}${cli?.ragione_sociale ? ` — ${cli.ragione_sociale}` : ''}`,
            actor_user_id: ctx.userId,
          },
        };
      });
      if (rows.length > 0) {
        await service.from('notifiche').insert(rows);
      }
    } catch (e) {
      console.warn('[bulkAssegnaResponsabile] notifica fallita', e);
    }

    revalidatePath('/office/commesse');
    return { ok: true, updated: count ?? parsed.ids.length };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Errore' };
  }
}

const bulkAggiungiTagSchema = z.object({
  ids: idsSchema,
  tag: z.string().trim().min(1).max(48),
});

/**
 * Aggiunge un tag testuale a N commesse. Dipende dalla tabella
 * `commessa_tags` che verrà introdotta dalla migration 20260101002000.
 * Finché non c'è, fallisce graceful con messaggio comprensibile.
 */
export async function bulkAggiungiTag(
  ids: string[],
  tag: string,
): Promise<BulkResult> {
  try {
    const ctx = await requireTenantContext();
    assertOfficeRole(ctx.role);
    const parsed = bulkAggiungiTagSchema.parse({ ids, tag });
    const supabase = createServerSupabase();

    const rows = parsed.ids.map((commessaId) => ({
      tenant_id: ctx.tenantId,
      commessa_id: commessaId,
      tag: parsed.tag,
    }));

    const { error } = await supabase
      .from('commessa_tags')
      .insert(rows);

    if (error) {
      // 42P01 = undefined_table; messaggi tipici PostgREST contengono
      // "relation \"public.commessa_tags\" does not exist".
      const msg = error.message.toLowerCase();
      if (
        error.code === '42P01' ||
        msg.includes('does not exist') ||
        msg.includes('not found')
      ) {
        console.warn('[bulkAggiungiTag] tabella commessa_tags non disponibile:', error.message);
        return { ok: false, error: 'Tag system non ancora attivo' };
      }
      // I duplicati sono ok (lo stesso tag già esiste): non li trattiamo come errore.
      if (msg.includes('duplicate')) {
        // procedi
      } else {
        return { ok: false, error: error.message };
      }
    }

    await logBulkAudit({
      tenantId: ctx.tenantId,
      actorUserId: ctx.userId,
      actorRole: ctx.role,
      entityType: 'commessa',
      ids: parsed.ids,
      action: 'tag',
      field: 'tag',
      value: parsed.tag,
    });

    revalidatePath('/office/commesse');
    return { ok: true, updated: parsed.ids.length };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Errore' };
  }
}
