#!/usr/bin/env tsx
/**
 * ====================================================================
 * scripts/migrate-freshdesk.ts
 *
 * Script di migrazione one-time da Freshdesk verso impiantiXplus.
 *
 * Specifica:
 *   - documentazione_generale/02_ARCHITETTURA/Architettura_Soluzione.md §6.1
 *   - documentazione_generale/04_ROADMAP/Roadmap_Sprint.md §"SPRINT 2 — Migrazione Freshdesk"
 *
 * Decisione v3 (CLAUDE.md): Freshdesk è abbandonato post go-live.
 * Questo script importa ticket + conversazioni + allegati + clienti
 * dentro le tabelle native (`tickets`, `ticket_messages`, `clienti`,
 * `file_refs`) marcando le righe con `source='imported_from_freshdesk'`
 * e popolando `freshdesk_legacy_id` per tracciamento.
 *
 * USO:
 *   pnpm migrate:freshdesk \
 *     --tenant=bertaiola \
 *     --api-key=<freshdesk-api-key> \
 *     --domain=bertaiolaimpianti \
 *     [--dry-run] [--limit=50] [--from-page=1]
 *
 * Idempotente: ticket già importati (match su `freshdesk_legacy_id`)
 * vengono saltati.
 * ====================================================================
 */

import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';

import { createServiceSupabase } from '@impiantixplus/api/service';
import { getStorageProvider, type StorageProvider } from '@impiantixplus/integrations/storage';

// ---------------------------------------------------------------------
// CLI parsing
// ---------------------------------------------------------------------

interface CliArgs {
  tenant: string;
  apiKey: string;
  domain: string;
  dryRun: boolean;
  limit: number | null;
  fromPage: number;
}

function parseArgs(argv: string[]): CliArgs {
  const args: Record<string, string | boolean> = {};
  for (const raw of argv.slice(2)) {
    if (!raw.startsWith('--')) continue;
    const [key, ...rest] = raw.slice(2).split('=');
    args[key] = rest.length ? rest.join('=') : true;
  }

  const tenant = (args.tenant as string) ?? 'bertaiola';
  const apiKey = (args['api-key'] as string) ?? process.env.FRESHDESK_API_KEY ?? '';
  const domain = (args.domain as string) ?? process.env.FRESHDESK_DOMAIN ?? '';

  if (!tenant) throw new Error('Missing --tenant=<slug>');
  if (!apiKey) throw new Error('Missing --api-key=<key> (o FRESHDESK_API_KEY in env)');
  if (!domain) throw new Error('Missing --domain=<subdomain> (es. bertaiolaimpianti)');

  return {
    tenant,
    apiKey,
    domain,
    dryRun: Boolean(args['dry-run']),
    limit: args.limit ? Number(args.limit) : null,
    fromPage: args['from-page'] ? Number(args['from-page']) : 1,
  };
}

// ---------------------------------------------------------------------
// Tipi minimi Freshdesk (solo quello che usiamo)
// ---------------------------------------------------------------------

type FreshdeskStatus = 2 | 3 | 4 | 5; // Open=2, Pending=3, Resolved=4, Closed=5
type FreshdeskPriority = 1 | 2 | 3 | 4; // Low=1, Medium=2, High=3, Urgent=4

interface FreshdeskRequester {
  id: number;
  name?: string;
  email?: string;
  phone?: string;
  mobile?: string;
  company_id?: number | null;
}

interface FreshdeskAttachment {
  id: number;
  name: string;
  content_type: string;
  size: number;
  attachment_url: string;
  created_at: string;
}

interface FreshdeskTicket {
  id: number;
  subject: string;
  description_text?: string;
  description?: string;
  status: FreshdeskStatus;
  priority: FreshdeskPriority;
  source: number;
  requester_id: number;
  requester?: FreshdeskRequester;
  created_at: string;
  updated_at: string;
  attachments?: FreshdeskAttachment[];
}

interface FreshdeskConversation {
  id: number;
  body_text?: string;
  body?: string;
  incoming: boolean;
  private: boolean;
  user_id: number;
  from_email?: string;
  created_at: string;
  attachments?: FreshdeskAttachment[];
}

