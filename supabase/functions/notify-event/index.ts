// =====================================================================
// notify-event — handler universale per eventi che generano notifiche.
//
// Routes (POST con shared secret in `x-webhook-secret`):
//   type=file_ref.insert        → controlla se target foto raggiunto
//   type=ticket.assigned        → notifica al nuovo assegnatario
//   type=ticket.created         → notifica al team supporto del tenant
//   type=cron.fasi_zero_foto    → fasi senza foto da >3gg
//   type=cron.dico_mancante     → 7gg dopo collaudo senza DICO
//
// Canali: in-app (`notifiche`) + Web Push (`push_subscriptions`)
//         + Email (Resend) come fallback / per eventi critici.
//
// Configurato come:
//  - Database Webhook (Supabase Studio → Database → Webhooks) su INSERT
//    di `file_refs`, `tickets`. Header `x-webhook-secret`.
//  - pg_cron schedule che chiama questa funzione con type=cron.*
//
// Spec: Architettura_Soluzione.md §8 "Notifiche".
// =====================================================================

import { errorResponse, handlePreflight, jsonResponse } from '../_shared/cors.ts';
import { serviceClient, type SupabaseClient } from '../_shared/supabase.ts';

interface NotifyEvent {
  type: string;
  // Database webhook payload (Supabase format):
  table?: string;
  record?: Record<string, unknown>;
  old_record?: Record<string, unknown>;
  schema?: string;
  // Cron job payload (custom):
  tenant_id?: string;
}

Deno.serve(async (req: Request) => {
  const pre = handlePreflight(req);
  if (pre) return pre;
  if (req.method !== 'POST') return errorResponse(405, 'Method not allowed');

  // Verifica secret condiviso (configurato sia in DB webhook che pg_cron)
  const expected = Deno.env.get('NOTIFY_WEBHOOK_SECRET');
  const got = req.headers.get('x-webhook-secret');
  if (!expected || got !== expected) {
    return errorResponse(401, 'Invalid webhook secret');
  }

  let evt: NotifyEvent;
  try {
    evt = await req.json();
  } catch {
    return errorResponse(400, 'Invalid JSON');
  }

  const admin = serviceClient();

  try {
    switch (evt.type) {
      case 'file_ref.insert':
      case 'INSERT': {
        // Caso DB webhook su file_refs: arriva senza `type=file_ref.insert`,
        // discriminiamo sulla tabella.
        if (evt.table === 'file_refs' || evt.type === 'file_ref.insert') {
          await handleFileRefInsert(admin, evt.record ?? {});
        } else if (evt.table === 'tickets') {
          await handleTicketCreated(admin, evt.record ?? {});
        }
        break;
      }
      case 'UPDATE': {
        if (evt.table === 'tickets') {
          await handleTicketUpdate(admin, evt.record ?? {}, evt.old_record ?? {});
        }
        break;
      }
      case 'ticket.assigned':
        await handleTicketAssigned(admin, evt.record ?? {});
        break;
      case 'cron.fasi_zero_foto':
        await cronFasiZeroFoto(admin, evt.tenant_id);
        break;
      case 'cron.dico_mancante':
        await cronDicoMancante(admin, evt.tenant_id);
        break;
      default:
        console.warn('[notify-event] unhandled type', evt.type, 'table', evt.table);
    }
  } catch (e) {
    console.error('[notify-event] handler failed', e);
    return errorResponse(500, 'handler_failed', String(e));
  }

  return jsonResponse({ ok: true });
});

// ----------------------------------------------------------------------
// Handlers
// ----------------------------------------------------------------------

async function handleFileRefInsert(admin: SupabaseClient, rec: Record<string, unknown>) {
  const commessaId = rec.commessa_id as string | undefined;
  const voceId = rec.voce_id as number | undefined;
  const tenantId = rec.tenant_id as string | undefined;
  if (!commessaId || !voceId || !tenantId) return;

  // Leggi conteggio aggiornato e minimo richiesto
  const { data: cv } = await admin
    .from('commessa_voci')
    .select('foto_caricate_count, min_foto_richieste')
    .eq('commessa_id', commessaId)
    .eq('voce_id', voceId)
    .single();
  if (!cv) return;
  if (cv.min_foto_richieste <= 0) return;
  if (cv.foto_caricate_count !== cv.min_foto_richieste) return;
  // Target appena raggiunto → notifica al responsabile.
  const { data: commessa } = await admin
    .from('commesse')
    .select('id,codice_interno,responsabile_id,nome_cartella')
    .eq('id', commessaId)
    .single();
  if (!commessa?.responsabile_id) return;

  await deliverNotification(admin, {
    tenantId,
    userId: commessa.responsabile_id,
    type: 'fase_target_raggiunto',
    title: `Foto complete: ${commessa.codice_interno}`,
    body: `La fase ha raggiunto il numero minimo di foto richieste.`,
    url: `/commesse/${commessa.id}`,
    payload: { commessa_id: commessa.id, voce_id: voceId },
  });
}

