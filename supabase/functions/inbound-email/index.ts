// =====================================================================
// inbound-email — webhook Resend "email.received".
//
// Flusso:
//  1. Verifica HMAC firma webhook (header `x-resend-signature`,
//     secret `RESEND_INBOUND_SECRET`)
//  2. Parse del payload: from, to, subject, text/html, attachments
//  3. Identifica il tenant dall'indirizzo TO
//     (match su `tenants.inbound_email` se presente, fallback dominio
//     `tenants.slug@…` configurato).
//  4. Dedupe cliente da email mittente (`clienti.email` array contiene from)
//  5. Crea ticket `source='email'`
//  6. Scarica + uploada attachments via storage provider del tenant in
//     `Documenti/email/<ticket-codice>/`
//  7. Inserisce `ticket_messages` con corpo email + ref attachments
//  8. Auto-reply al mittente con il codice ticket
//
// La tabella `tenants` non ha un campo `inbound_email` esplicito nelle
// migrations attuali: lo cerchiamo in `storage_config.inbound_email`
// (estensibile) e usiamo come fallback il match sul dominio TO con un
// claim "inbound_address" in `tenants` (TBD migration successiva).
// =====================================================================

import { errorResponse, handlePreflight, jsonResponse } from '../_shared/cors.ts';
import { serviceClient } from '../_shared/supabase.ts';
import { buildStorageProvider } from '../_shared/storage.ts';

interface ResendInboundAttachment {
  filename: string;
  content_type?: string;
  contentType?: string;
  url?: string;            // signed URL temporaneo lato Resend
  content?: string;        // alternativa: base64 (raramente usato)
}

interface ResendInboundPayload {
  type?: string;             // "email.received"
  created_at?: string;
  data?: {
    from?: string | { email?: string; name?: string };
    to?: string[] | string;
    subject?: string;
    text?: string;
    html?: string;
    headers?: Record<string, string>;
    attachments?: ResendInboundAttachment[];
    message_id?: string;
  };
}

