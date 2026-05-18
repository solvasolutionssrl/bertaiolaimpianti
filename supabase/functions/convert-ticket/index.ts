// =====================================================================
// convert-ticket — POST /convert-ticket
// Trasforma un ticket aperto in una commessa, riusando la logica di
// create-commessa.
//
// Body:
//   { ticketId: uuid, descrizioneFinale?: string, voci?: number[], presetId?: uuid }
//
// Effetti:
//   - crea commessa con `ticket_id` valorizzato
//   - aggiorna ticket: `commessa_id`-equivalente (per ora `stato='in_lavorazione'`,
//     il riferimento inverso vive su `commesse.ticket_id`)
//   - audit event
//
// Spec: Architettura_Soluzione.md §6 "convertTicketToCommessa".
// =====================================================================

import { corsHeaders, errorResponse, handlePreflight, jsonResponse } from '../_shared/cors.ts';
import { resolveJwtContext, serviceClient, userClient } from '../_shared/supabase.ts';
import { createCommessa, type CreateCommessaRequest } from '../create-commessa/index.ts';

interface ConvertTicketRequest {
  ticketId: string;
  descrizioneFinale?: string;
  voci?: number[];
  presetId?: string;
  indirizzoCantiere?: string;
}

const ALLOWED_ROLES = new Set(['owner', 'admin', 'office', 'capo']);

Deno.serve(async (req: Request) => {
  const pre = handlePreflight(req);
  if (pre) return pre;
  if (req.method !== 'POST') return errorResponse(405, 'Method not allowed');

  let ctx;
  try {
    const sb = userClient(req.headers.get('Authorization'));
    ctx = await resolveJwtContext(sb);
  } catch {
    return errorResponse(401, 'Missing Authorization');
  }
  if (!ctx) return errorResponse(401, 'Unauthenticated');
  if (!ALLOWED_ROLES.has(ctx.role)) {
    return errorResponse(403, `Role ${ctx.role} cannot convert tickets`);
  }

  let body: ConvertTicketRequest;
  try {
    body = await req.json();
  } catch {
    return errorResponse(400, 'Invalid JSON body');
  }
  if (!body.ticketId) return errorResponse(400, 'ticketId required');

  const admin = serviceClient();

  // 1) Carica ticket (scope-tenant) ---------------------------------------
  const { data: ticket, error: terr } = await admin
    .from('tickets')
    .select('*')
    .eq('id', body.ticketId)
    .eq('tenant_id', ctx.tenantId)
    .single();
  if (terr || !ticket) return errorResponse(404, 'Ticket non trovato');

  // 2) Prepara payload create-commessa -----------------------------------
  const descrizioneFinale =
    body.descrizioneFinale?.trim() ||
    (ticket.oggetto as string | null)?.trim() ||
    'Intervento';

  const createBody: CreateCommessaRequest = {
    clienteId: ticket.cliente_id ?? undefined,
    voci: body.voci ?? [],
    descrizioneFinale,
    presetId: body.presetId,
    indirizzoCantiere: body.indirizzoCantiere,
    ticketId: ticket.id,
  };

  // Se il ticket non ha cliente_id (es. inbound email senza match) → errore.
  if (!createBody.clienteId) {
    return errorResponse(
      422,
      'Il ticket non ha un cliente collegato: completare l\'anagrafica prima di convertire.',
    );
  }

  // 3) Crea la commessa ---------------------------------------------------
  let result;
  try {
    result = await createCommessa(ctx, createBody);
  } catch (e) {
    console.error('[convert-ticket] createCommessa failed', e);
    return errorResponse(500, 'create_commessa_failed', String(e));
  }

  // 4) Aggiorna stato ticket: in_lavorazione -----------------------------
  await admin
    .from('tickets')
    .update({ stato: 'in_lavorazione' })
    .eq('id', ticket.id);

  // 5) Audit specifico conversione ---------------------------------------
  await admin.from('audit_events').insert({
    tenant_id: ctx.tenantId,
    actor_user_id: ctx.userId,
    actor_role: ctx.role,
    entity_type: 'ticket',
    entity_id: ticket.id,
    action: 'convert_to_commessa',
    after_data: {
      commessa_id: (result.commessa as { id: string }).id,
      codice_interno: result.codiceInterno,
    },
  });

  return jsonResponse(
    {
      ...result,
      ticketId: ticket.id,
    },
    { headers: corsHeaders },
  );
});
