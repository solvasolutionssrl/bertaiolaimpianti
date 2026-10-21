import { createHmac, timingSafeEqual } from 'node:crypto';
import { type NextRequest } from 'next/server';
import { waitUntil } from '@vercel/functions';

import { leggiConfigTimbro } from '@/app/_lib/timbro/config';
import { importaTimbri } from '@/app/_lib/timbro/import';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Il webhook di Timbro: `POST /api/webhooks/timbro?t=<tenantId>`.
 *
 * Il cliente lo dice l'indirizzo; la **prova** che e' davvero Timbro la da'
 * la firma `X-Timbro-Signature: t=<unix>,v1=<hex>`, HMAC-SHA256 di
 * `<t>.<corpo>` con il segreto del webhook, confrontata a tempo costante e
 * rifiutata se ha piu' di cinque minuti.
 *
 * ⭐ Non scrive niente da solo: fa partire la stessa riconciliazione del
 * cron. Il payload del webhook non e' una seconda fonte di verita'.
 */

const FINESTRA_FIRMA_S = 5 * 60;

function firmaValida(header: string | null, corpo: string, segreto: string): boolean {
  if (!header) return false;
  const parti = Object.fromEntries(
    header.split(',').map((p) => {
      const i = p.indexOf('=');
      return [p.slice(0, i).trim(), p.slice(i + 1).trim()];
    }),
  ) as Record<string, string>;
  const t = Number(parti.t);
  const v1 = parti.v1;
  if (!Number.isFinite(t) || !v1) return false;
  if (Math.abs(Date.now() / 1000 - t) > FINESTRA_FIRMA_S) return false;
  const attesa = createHmac('sha256', segreto).update(`${t}.${corpo}`).digest('hex');
  const a = Buffer.from(attesa, 'utf8');
  const b = Buffer.from(v1, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: NextRequest) {
  const tenantId = request.nextUrl.searchParams.get('t');
  if (!tenantId) return Response.json({ error: 'tenant mancante' }, { status: 400 });

  const cfg = await leggiConfigTimbro(tenantId);
  if (!cfg || !cfg.webhookSecret) {
    return Response.json({ error: 'webhook non configurato' }, { status: 404 });
  }

  const corpo = await request.text();
  if (!firmaValida(request.headers.get('x-timbro-signature'), corpo, cfg.webhookSecret)) {
    return Response.json({ error: 'firma non valida' }, { status: 401 });
  }

  let evento = '';
  try {
    evento = String((JSON.parse(corpo) as { event?: string }).event ?? '');
  } catch {
    return Response.json({ error: 'corpo non valido' }, { status: 400 });
  }

  // Si risponde subito: Timbro non deve aspettare la nostra lettura, e un
  // ritardo lato nostro non deve fargli credere che il tubo e' rotto.
  if (evento.startsWith('punch.') || evento === 'badge.assigned') {
    waitUntil(
      importaTimbri(cfg, 'webhook').catch((e: unknown) =>
        console.error('[webhook timbro] import fallito:', e instanceof Error ? e.message : e),
      ),
    );
  }
  return Response.json({ ok: true, evento });
}
