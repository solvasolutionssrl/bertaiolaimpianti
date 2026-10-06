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
import { segretoValido } from '../_shared/segreto.ts';
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

  // Verifica secret condiviso (configurato sia in DB webhook che pg_cron).
  // `verify_jwt = false`: il segreto e' l'unica difesa, quindi confronto a
  // tempo costante e non `===` (vedi `_shared/segreto.ts`).
  const expected = Deno.env.get('NOTIFY_WEBHOOK_SECRET');
  const got = req.headers.get('x-webhook-secret');
  if (!segretoValido(got, expected)) {
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
      case 'INSERT': {
        if (evt.table === 'tickets') {
          await handleTicketCreated(admin, evt.record ?? {});
        }
        break;
      }
      // `file_ref.insert` e `cron.fasi_zero_foto` non si gestiscono piu':
      // vedi la nota sui due gestori ritirati, sotto.
      case 'file_ref.insert':
      case 'cron.fasi_zero_foto':
        break;
      case 'UPDATE': {
        if (evt.table === 'tickets') {
          await handleTicketUpdate(admin, evt.record ?? {}, evt.old_record ?? {});
        }
        break;
      }
      case 'ticket.assigned':
        await handleTicketAssigned(admin, evt.record ?? {});
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

/**
 * ⚠️ RITIRATI il 07/10/2026: `handleFileRefInsert` (notifica
 * «fase_target_raggiunto») e `cronFasiZeroFoto` (notifica «fase_zero_foto»).
 *
 * Dipendevano entrambi da `commessa_voci.foto_caricate_count`, che si
 * incrementa solo quando un media viene caricato **con la fase indicata**. In
 * produzione: `voce_id` valorizzato su 0 file su 346, `min_foto_richieste > 0`
 * su 0 righe su 2650, notifiche di quei due tipi mai inviate: 0. Erano codice
 * che sembrava vivo e non poteva partire.
 *
 * Togliendo il campo «Fase» dal caricamento sarebbero diventati pericolosi,
 * non solo inutili: il contatore resta a zero per sempre, e il cron avrebbe
 * mandato «fase senza foto da 3 giorni» in eterno su commesse piene di foto.
 * Un avviso che grida sempre insegna a ignorare tutti gli avvisi.
 */

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
        await sendEmail(email, `[Kommessa] ${n.title}`, `${n.body}\n\n${n.url ?? ''}\n`);
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
  const from = Deno.env.get('RESEND_FROM') ?? 'Kommessa <notify@kommessa.it>';
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
