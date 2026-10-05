'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { createServerSupabase } from '@kommessa/api/server';
import { requireTenantContext } from '@kommessa/api/tenant';
import type { AppRole } from '@kommessa/api';
import { payloadBozzaDaRichiesta } from '@kommessa/api/richiesta-bozza';

/**
 * Le richieste arrivate al telefono.
 *
 * Una richiesta È un task senza commessa (`commessa_todo.commessa_id IS NULL`),
 * quindi la si crea e si modifica con le azioni dei task — `creaTodo`,
 * `aggiornaTodo`, `cambiaTodoStato`. Qui sta solo il passaggio che le è
 * proprio: **diventare un lavoro vero.**
 *
 * La conversione non crea la commessa: crea una **bozza** precompilata e manda
 * l'utente nel form di creazione, che chiede il resto (voci, indirizzo,
 * referenti) e solo alla conferma brucia il codice interno e crea le cartelle.
 * Così una richiesta aperta per sbaglio non lascia niente in giro.
 */

const FULL_ROLES = new Set<AppRole>(['admin', 'office']);

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

const ConvertiInput = z.object({ todoId: z.string().uuid() });

export async function convertiRichiestaInBozza(
  input: unknown,
): Promise<Result<{ bozzaId: string }>> {
  const parsed = ConvertiInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Input non valido' };

  let ctx;
  try {
    ctx = await requireTenantContext();
  } catch {
    return { ok: false, error: 'Sessione non valida' };
  }
  if (!FULL_ROLES.has(ctx.role)) {
    return { ok: false, error: 'Solo ufficio e amministratori possono creare una commessa' };
  }

  const supabase = createServerSupabase();

  const { data: rigaRaw, error: errLettura } = await supabase
    .from('commessa_todo' as never)
    .select(
      `id, titolo, descrizione, contatto, cliente_id, cliente_testo, commessa_id,
       cliente:clienti ( ragione_sociale )`,
    )
    .eq('id', parsed.data.todoId)
    .maybeSingle();
  if (errLettura) return { ok: false, error: `Lettura fallita: ${errLettura.message}` };
  if (!rigaRaw) return { ok: false, error: 'Richiesta non trovata' };

  const riga = rigaRaw as unknown as {
    id: string;
    titolo: string;
    descrizione: string | null;
    contatto: string | null;
    cliente_id: string | null;
    cliente_testo: string | null;
    commessa_id: string | null;
    cliente: { ragione_sociale: string } | null;
  };

  // Già convertita: non si crea una seconda commessa per la stessa richiesta.
  if (riga.commessa_id) {
    return { ok: false, error: 'Questa richiesta è già diventata una commessa.' };
  }

  const payload = payloadBozzaDaRichiesta({
    id: riga.id,
    titolo: riga.titolo,
    descrizione: riga.descrizione,
    contatto: riga.contatto,
    clienteId: riga.cliente_id,
    clienteTesto: riga.cliente_testo,
    clienteLabel: riga.cliente?.ragione_sociale ?? null,
  });

  // Numero bozza per-tenant, atomico. I buchi sono ammessi di proposito: una
  // bozza abbandonata non deve lasciare un vuoto nella numerazione vera.
  const { data: numRaw, error: errNum } = await supabase.rpc(
    'genera_numero_bozza' as never,
    { p_tenant_id: ctx.tenantId } as never,
  );
  if (errNum) {
    return { ok: false, error: `Numero bozza non assegnato: ${errNum.message}` };
  }

  const bozzaId = crypto.randomUUID();
  const { error: errIns } = await supabase
    .from('commessa_bozze' as never)
    .insert({
      id: bozzaId,
      tenant_id: ctx.tenantId,
      created_by: ctx.userId,
      numero_bozza: numRaw as unknown as number,
      payload,
      stato: 'attiva',
      last_synced_at: new Date().toISOString(),
    } as never);
  if (errIns) return { ok: false, error: `Bozza non creata: ${errIns.message}` };

  await supabase.from('audit_events').insert({
    tenant_id: ctx.tenantId,
    actor_user_id: ctx.userId,
    actor_role: ctx.role,
    entity_type: 'richiesta',
    entity_id: riga.id,
    action: 'richiesta.converti',
    metadata: { todo_id: riga.id, bozza_id: bozzaId } as unknown as never,
  });

  revalidatePath('/office/todo');
  return { ok: true, data: { bozzaId } };
}