// ---------------------------------------------------------------------
// Mapping enum Freshdesk → enum interno
// ---------------------------------------------------------------------

const STATUS_MAP: Record<FreshdeskStatus, 'aperto' | 'attesa_cliente' | 'chiuso'> = {
  2: 'aperto', // Open
  3: 'attesa_cliente', // Pending
  4: 'chiuso', // Resolved
  5: 'chiuso', // Closed
};

const PRIORITY_MAP: Record<FreshdeskPriority, 'bassa' | 'media' | 'alta' | 'urgente'> = {
  1: 'bassa',
  2: 'media',
  3: 'alta',
  4: 'urgente',
};

// ---------------------------------------------------------------------
// Stato runtime
// ---------------------------------------------------------------------

interface RunStats {
  ticketsImported: number;
  ticketsSkippedExisting: number;
  clientiCreated: number;
  clientiReused: number;
  messagesImported: number;
  attachmentsImported: number;
  errors: number;
  startedAt: number;
}

interface ErrorEntry {
  freshdeskId: number;
  step: string;
  message: string;
  timestamp: string;
}

interface CsvRow {
  freshdesk_id: number;
  codice: string;
  cliente: string;
  stato: string;
  allegati: number;
  messaggi: number;
  esito: 'imported' | 'skipped' | 'error';
  note: string;
}

// ---------------------------------------------------------------------
// Helpers di rete + rate limit
// ---------------------------------------------------------------------

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function basicAuth(apiKey: string) {
  return 'Basic ' + Buffer.from(`${apiKey}:X`).toString('base64');
}

/**
 * Wrapper su fetch con throttle adattivo basato su X-Ratelimit-Remaining.
 * Freshdesk consente 50 req/min sul tier base.
 */
async function fdFetch(url: string, apiKey: string, attempt = 1): Promise<Response> {
  const res = await fetch(url, {
    headers: {
      Authorization: basicAuth(apiKey),
      Accept: 'application/json',
    },
  });

  const remaining = Number(res.headers.get('x-ratelimit-remaining') ?? '100');
  if (remaining < 5) {
    // ci avviciniamo al limite, rallentiamo
    await sleep(2_000);
  }

  if (res.status === 429) {
    const retryAfter = Number(res.headers.get('retry-after') ?? '60');
    console.warn(`[rate-limit] 429 ricevuto, attendo ${retryAfter}s`);
    await sleep(retryAfter * 1_000);
    return fdFetch(url, apiKey, attempt + 1);
  }

  return res;
}

