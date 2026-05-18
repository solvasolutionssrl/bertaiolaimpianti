'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createServerSupabase } from '@impiantixplus/api/server';
import { requireTenantContext } from '@impiantixplus/api/tenant';

const creaInput = z.object({
  oggetto: z.string().min(3),
  descrizione: z.string().min(1),
  clienteId: z.string().uuid().optional(),
  priorita: z
    .enum(['bassa', 'media', 'alta', 'urgente'])
    .default('media'),
  source: z
    .enum(['manual', 'email', 'portal_cliente', 'imported_from_freshdesk'])
    .default('manual'),
});

function genCodiceTicket(slug: string) {
  const anno = new Date().getFullYear();
  const rand = Math.floor(Math.random() * 9000 + 1000);
  return `TKT-${anno}-${rand}`;
}

export async function creaTicket(input: z.infer<typeof creaInput>) {
  const ctx = await requireTenantContext();
  const parsed = creaInput.parse(input);
  const supabase = createServerSupabase();

  const codice = genCodiceTicket(ctx.tenantSlug);
  const { data, error } = await supabase
    .from('tickets')
    .insert({
      tenant_id: ctx.tenantId,
      codice,
      cliente_id: parsed.clienteId ?? null,
      oggetto: parsed.oggetto,
      descrizione: parsed.descrizione,
      stato: 'aperto',
      priorita: parsed.priorita,
      source: parsed.source,
    })
    .select('id, codice')
    .single();
  if (error || !data) throw new Error(error?.message ?? 'INSERT fallita');

  // primo messaggio = descrizione
  if (parsed.descrizione) {
    await supabase.from('ticket_messages').insert({
      tenant_id: ctx.tenantId,
      ticket_id: data.id,
      sender_user_id: ctx.userId,
      body: parsed.descrizione,
    });
  }

  revalidatePath('/office/tickets');
  return { id: data.id, codice: data.codice };
}

const inviaMessaggioInput = z.object({
  ticketId: z.string().uuid(),
  body: z.string().min(1),
  isInternalNote: z.boolean().default(false),
});

export async function inviaMessaggio(input: z.infer<typeof inviaMessaggioInput>) {
  const ctx = await requireTenantContext();
  const parsed = inviaMessaggioInput.parse(input);
  const supabase = createServerSupabase();

  const { error } = await supabase.from('ticket_messages').insert({
    tenant_id: ctx.tenantId,
    ticket_id: parsed.ticketId,
    sender_user_id: ctx.userId,
    body: parsed.body,
    is_internal_note: parsed.isInternalNote,
  });
  if (error) throw new Error(error.message);

  // SLA: se è la prima risposta NON-internal-note inviata dallo staff,
  // marchiamo first_response_at. I ruoli "cliente" non contano come risposta.
  // Stessa update tocca updated_at; saltiamo se non staff o nota interna.
  const isStaff =
    ctx.role === 'owner' ||
    ctx.role === 'admin' ||
    ctx.role === 'office' ||
    ctx.role === 'capo' ||
    ctx.role === 'tecnico';

  const updates: Record<string, string> = {
    updated_at: new Date().toISOString(),
  };

  if (!parsed.isInternalNote && isStaff) {
    // Recupera first_response_at corrente: aggiorniamo solo se NULL.
    const cur = await supabase
      .from('tickets')
      .select('first_response_at')
      .eq('id', parsed.ticketId)
      .maybeSingle();
    if (cur.data && cur.data.first_response_at === null) {
      updates.first_response_at = new Date().toISOString();
    }
  }

  await supabase.from('tickets').update(updates).eq('id', parsed.ticketId);

  revalidatePath(`/office/tickets/${parsed.ticketId}`);
  revalidatePath('/office/tickets');
}

// ---------------------------------------------------------------------------
// SLA + assegnazione round-robin
// ---------------------------------------------------------------------------

const STAFF_ROLES = ['owner', 'admin', 'office', 'capo'] as const;

function assertOfficeRole(role: string): void {
  if (role !== 'owner' && role !== 'admin' && role !== 'office') {
    throw new Error('FORBIDDEN: solo office/admin/owner possono eseguire questa operazione.');
  }
}