Deno.serve(async (req: Request) => {
  const pre = handlePreflight(req);
  if (pre) return pre;
  if (req.method !== 'POST') return errorResponse(405, 'Method not allowed');

  const rawBody = await req.text();
  const signature = req.headers.get('x-resend-signature') ?? req.headers.get('svix-signature');
  const secret = Deno.env.get('RESEND_INBOUND_SECRET');
  if (!secret) return errorResponse(500, 'RESEND_INBOUND_SECRET not configured');

  const valid = await verifyHmac(rawBody, signature, secret);
  if (!valid) {
    console.error('[inbound-email] invalid signature');
    return errorResponse(401, 'Invalid signature');
  }

  let payload: ResendInboundPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return errorResponse(400, 'Invalid JSON');
  }

  const data = payload.data ?? {};
  const fromEmail = typeof data.from === 'string'
    ? extractEmail(data.from)
    : (data.from?.email ?? '').toLowerCase();
  const fromName = typeof data.from === 'object' ? (data.from?.name ?? '') : '';
  const toList = Array.isArray(data.to)
    ? data.to.map((s) => s.toLowerCase())
    : data.to
      ? [String(data.to).toLowerCase()]
      : [];
  const subject = (data.subject ?? '').trim() || '(senza oggetto)';
  const text = data.text ?? '';
  const html = data.html ?? '';
  const attachments = data.attachments ?? [];

  if (!fromEmail) return errorResponse(400, 'Cannot parse `from` email');
  if (!toList.length) return errorResponse(400, 'Missing `to`');

  const admin = serviceClient();

  // 1) Identifica tenant dal TO
  const tenant = await findTenantByInboundAddress(admin, toList);
  if (!tenant) {
    console.error('[inbound-email] no tenant matched for TO:', toList);
    return errorResponse(404, 'Tenant non identificato dall\'indirizzo destinatario');
  }

  // 2) Dedupe cliente per email mittente
  const cliente = await upsertClienteFromEmail(admin, tenant.id, fromEmail, fromName);

  // 3) Crea ticket
  const ticketCodice = await generateTicketCode(admin, tenant.id);
  const { data: ticket, error: tinsErr } = await admin
    .from('tickets')
    .insert({
      tenant_id: tenant.id,
      codice: ticketCodice,
      cliente_id: cliente?.id ?? null,
      oggetto: subject.slice(0, 200),
      descrizione: text.slice(0, 4000),
      stato: 'aperto',
      priorita: 'media',
      source: 'email',
    })
    .select('*')
    .single();
  if (tinsErr || !ticket) {
    console.error('[inbound-email] ticket insert failed', tinsErr);
    return errorResponse(500, 'ticket_insert_failed', tinsErr?.message);
  }

  // 4) Upload attachments via storage provider del tenant
  const uploadedRefs: Array<{ filename: string; path: string; size: number }> = [];
  if (attachments.length > 0) {
    try {
      const storage = buildStorageProvider({
        storage_provider: tenant.storage_provider,
        storage_config: (tenant.storage_config ?? {}) as Record<string, unknown>,
      });
      const folder = `Documenti/email/${ticketCodice}`;
      await storage.createFolder(folder);

      for (const att of attachments) {
        try {
          const blob = await fetchAttachment(att);
          if (!blob) continue;
          const safeName = att.filename.replace(/[/\\]/g, '_').slice(0, 200);
          const dest = `${folder}/${safeName}`;
          const up = await storage.uploadFile(dest, blob, {
            contentType: att.content_type ?? att.contentType ?? 'application/octet-stream',
          });

          // file_refs: nota — `commessa_id` è NOT NULL nella migration attuale.
          // Per allegati di ticket senza commessa li tracciamo solo in
          // `ticket_messages.attachments` (jsonb) per ora. Una migration
          // futura renderà `commessa_id` nullable per i file allegati a ticket.
          uploadedRefs.push({ filename: safeName, path: up.path, size: up.size });
        } catch (e) {
          console.error('[inbound-email] attachment upload failed', att.filename, e);
        }
      }
    } catch (e) {
      console.error('[inbound-email] storage init failed', e);
    }
  }

  // 5) Insert ticket_messages
  const { error: mErr } = await admin.from('ticket_messages').insert({
    tenant_id: tenant.id,
    ticket_id: ticket.id,
    sender_user_id: null,
    sender_external_email: fromEmail,
    body: text || stripHtml(html),
    attachments: uploadedRefs,
    is_internal_note: false,
  });
  if (mErr) console.error('[inbound-email] ticket_messages insert failed', mErr);

  // 6) Audit
  await admin.from('audit_events').insert({
    tenant_id: tenant.id,
    entity_type: 'ticket',
    entity_id: ticket.id,
    action: 'inbound_email',
    after_data: { from: fromEmail, codice: ticketCodice, attachments: uploadedRefs.length },
  });

  // 7) Auto-reply
  try {
    await sendAutoReply({
      to: fromEmail,
      codice: ticketCodice,
      subject,
      tenantName: tenant.nome,
      fromAddress: pickReplyFrom(toList, tenant.nome),
    });
  } catch (e) {
    console.error('[inbound-email] auto-reply failed', e);
  }

  return jsonResponse({ ok: true, ticketId: ticket.id, codice: ticketCodice });
});

// ----------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------

async function verifyHmac(body: string, signature: string | null, secret: string): Promise<boolean> {
  if (!signature) return false;
  // Resend usa HMAC-SHA256 sull'intero raw body. Manteniamo compatibilità
  // sia con la firma "raw hex" che con prefisso "sha256=" / "v1,".
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(body));
  const hex = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  const normalized = signature
    .replace(/^sha256=/i, '')
    .replace(/^v1,\s*/i, '')
    .trim()
    .toLowerCase();
  // Timing-safe compare best-effort
  if (hex.length !== normalized.length) return false;
  let diff = 0;
  for (let i = 0; i < hex.length; i++) diff |= hex.charCodeAt(i) ^ normalized.charCodeAt(i);
  return diff === 0;
}

function extractEmail(s: string): string {
  const m = s.match(/<([^>]+)>/);
  return (m ? m[1] : s).trim().toLowerCase();
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 4000);
}