async function handleTicketCreated(admin: SupabaseClient, rec: Record<string, unknown>) {
  const tenantId = rec.tenant_id as string | undefined;
  if (!tenantId) return;
  // Notifica a tutti gli office/admin del tenant
  const { data: officeUsers } = await admin
    .from('users')
    .select('id')
    .eq('tenant_id', tenantId)
    .in('role', ['admin', 'office', 'owner'])
    .eq('attivo', true);
  if (!officeUsers) return;
  for (const u of officeUsers) {
    await deliverNotification(admin, {
      tenantId,
      userId: u.id,
      type: 'ticket_created',
      title: `Nuovo ticket: ${rec.codice ?? ''}`,
      body: String(rec.oggetto ?? '').slice(0, 160),
      url: `/tickets/${rec.id}`,
      payload: { ticket_id: rec.id, codice: rec.codice },
    });
  }
}

async function handleTicketUpdate(
  admin: SupabaseClient,
  rec: Record<string, unknown>,
  old: Record<string, unknown>,
) {
  // Cambio assegnatario → notifica nuovo assegnatario
  if (rec.assegnato_a && rec.assegnato_a !== old.assegnato_a) {
    await handleTicketAssigned(admin, rec);
  }
}

async function handleTicketAssigned(admin: SupabaseClient, rec: Record<string, unknown>) {
  const tenantId = rec.tenant_id as string | undefined;
  const userId = rec.assegnato_a as string | undefined;
  if (!tenantId || !userId) return;
  await deliverNotification(admin, {
    tenantId,
    userId,
    type: 'ticket_assigned',
    title: `Ticket assegnato: ${rec.codice ?? ''}`,
    body: String(rec.oggetto ?? '').slice(0, 160),
    url: `/tickets/${rec.id}`,
    payload: { ticket_id: rec.id },
  });
}

async function cronFasiZeroFoto(admin: SupabaseClient, tenantId?: string) {
  // Fasi `in_corso` o `da_iniziare` di commesse `aperta`/`in_corso` con
  // `min_foto_richieste > 0` e `foto_caricate_count = 0` da >3 giorni.
  const threshold = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
  let q = admin
    .from('commessa_voci')
    .select('commessa_id, voce_id, tenant_id, updated_at, foto_caricate_count, min_foto_richieste')
    .lt('updated_at', threshold)
    .eq('foto_caricate_count', 0)
    .gt('min_foto_richieste', 0)
    .in('stato', ['da_iniziare', 'in_corso']);
  if (tenantId) q = q.eq('tenant_id', tenantId);

  const { data: fasi } = await q;
  if (!fasi) return;

  for (const f of fasi) {
    const { data: commessa } = await admin
      .from('commesse')
      .select('id,codice_interno,responsabile_id,nome_cartella,stato')
      .eq('id', f.commessa_id)
      .single();
    if (!commessa?.responsabile_id) continue;
    if (commessa.stato === 'completata' || commessa.stato === 'archiviata') continue;

    await deliverNotification(admin, {
      tenantId: f.tenant_id,
      userId: commessa.responsabile_id,
      type: 'fase_zero_foto',
      title: `Fase senza foto da 3+ giorni`,
      body: `Commessa ${commessa.codice_interno}: ricordati di caricare le foto.`,
      url: `/commesse/${commessa.id}`,
      payload: { commessa_id: commessa.id, voce_id: f.voce_id },
    });
  }
}