async function withRetry<T>(label: string, fn: () => Promise<T>, maxAttempts = 3): Promise<T> {
  let lastErr: unknown;
  for (let i = 1; i <= maxAttempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const backoff = Math.min(30_000, 500 * 2 ** (i - 1));
      console.warn(`[retry ${i}/${maxAttempts}] ${label}: ${(err as Error).message} — aspetto ${backoff}ms`);
      await sleep(backoff);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

function sha256Of(buf: ArrayBuffer): string {
  return createHash('sha256').update(Buffer.from(buf)).digest('hex');
}

// ---------------------------------------------------------------------
// Codice ticket nuovo (TKT-<anno>-<seq>)
// ---------------------------------------------------------------------

function generaCodiceTicket(year: number, seq: number) {
  return `TKT-${year}-${String(seq).padStart(4, '0')}`;
}

// ---------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------

async function main() {
  const argv = parseArgs(process.argv);

  console.log('========================================================');
  console.log(' Migrazione Freshdesk → impiantiXplus');
  console.log('========================================================');
  console.log(` tenant      : ${argv.tenant}`);
  console.log(` domain      : ${argv.domain}.freshdesk.com`);
  console.log(` dry-run     : ${argv.dryRun}`);
  console.log(` limit       : ${argv.limit ?? '∞'}`);
  console.log(` from-page   : ${argv.fromPage}`);
  console.log('========================================================');

  const stats: RunStats = {
    ticketsImported: 0,
    ticketsSkippedExisting: 0,
    clientiCreated: 0,
    clientiReused: 0,
    messagesImported: 0,
    attachmentsImported: 0,
    errors: 0,
    startedAt: performance.now(),
  };
  const errors: ErrorEntry[] = [];
  const csv: CsvRow[] = [];

  const sb = createServiceSupabase();

  // Risolvi tenant_id da slug
  const { data: tenant, error: tenantErr } = await sb
    .from('tenants')
    .select('id, slug, storage_provider, storage_config')
    .eq('slug', argv.tenant)
    .single();

  if (tenantErr || !tenant) {
    throw new Error(`Tenant '${argv.tenant}' non trovato: ${tenantErr?.message ?? 'unknown'}`);
  }

  const storageConfig = (tenant.storage_config ?? {}) as {
    bucket?: string;
    base_url?: string;
    user?: string;
    app_password?: string;
  };
  console.log(`[tenant] id=${tenant.id} storage=${tenant.storage_provider}`);

  // Storage provider del tenant (config dal DB; fallback su env)
  const storage: StorageProvider = getStorageProvider({
    provider: (tenant.storage_provider as 'supabase' | 'nextcloud') ?? 'supabase',
    bucket: storageConfig.bucket ?? 'commesse',
    baseUrl: storageConfig.base_url ?? process.env.NEXTCLOUD_BASE_URL,
    user: storageConfig.user ?? process.env.NEXTCLOUD_USER,
    appPassword: storageConfig.app_password ?? process.env.NEXTCLOUD_APP_PASSWORD,
  });

  // Calcolo anno + seq iniziale per nuovi codici ticket di questo tenant
  const currentYear = new Date().getFullYear();
  let nextSeq = await peekNextTicketSeq(sb, tenant.id, currentYear);

  // ---------------------- LOOP PAGINAZIONE ----------------------
  let page = argv.fromPage;
  let processedThisRun = 0;
  let keepGoing = true;

  while (keepGoing) {
    const url =
      `https://${argv.domain}.freshdesk.com/api/v2/tickets` +
      `?per_page=100&page=${page}&include=requester,stats,description`;

    console.log(`\n[page ${page}] GET ${url}`);
    let tickets: FreshdeskTicket[] = [];
    try {
      tickets = await withRetry(`fetch page ${page}`, async () => {
        const res = await fdFetch(url, argv.apiKey);
        if (!res.ok) {
          throw new Error(`HTTP ${res.status} su page ${page}: ${await res.text()}`);
        }
        return (await res.json()) as FreshdeskTicket[];
      });
    } catch (err) {
      console.error(`[page ${page}] errore fatale, interrompo paginazione`, err);
      stats.errors++;
      errors.push({
        freshdeskId: -1,
        step: `list-page-${page}`,
        message: (err as Error).message,
        timestamp: new Date().toISOString(),
      });
      break;
    }

    if (tickets.length === 0) {
      console.log(`[page ${page}] vuota — fine paginazione`);
      break;
    }

    for (const t of tickets) {
      if (argv.limit && processedThisRun >= argv.limit) {
        console.log(`[limit] raggiunto limite ${argv.limit}, stop`);
        keepGoing = false;
        break;
      }
      processedThisRun++;

      try {
        const outcome = await processTicket(t, {
          sb,
          storage,
          tenantId: tenant.id,
          domain: argv.domain,
          apiKey: argv.apiKey,
          dryRun: argv.dryRun,
          year: currentYear,
          getSeq: () => nextSeq++,
          stats,
          csv,
        });
        console.log(
          `[OK]   TKT-fd-${t.id} → ${outcome.codice} (cliente: ${outcome.clienteLabel}) ${outcome.skipped ? '[skipped]' : ''}`,
        );
      } catch (err) {
        stats.errors++;
        const message = (err as Error).message;
        console.error(`[FAIL] TKT-fd-${t.id}: ${message}`);
        errors.push({
          freshdeskId: t.id,
          step: 'process-ticket',
          message,
          timestamp: new Date().toISOString(),
        });
        csv.push({
          freshdesk_id: t.id,
          codice: '',
          cliente: t.requester?.email ?? t.requester?.name ?? '',
          stato: '',
          allegati: 0,
          messaggi: 0,
          esito: 'error',
          note: message,
        });
      }
    }

    page++;
  }

  // ---------------------- REPORT ----------------------
  const durationSec = ((performance.now() - stats.startedAt) / 1000).toFixed(1);

  console.log('\n========================================================');
  console.log(' REPORT MIGRAZIONE');
  console.log('========================================================');
  console.log(` Durata totale         : ${durationSec}s`);
  console.log(` Ticket importati      : ${stats.ticketsImported}`);
  console.log(` Ticket già esistenti  : ${stats.ticketsSkippedExisting}`);
  console.log(` Clienti creati        : ${stats.clientiCreated}`);
  console.log(` Clienti riusati       : ${stats.clientiReused}`);
  console.log(` Messaggi importati    : ${stats.messagesImported}`);
  console.log(` Allegati importati    : ${stats.attachmentsImported}`);
  console.log(` Errori                : ${stats.errors}`);
  console.log('========================================================');

  // Persistenza artefatti audit
  if (errors.length) {
    const path = resolve(process.cwd(), 'scripts/.migrate-freshdesk-errors.json');
    await writeFile(path, JSON.stringify(errors, null, 2), 'utf8');
    console.log(`Errori scritti in: ${path}`);
  }

  const csvPath = resolve(process.cwd(), 'scripts/.migrate-freshdesk-report.csv');
  await writeFile(csvPath, csvSerialize(csv), 'utf8');
  console.log(`Report CSV: ${csvPath}`);

  if (argv.dryRun) {
    console.log('\n[dry-run] nessuna modifica scritta su DB/storage.');
  }
}

// ---------------------------------------------------------------------
// Process di un singolo ticket
// ---------------------------------------------------------------------

interface ProcessCtx {
  sb: ReturnType<typeof createServiceSupabase>;
  storage: StorageProvider;
  tenantId: string;
  domain: string;
  apiKey: string;
  dryRun: boolean;
  year: number;
  getSeq: () => number;
  stats: RunStats;
  csv: CsvRow[];
}

interface ProcessOutcome {
  codice: string;
  clienteLabel: string;
  skipped: boolean;
}

async function processTicket(t: FreshdeskTicket, ctx: ProcessCtx): Promise<ProcessOutcome> {
  // 1) Idempotenza: ticket già migrato?
  const { data: existing } = await ctx.sb
    .from('tickets')
    .select('id, codice')
    .eq('tenant_id', ctx.tenantId)
    .eq('freshdesk_legacy_id', t.id)
    .maybeSingle();

  if (existing) {
    ctx.stats.ticketsSkippedExisting++;
    ctx.csv.push({
      freshdesk_id: t.id,
      codice: existing.codice,
      cliente: t.requester?.email ?? '',
      stato: STATUS_MAP[t.status] ?? 'aperto',
      allegati: 0,
      messaggi: 0,
      esito: 'skipped',
      note: 'già importato in passata precedente',
    });
    return { codice: existing.codice, clienteLabel: t.requester?.email ?? 'n/a', skipped: true };
  }

  // 2) Recupero conversazioni
  const convsUrl = `https://${ctx.domain}.freshdesk.com/api/v2/tickets/${t.id}/conversations`;
  const conversations = await withRetry(`conv ${t.id}`, async () => {
    const res = await fdFetch(convsUrl, ctx.apiKey);
    if (!res.ok) throw new Error(`HTTP ${res.status} su conv ${t.id}`);
    return (await res.json()) as FreshdeskConversation[];
  });

  // 3) Dedupe cliente
  const requester = t.requester ?? ({ id: t.requester_id } as FreshdeskRequester);
  const cliente = await upsertCliente(requester, ctx);
  const clienteLabel = requester.name ?? requester.email ?? `req-${requester.id}`;

  // 4) Insert ticket
  const codice = generaCodiceTicket(ctx.year, ctx.getSeq());

  if (ctx.dryRun) {
    ctx.stats.ticketsImported++;
    ctx.csv.push({
      freshdesk_id: t.id,
      codice,
      cliente: clienteLabel,
      stato: STATUS_MAP[t.status] ?? 'aperto',
      allegati: countAttachments(t, conversations),
      messaggi: conversations.length + 1,
      esito: 'imported',
      note: 'dry-run',
    });
    return { codice, clienteLabel, skipped: false };
  }

  const { data: ticketRow, error: ticketErr } = await ctx.sb
    .from('tickets')
    .insert({
      tenant_id: ctx.tenantId,
      codice,
      cliente_id: cliente.id,
      oggetto: t.subject ?? '(senza oggetto)',
      descrizione: t.description_text ?? null,
      stato: t.status === 4 || t.status === 5 ? STATUS_MAP[t.status] : STATUS_MAP[t.status] ?? 'aperto',
      priorita: PRIORITY_MAP[t.priority] ?? 'media',
      source: 'imported_from_freshdesk',
      freshdesk_legacy_id: t.id,
      created_at: t.created_at,
      updated_at: t.updated_at,
      closed_at: t.status === 5 ? t.updated_at : null,
    })
    .select('id, codice')
    .single();

  if (ticketErr || !ticketRow) {
    throw new Error(`insert ticket fallita: ${ticketErr?.message}`);
  }

  // 5) Allegati del ticket principale → re-upload su storage
  const initialAttachmentRefs = await reuploadAttachments(
    t.attachments ?? [],
    t.id,
    ticketRow.id,
    ctx,
  );

  // 6) Messaggio iniziale = descrizione
  if (t.description_text || t.description) {
    const { error } = await ctx.sb.from('ticket_messages').insert({
      tenant_id: ctx.tenantId,
      ticket_id: ticketRow.id,
      sender_user_id: null,
      sender_external_email: requester.email ?? null,
      body: t.description_text ?? stripHtml(t.description ?? ''),
      attachments: initialAttachmentRefs,
      is_internal_note: false,
      created_at: t.created_at,
    });
    if (error) throw new Error(`insert descrizione: ${error.message}`);
    ctx.stats.messagesImported++;
  }

  // 7) Tutte le conversazioni
  for (const c of conversations) {
    const convAttRefs = await reuploadAttachments(c.attachments ?? [], t.id, ticketRow.id, ctx);

    const { error } = await ctx.sb.from('ticket_messages').insert({
      tenant_id: ctx.tenantId,
      ticket_id: ticketRow.id,
      sender_user_id: null,
      sender_external_email: c.incoming ? c.from_email ?? requester.email ?? null : null,
      body: c.body_text ?? stripHtml(c.body ?? ''),
      attachments: convAttRefs,
      is_internal_note: c.private,
      created_at: c.created_at,
    });
    if (error) throw new Error(`insert conv ${c.id}: ${error.message}`);
    ctx.stats.messagesImported++;
  }

  ctx.stats.ticketsImported++;
  ctx.csv.push({
    freshdesk_id: t.id,
    codice,
    cliente: clienteLabel,
    stato: STATUS_MAP[t.status] ?? 'aperto',
    allegati: countAttachments(t, conversations),
    messaggi: conversations.length + (t.description_text ? 1 : 0),
    esito: 'imported',
    note: '',
  });

  return { codice, clienteLabel, skipped: false };
}

// ---------------------------------------------------------------------
// Upsert cliente con dedupe per email/telefono
// ---------------------------------------------------------------------

async function upsertCliente(req: FreshdeskRequester, ctx: ProcessCtx): Promise<{ id: string }> {
  const email = req.email?.trim().toLowerCase();
  const phone = (req.mobile ?? req.phone)?.trim();

  // Cerca per email
  if (email) {
    const { data } = await ctx.sb
      .from('clienti')
      .select('id')
      .eq('tenant_id', ctx.tenantId)
      .contains('email', [email])
      .limit(1)
      .maybeSingle();
    if (data) {
      ctx.stats.clientiReused++;
      return { id: data.id };
    }
  }

  // Cerca per telefono
  if (phone) {
    const { data } = await ctx.sb
      .from('clienti')
      .select('id')
      .eq('tenant_id', ctx.tenantId)
      .contains('telefoni', [phone])
      .limit(1)
      .maybeSingle();
    if (data) {
      ctx.stats.clientiReused++;
      return { id: data.id };
    }
  }

  if (ctx.dryRun) {
    // ritorniamo un id finto solo per il flusso
    return { id: '00000000-0000-0000-0000-000000000000' };
  }

  // Crea nuovo cliente
  const { data, error } = await ctx.sb
    .from('clienti')
    .insert({
      tenant_id: ctx.tenantId,
      ragione_sociale: req.name ?? email ?? `Importato FD#${req.id}`,
      tipo: 'persona_fisica',
      email: email ? [email] : [],
      telefoni: phone ? [phone] : [],
      note: `Importato da Freshdesk (requester_id=${req.id})`,
    })
    .select('id')
    .single();

  if (error || !data) throw new Error(`insert cliente: ${error?.message}`);
  ctx.stats.clientiCreated++;
  return { id: data.id };
}

// ---------------------------------------------------------------------
// Re-upload allegati su storage tenant + INSERT file_refs
// ---------------------------------------------------------------------

async function reuploadAttachments(
  list: FreshdeskAttachment[],
  freshdeskTicketId: number,
  ticketId: string,
  ctx: ProcessCtx,
): Promise<string[]> {
  const ids: string[] = [];

  for (const att of list) {
    try {
      const blob = await withRetry(`download att ${att.id}`, async () => {
        // L'URL è S3 pre-signed di Freshdesk, NON serve auth
        const res = await fetch(att.attachment_url);
        if (!res.ok) throw new Error(`download att HTTP ${res.status}`);
        return res.arrayBuffer();
      });

      const path = `import/freshdesk/TKT-${freshdeskTicketId}/${att.name}`;

      if (!ctx.dryRun) {
        await ctx.storage.uploadFile(path, new Uint8Array(blob), {
          contentType: att.content_type,
          upsert: true,
        });

        // file_refs richiede commessa_id (NOT NULL). Per i ticket migrati
        // senza commessa associata, NON inseriamo in file_refs ma teniamo
        // solo riferimento path sul messaggio (attachments jsonb).
        // Se in futuro vogliamo file_refs anche per ticket-only, serve
        // alterare lo schema (commessa_id nullable) — vedere
        // Architettura_Soluzione.md.
        ids.push(path);
      } else {
        ids.push(path);
      }

      ctx.stats.attachmentsImported++;
    } catch (err) {
      console.warn(`  [att ${att.id}] skip: ${(err as Error).message}`);
    }
  }

  return ids;
}

// ---------------------------------------------------------------------
// Utilità
// ---------------------------------------------------------------------

function countAttachments(t: FreshdeskTicket, convs: FreshdeskConversation[]) {
  return (
    (t.attachments?.length ?? 0) +
    convs.reduce((acc, c) => acc + (c.attachments?.length ?? 0), 0)
  );
}

function stripHtml(s: string): string {
  return s
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

function csvSerialize(rows: CsvRow[]): string {
  const header = ['freshdesk_id', 'codice', 'cliente', 'stato', 'allegati', 'messaggi', 'esito', 'note'];
  const body = rows.map((r) =>
    header
      .map((k) => {
        const v = (r as unknown as Record<string, unknown>)[k];
        const s = v == null ? '' : String(v);
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      })
      .join(','),
  );
  return [header.join(','), ...body].join('\n') + '\n';
}

async function peekNextTicketSeq(
  sb: ReturnType<typeof createServiceSupabase>,
  tenantId: string,
  year: number,
): Promise<number> {
  const prefix = `TKT-${year}-`;
  const { data } = await sb
    .from('tickets')
    .select('codice')
    .eq('tenant_id', tenantId)
    .like('codice', `${prefix}%`)
    .order('codice', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data?.codice) return 1;
  const tail = data.codice.replace(prefix, '');
  const n = parseInt(tail, 10);
  return Number.isFinite(n) ? n + 1 : 1;
}

// Suppress noise from unused helper if tree-shaken in future
void sha256Of;

// ---------------------------------------------------------------------

main().catch((err) => {
  console.error('\n[FATAL]', err);
  process.exit(1);
});
