'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { createServerSupabase } from '@impiantixplus/api/server';
import { createServiceSupabase } from '@impiantixplus/api/service';

import { requirePortalContext } from '../_lib/portal-context';

const inputSchema = z.object({
  oggetto: z
    .string({ required_error: 'Inserisci un oggetto' })
    .trim()
    .min(3, 'L\'oggetto deve avere almeno 3 caratteri')
    .max(200, 'Oggetto troppo lungo'),
  descrizione: z
    .string({ required_error: 'Descrivi la richiesta' })
    .trim()
    .min(10, 'Descrivi la richiesta con almeno 10 caratteri')
    .max(5000, 'Descrizione troppo lunga'),
  commessaId: z
    .string()
    .uuid('ID commessa non valido')
    .optional()
    .or(z.literal('').transform(() => undefined)),
});

export interface CreaTicketResult {
  ok: boolean;
  message: string;
  ticketCodice?: string;
}

/**
 * Server Action: crea un ticket dal portale cliente.
 *
 * - `source = 'portal_cliente'` come da spec `Architettura_Soluzione.md §6.2`
 * - `cliente_id` letto dal contesto portale (mai dal form input)
 * - se `commessaId` opzionale è valorizzato e appartiene al cliente, lo
 *   colleghiamo via `commesse.ticket_id` (un commessa→ticket; ma è una
 *   richiesta "su una commessa esistente" quindi è il caso d'uso giusto:
 *   se la commessa ha già un ticket "padre", aggiungiamo un messaggio
 *   anziché creare un nuovo ticket — TODO da raffinare con db-agent).
 * - notifica ufficio: inseriamo riga in `notifiche` per ogni utente staff
 *   del tenant con ruolo office/admin/owner (best-effort, via service_role
 *   per bypassare RLS `notifiche_self`).
 *
 * Genera un `codice` ticket leggibile: TKT-AAAA-NNNNN per tenant.
 */
export async function creaTicketDaPortale(
  _prev: CreaTicketResult | null,
  formData: FormData,
): Promise<CreaTicketResult> {
  const parsed = inputSchema.safeParse({
    oggetto: formData.get('oggetto') ?? '',
    descrizione: formData.get('descrizione') ?? '',
    commessaId: formData.get('commessaId') ?? '',
  });
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? 'Dati non validi',
    };
  }
  const input = parsed.data;

  const ctx = await requirePortalContext();
  const supabase = createServerSupabase();

  // Genera codice ticket per-tenant-per-anno usando un counter su tickets.
  // Per semplicità: count(*) + 1 nell'anno corrente, padded a 5 cifre.
  // (Race condition tollerata in v1: la UNIQUE (tenant_id, codice) farà
  // sbarrare i duplicati e l'UI dovrà rifare. Refactor futuro: funzione
  // SQL atomica analoga a `genera_codice_commessa`.)
  const anno = new Date().getFullYear();
  const { count } = await supabase
    .from('tickets')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', ctx.tenantId)
    .gte('created_at', `${anno}-01-01T00:00:00.000Z`)
    .lt('created_at', `${anno + 1}-01-01T00:00:00.000Z`);
  const progressivo = String((count ?? 0) + 1).padStart(5, '0');
  const codice = `TKT-${anno}-${progressivo}`;

  // Insert ticket. RLS `tickets_tenant_scope` permette al cliente loggato di
  // inserire SOLO se tenant_id == current_tenant_id() (e dovrebbe inoltre
  // limitare a `cliente_id = claim cliente_id` — vedi nota RLS in fondo).
  const { data: ticket, error: insertErr } = await supabase
    .from('tickets')
    .insert({
      tenant_id: ctx.tenantId,
      codice,
      cliente_id: ctx.clienteId,
      oggetto: input.oggetto,
      descrizione: input.descrizione,
      stato: 'aperto',
      priorita: 'media',
      source: 'portal_cliente',
    })
    .select('id, codice')
    .single<{ id: string; codice: string }>();

  if (insertErr || !ticket) {
    console.error('[portal/creaTicket]', insertErr?.message);
    return {
      ok: false,
      message:
        'Non siamo riusciti a inviare la richiesta. Riprova tra qualche minuto.',
    };
  }

  // Primo messaggio = descrizione del cliente (mittente esterno).
  await supabase.from('ticket_messages').insert({
    tenant_id: ctx.tenantId,
    ticket_id: ticket.id,
    body: input.descrizione,
    sender_external_email: ctx.email,
    is_internal_note: false,
  });

  // Eventuale link commessa esistente (best-effort, non bloccante).
  if (input.commessaId) {
    await supabase
      .from('commesse')
      .update({ ticket_id: ticket.id })
      .eq('id', input.commessaId)
      .eq('cliente_id', ctx.clienteId)
      .is('ticket_id', null);
  }

  // Notifica staff ufficio (service_role: bypass RLS notifiche_self).
  try {
    const service = createServiceSupabase();
    const { data: staff } = await service
      .from('users')
      .select('id')
      .eq('tenant_id', ctx.tenantId)
      .in('role', ['office', 'admin', 'owner'])
      .eq('attivo', true)
      .returns<{ id: string }[]>();
    if (staff && staff.length > 0) {
      await service.from('notifiche').insert(
        staff.map((u) => ({
          tenant_id: ctx.tenantId,
          user_id: u.id,
          tipo: 'ticket_nuovo_portale',
          titolo: `Nuova richiesta da ${ctx.cliente.ragioneSociale}`,
          corpo: `${ticket.codice} — ${input.oggetto}`,
          link: `/office/tickets/${ticket.id}`,
        })),
      );
    }
  } catch (e) {
    console.warn('[portal/creaTicket] notifiche staff fallite', e);
  }

  revalidatePath('/');
  if (input.commessaId) revalidatePath(`/commessa/${input.commessaId}`);

  return {
    ok: true,
    message: `Richiesta inviata. Riferimento: ${ticket.codice}. L'ufficio ti contatterà al più presto.`,
    ticketCodice: ticket.codice,
  };
}