async function cronDicoMancante(admin: SupabaseClient, tenantId?: string) {
  // Commesse in stato 'collaudo' da >7 giorni che non hanno alcun file
  // nella cartella DICO (voce_id 22 indicativa; cerchiamo file_refs con
  // path che include "DICO").
  const threshold = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  let q = admin
    .from('commesse')
    .select('id,tenant_id,codice_interno,responsabile_id,updated_at')
    .eq('stato', 'collaudo')
    .lt('updated_at', threshold);
  if (tenantId) q = q.eq('tenant_id', tenantId);

  const { data: commesse } = await q;
  if (!commesse) return;

  for (const c of commesse) {
    const { data: dicoFiles } = await admin
      .from('file_refs')
      .select('id')
      .eq('commessa_id', c.id)
      .ilike('path', '%DICO%')
      .limit(1);
    if (dicoFiles && dicoFiles.length > 0) continue;
    if (!c.responsabile_id) continue;

    await deliverNotification(admin, {
      tenantId: c.tenant_id,
      userId: c.responsabile_id,
      type: 'dico_mancante',
      title: `DICO mancante a 7gg dal collaudo`,
      body: `Commessa ${c.codice_interno}: caricare il DICO.`,
      url: `/commesse/${c.id}`,
      payload: { commessa_id: c.id },
    });
  }
}

// ----------------------------------------------------------------------
// Delivery: in-app + push + email
// ----------------------------------------------------------------------

interface DeliverInput {
  tenantId: string;
  userId: string;
  type: string; // event_code: deve combaciare con notification_event_types.code
  title: string;
  body: string;
  url?: string;
  payload?: Record<string, unknown>;
}

async function deliverNotification(admin: SupabaseClient, n: DeliverInput) {
  // 1) In-app
  await admin.from('notifiche').insert({
    tenant_id: n.tenantId,
    user_id: n.userId,
    type: n.type,
    payload: { title: n.title, body: n.body, url: n.url, ...n.payload },
  });

  // 2) Web Push via relay Next.js (Deno non ha facile web-push lib)
  try {
    await deliverPushViaRelay({
      userId: n.userId,
      title: n.title,
      body: n.body,
      url: n.url,
      eventCode: n.type,
      payload: n.payload,
    });
  } catch (e) {
    console.error('[notify-event] push relay failed', e);
  }

  // 3) Email fallback per eventi critici (DICO mancante, ticket assigned)
  if (['dico_mancante', 'ticket_assigned'].includes(n.type)) {
    try {
      const { data: u } = await admin
        .from('users')
        .select('id, display_name')
        .eq('id', n.userId)
        .single();
      // L'email vive in auth.users; usiamo admin API
      const { data: authUser } = await admin.auth.admin.getUserById(n.userId);
      const email = authUser?.user?.email;
      if (email) {
        await sendEmail(email, `[impiantiXplus] ${n.title}`, `${n.body}\n\n${n.url ?? ''}\n`);
      }
    } catch (e) {
      console.error('[notify-event] email fallback failed', e);
    }
  }
}

// ----------------------------------------------------------------------
// Web Push (VAPID, no SDK — implementazione minimale via fetch)
// ----------------------------------------------------------------------
// Web Push spec richiede: cifratura ECDH del payload con la chiave del client +
// firma JWT VAPID. Implementazione "from scratch" in Deno è non banale; per
// brevità qui invochiamo un endpoint helper (web-push CDN) o lasciamo un
// placeholder che potrà delegare a una libreria esm.sh quando disponibile.
//
// Per il pilot Bertaiola la PWA può comunque ricevere notifiche via SSE/
// Realtime di Supabase su `notifiche`; il push è bonus.
// ----------------------------------------------------------------------
async function deliverPushViaRelay(input: {
  userId: string;
  title: string;
  body: string;
  url?: string;
  eventCode: string;
  payload?: Record<string, unknown>;
}): Promise<void> {
  const relay = Deno.env.get('PUSH_RELAY_URL');
  const secret = Deno.env.get('NOTIFY_WEBHOOK_SECRET');
  if (!relay || !secret) {
    console.warn('[notify-event] relay non configurato (PUSH_RELAY_URL/NOTIFY_WEBHOOK_SECRET)');
    return;
  }
  const res = await fetch(relay, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-webhook-secret': secret,
    },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    console.error('[notify-event] relay failed', res.status, txt.slice(0, 200));
  }
}

async function sendEmail(to: string, subject: string, text: string): Promise<void> {
  const apiKey = Deno.env.get('RESEND_API_KEY');
  if (!apiKey) return;
  const from = Deno.env.get('RESEND_FROM') ?? 'impiantiXplus <notify@impiantixplus.it>';
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from, to, subject, text }),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`Resend ${res.status}: ${txt.slice(0, 200)}`);
  }
}