// deno-lint-ignore no-explicit-any
async function findTenantByInboundAddress(admin: any, toList: string[]) {
  // Strategia: cerchiamo `storage_config->>inbound_email` IN toList.
  // Fallback: matching su `tenants.slug` come prefisso locale dell'email
  // (es. "ber@inbound.impiantixplus.it" → slug "BER").
  const { data: byConfig } = await admin
    .from('tenants')
    .select('id,slug,nome,storage_provider,storage_config')
    .in(
      'storage_config->>inbound_email',
      toList,
    );
  if (byConfig && byConfig.length > 0) return byConfig[0];

  // Fallback su slug come local-part
  for (const addr of toList) {
    const local = addr.split('@')[0]?.toLowerCase();
    if (!local) continue;
    const { data } = await admin
      .from('tenants')
      .select('id,slug,nome,storage_provider,storage_config')
      .ilike('slug', local)
      .limit(1);
    if (data && data.length > 0) return data[0];
  }

  return null;
}

// deno-lint-ignore no-explicit-any
async function upsertClienteFromEmail(
  admin: any,
  tenantId: string,
  email: string,
  name: string,
) {
  // Cerca per email contained
  const { data: existing } = await admin
    .from('clienti')
    .select('*')
    .eq('tenant_id', tenantId)
    .contains('email', [email])
    .limit(1);
  if (existing && existing.length > 0) return existing[0];

  // Crea cliente nuovo, ragione sociale = name oppure local-part dell'email
  const ragione = (name || email.split('@')[0] || 'Cliente Email').slice(0, 200);
  const { data: created, error } = await admin
    .from('clienti')
    .insert({
      tenant_id: tenantId,
      ragione_sociale: ragione,
      tipo: 'persona_fisica',
      email: [email],
    })
    .select('*')
    .single();
  if (error) {
    console.error('[inbound-email] cliente insert failed', error);
    return null;
  }
  return created;
}

// deno-lint-ignore no-explicit-any
async function generateTicketCode(admin: any, tenantId: string): Promise<string> {
  // Codice ticket: TKT-<AA>-<NNNN>. Calcoliamo l'ultimo numero dell'anno.
  const anno = new Date().getFullYear();
  const annoShort = String(anno).slice(-2);
  const { data, error } = await admin
    .from('tickets')
    .select('codice')
    .eq('tenant_id', tenantId)
    .like('codice', `TKT-${annoShort}-%`)
    .order('codice', { ascending: false })
    .limit(1);
  if (error) throw new Error(`ticket code lookup failed: ${error.message}`);
  let n = 1;
  if (data && data.length > 0) {
    const m = data[0].codice.match(/-(\d+)$/);
    if (m) n = parseInt(m[1], 10) + 1;
  }
  return `TKT-${annoShort}-${String(n).padStart(4, '0')}`;
}

async function fetchAttachment(att: ResendInboundAttachment): Promise<Blob | null> {
  if (att.url) {
    const r = await fetch(att.url);
    if (!r.ok) return null;
    return await r.blob();
  }
  if (att.content) {
    // Resend a volte invia base64 inline
    const bin = Uint8Array.from(atob(att.content), (c) => c.charCodeAt(0));
    return new Blob([bin], { type: att.content_type ?? att.contentType ?? 'application/octet-stream' });
  }
  return null;
}

function pickReplyFrom(toList: string[], tenantName: string): string {
  // Usa il primo TO come reply-from (è l'indirizzo del tenant).
  const local = toList[0] ?? `noreply@impiantixplus.it`;
  return `${tenantName} <${local}>`;
}

async function sendAutoReply(opts: {
  to: string;
  codice: string;
  subject: string;
  tenantName: string;
  fromAddress: string;
}) {
  const apiKey = Deno.env.get('RESEND_API_KEY');
  if (!apiKey) {
    console.warn('[inbound-email] RESEND_API_KEY missing, skip auto-reply');
    return;
  }
  const body = {
    from: opts.fromAddress,
    to: opts.to,
    subject: `[${opts.codice}] Abbiamo ricevuto la tua richiesta`,
    text:
      `Ciao,\n\n` +
      `abbiamo ricevuto la tua email "${opts.subject}" e l'abbiamo registrata ` +
      `con il codice ticket ${opts.codice}.\n\n` +
      `Ti risponderemo al più presto.\n\n` +
      `— ${opts.tenantName}\n` +
      `(Questo è un messaggio automatico, non rispondere a questa email per non perdere il riferimento al ticket.)\n`,
  };
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`Resend send ${res.status}: ${txt.slice(0, 200)}`);
  }
}