const assegnaInput = z.object({ ticketId: z.string().uuid() });

/**
 * Assegna un ticket all'utente staff meno carico del tenant.
 * Carico = numero di ticket nello stato aperto/in_lavorazione/attesa_cliente
 * attualmente assegnati. Tiebreaker casuale.
 */
export async function assegnaRoundRobin(ticketId: string) {
  const ctx = await requireTenantContext();
  assertOfficeRole(ctx.role);
  const parsed = assegnaInput.parse({ ticketId });
  const supabase = createServerSupabase();

  // 1) Carica candidati staff attivi del tenant
  const { data: candidati, error: errCand } = await supabase
    .from('users')
    .select('id, display_name, role')
    .eq('tenant_id', ctx.tenantId)
    .eq('attivo', true)
    .in('role', STAFF_ROLES as unknown as string[]);
  if (errCand) throw new Error(errCand.message);
  if (!candidati || candidati.length === 0) {
    throw new Error('Nessun utente staff disponibile per l assegnazione.');
  }

  // 2) Conta ticket aperti per ciascun candidato
  const conteggi: Array<{ id: string; carico: number; rnd: number }> = [];
  for (const u of candidati) {
    const { count, error } = await supabase
      .from('tickets')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', ctx.tenantId)
      .eq('assegnato_a', u.id)
      .in('stato', ['aperto', 'in_lavorazione', 'attesa_cliente']);
    if (error) throw new Error(error.message);
    conteggi.push({ id: u.id, carico: count ?? 0, rnd: Math.random() });
  }

  // 3) Sort: meno carico prima, tiebreaker random
  conteggi.sort((a, b) => a.carico - b.carico || a.rnd - b.rnd);
  const vincitore = conteggi[0];
  if (!vincitore) {
    // Difensivo: candidati > 0 garantisce vincitore != undefined, ma TS non lo deduce.
    throw new Error('Impossibile selezionare un destinatario.');
  }

  // 4) Recupera stato precedente (per audit) + esegue update
  const prev = await supabase
    .from('tickets')
    .select('assegnato_a')
    .eq('id', parsed.ticketId)
    .maybeSingle();

  const { error: errUpd } = await supabase
    .from('tickets')
    .update({ assegnato_a: vincitore.id })
    .eq('id', parsed.ticketId);
  if (errUpd) throw new Error(errUpd.message);

  // 5) Audit log
  const prevAssegnato = (prev.data as { assegnato_a: string | null } | null)?.assegnato_a ?? null;
  await supabase.from('audit_events').insert({
    tenant_id: ctx.tenantId,
    actor_user_id: ctx.userId,
    actor_role: ctx.role,
    entity_type: 'ticket',
    entity_id: parsed.ticketId,
    action: 'assign',
    before_data: { assegnato_a: prevAssegnato },
    after_data: { assegnato_a: vincitore.id },
    metadata: { strategy: 'round_robin', carico: vincitore.carico },
  });

  revalidatePath(`/office/tickets/${parsed.ticketId}`);
  revalidatePath('/office/tickets');
  return { assegnatoA: vincitore.id, carico: vincitore.carico };
}

const aggiornaPrioritaInput = z.object({
  ticketId: z.string().uuid(),
  nuovaPriorita: z.enum(['bassa', 'media', 'alta', 'urgente']),
});

/**
 * Aggiorna la priorità di un ticket e ricalcola i target SLA
 * (target_response_at / target_close_at) usando la sla_policy del tenant
 * per la NUOVA priorità. I target sono ancorati a tickets.created_at.
 */
