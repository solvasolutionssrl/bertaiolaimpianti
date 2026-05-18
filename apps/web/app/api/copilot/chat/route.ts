import { NextResponse, type NextRequest } from 'next/server';

import { createServerSupabase } from '@impiantixplus/api/server';
import { requireTenantContext } from '@impiantixplus/api/tenant';

import {
  chatCompletionStream,
  getChatModel,
  isOpenAIConfigured,
} from '../../../_lib/openai';

/**
 * POST /api/copilot/chat
 * Body: `{ messages: [{ role: 'user'|'assistant', content: string }] }`
 *
 * Co-pilot operativo via OpenAI `gpt-5-mini` con streaming SSE delta.
 * Lo stream esposto al client è plain-text (token concatenati), così
 * il consumer può semplicemente fare `reader.read()` e concat.
 *
 * Se `OPENAI_API_KEY` manca/placeholder → modalità preview con stream
 * fake (utile per il dev senza chiave).
 *
 * Sistema prompt: contesto sintetico del tenant (audit recenti +
 * conteggi commesse/tickets per stato), in italiano, tono operativo.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface InboundMessage {
  role: 'user' | 'assistant';
  content: string;
}

const MAX_TOKENS = 1024;

export async function POST(req: NextRequest) {
  let ctx;
  try {
    ctx = await requireTenantContext();
  } catch {
    return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  }

  let body: { messages?: InboundMessage[] };
  try {
    body = (await req.json()) as { messages?: InboundMessage[] };
  } catch {
    return NextResponse.json({ error: 'BAD_BODY' }, { status: 400 });
  }
  const messages = Array.isArray(body.messages) ? body.messages : [];
  if (messages.length === 0) {
    return NextResponse.json({ error: 'NO_MESSAGES' }, { status: 400 });
  }

  if (!isOpenAIConfigured()) {
    return streamPreviewResponse();
  }

  // ---- Grounding context ----
  const supabase = createServerSupabase();
  const [auditRes, commesseRes, ticketsRes] = await Promise.all([
    supabase
      .from('audit_events')
      .select('entity_type, action, created_at, metadata')
      .order('created_at', { ascending: false })
      .limit(30),
    supabase.from('commesse').select('stato').limit(2000),
    supabase.from('tickets').select('stato').limit(2000),
  ]);

  const commesseByStato = countBy(
    (commesseRes.data as { stato: string }[] | null) ?? [],
    (r) => r.stato,
  );
  const ticketsByStato = countBy(
    (ticketsRes.data as { stato: string }[] | null) ?? [],
    (r) => r.stato,
  );
  const auditDigest = ((auditRes.data as any[]) ?? [])
    .map(
      (e) =>
        `- ${e.created_at}: ${e.action} su ${e.entity_type}${
          e.metadata?.commessa_codice
            ? ` (${e.metadata.commessa_codice})`
            : ''
        }`,
    )
    .join('\n');

  const systemPrompt = [
    'Sei "Co-pilot operativo" di impiantiXplus, gestionale per impianti elettrici/idraulici.',
    `Tenant corrente: ${ctx.tenantSlug}. Ruolo utente: ${ctx.role}.`,
    'Rispondi sempre in italiano, in modo conciso e operativo.',
    'Non inventare dati: se mancano informazioni, dichiaralo.',
    'Se vengono richieste azioni distruttive (delete, force, ecc.) rifiutale.',
    '',
    '## Stato corrente del tenant',
    `Commesse per stato: ${JSON.stringify(commesseByStato)}`,
    `Tickets per stato: ${JSON.stringify(ticketsByStato)}`,
    '',
    '## Ultimi eventi audit (max 30)',
    auditDigest || '(nessun evento)',
  ].join('\n');

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        const iterator = chatCompletionStream({
          model: getChatModel(),
          maxTokens: MAX_TOKENS,
          messages: [
            { role: 'system', content: systemPrompt },
            ...messages.map((m) => ({ role: m.role, content: m.content })),
          ],
        });
        for await (const delta of iterator) {
          if (delta) controller.enqueue(encoder.encode(delta));
        }
        controller.close();
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Errore OpenAI API';
        controller.enqueue(encoder.encode(`\n\n[Errore: ${msg}]`));
        controller.close();
      }
    },
  });

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Accel-Buffering': 'no',
    },
  });
}

function streamPreviewResponse() {
  const text =
    'Modalità preview attiva. Quando attiveremo lo storage cloud, qui troverai analisi reali su commesse, ore e ticket del tuo tenant.';
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const chunks = text.split(/(\s+)/);
      for (const c of chunks) {
        controller.enqueue(encoder.encode(c));
        await new Promise((r) => setTimeout(r, 28));
      }
      controller.close();
    },
  });
  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Accel-Buffering': 'no',
    },
  });
}

function countBy<T>(rows: T[], key: (r: T) => string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) {
    const k = key(r);
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}