export async function aggiornaPriorita(input: z.infer<typeof aggiornaPrioritaInput>) {
  const ctx = await requireTenantContext();
  assertOfficeRole(ctx.role);
  const parsed = aggiornaPrioritaInput.parse(input);
  const supabase = createServerSupabase();

  // 1) Carica ticket corrente
  const { data: ticket, error: errTk } = await supabase
    .from('tickets')
    .select('id, created_at, priorita, target_response_at, target_close_at')
    .eq('id', parsed.ticketId)
    .maybeSingle();
  if (errTk) throw new Error(errTk.message);
  if (!ticket) throw new Error('Ticket non trovato.');

  // 2) Carica policy SLA per la nuova priorità (se manca, lasciamo target invariati)
  const { data: policy } = await supabase
    .from('sla_policy')
    .select('response_minutes, close_minutes')
    .eq('tenant_id', ctx.tenantId)
    .eq('priorita', parsed.nuovaPriorita)
    .maybeSingle();

  const updates: Record<string, string | null> = {
    priorita: parsed.nuovaPriorita,
  };

  if (policy) {
    const createdMs = new Date(ticket.created_at).getTime();
    updates.target_response_at = new Date(
      createdMs + policy.response_minutes * 60_000,
    ).toISOString();
    updates.target_close_at = new Date(
      createdMs + policy.close_minutes * 60_000,
    ).toISOString();
  }

  const { error: errUpd } = await supabase
    .from('tickets')
    .update(updates)
    .eq('id', parsed.ticketId);
  if (errUpd) throw new Error(errUpd.message);

  // 3) Audit
  await supabase.from('audit_events').insert({
    tenant_id: ctx.tenantId,
    actor_user_id: ctx.userId,
    actor_role: ctx.role,
    entity_type: 'ticket',
    entity_id: parsed.ticketId,
    action: 'update',
    before_data: {
      priorita: ticket.priorita,
      target_response_at: ticket.target_response_at,
      target_close_at: ticket.target_close_at,
    },
    after_data: updates,
    metadata: { field: 'priorita', sla_recalculated: Boolean(policy) },
  });

  revalidatePath(`/office/tickets/${parsed.ticketId}`);
  revalidatePath('/office/tickets');
  return { sla_recalculated: Boolean(policy) };
}

const convertiInput = z.object({
  ticketId: z.string().uuid(),
});

export async function convertiInCommessa(input: z.infer<typeof convertiInput>) {
  const parsed = convertiInput.parse(input);
  const supabase = createServerSupabase();

  // 1) Tentativo Edge Function
  try {
    const { data, error } = await supabase.functions.invoke('convert-ticket', {
      body: { ticketId: parsed.ticketId },
    });
    if (!error && data?.commessaId) {
      revalidatePath('/office/tickets');
      revalidatePath(`/office/tickets/${parsed.ticketId}`);
      return { commessaId: data.commessaId as string };
    }
  } catch {
    // fallthrough
  }

  // 2) Fallback minimal: crea commessa con cliente del ticket e link
  const ctx = await requireTenantContext();
  const tk = await supabase
    .from('tickets')
    .select('cliente_id, oggetto')
    .eq('id', parsed.ticketId)
    .maybeSingle();
  if (!tk.data?.cliente_id)
    throw new Error('Ticket senza cliente: assegnane uno prima di convertire.');

  const cod = await supabase.rpc('genera_codice_commessa', {
    p_tenant_slug: ctx.tenantSlug,
  });
  if (cod.error) throw new Error(cod.error.message);

  const cliente = await supabase
    .from('clienti')
    .select('ragione_sociale')
    .eq('id', tk.data.cliente_id)
    .maybeSingle();
  const oggi = new Date().toISOString().slice(0, 10);
  const safe = (cliente.data?.ragione_sociale ?? 'Commessa')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .slice(0, 32);
  const nome = `${safe}_${oggi}_DaTicket`;

  const ins = await supabase
    .from('commesse')
    .insert({
      tenant_id: ctx.tenantId,
      cliente_id: tk.data.cliente_id,
      codice_interno: cod.data as string,
      nome_cartella: nome,
      ticket_id: parsed.ticketId,
      stato: 'aperta',
      descrizione_ai_proposta: tk.data.oggetto,
    })
    .select('id')
    .single();
  if (ins.error || !ins.data) throw new Error(ins.error?.message ?? 'INSERT fallita');

  revalidatePath('/office/tickets');
  revalidatePath(`/office/tickets/${parsed.ticketId}`);
  return { commessaId: ins.data.id };
}
