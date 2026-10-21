import { type NextRequest } from 'next/server';

import { bearerValido } from '@/app/_lib/segreto';
import { importaTimbriTutti } from '@/app/_lib/timbro/import';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Il giro di lettura dei timbri da Timbro, ogni due minuti (pg_cron, vedi
 * migration `20261022090000`). Auth: `Authorization: Bearer $CRON_SECRET`.
 *
 * Legge per tutti i clienti con il collegamento pronto; la logica sta in
 * `_lib/timbro/import.ts`, che e' la stessa chiamata dal webhook e dal tasto
 * «Leggi ora» del super admin.
 */
async function run(request: NextRequest) {
  if (!bearerValido(request, process.env.CRON_SECRET)) {
    return Response.json({ error: 'Non autorizzato' }, { status: 401 });
  }
  const esiti = await importaTimbriTutti('schedulato');
  return Response.json({
    ok: esiti.every((e) => e.ok),
    clienti: esiti.length,
    letti: esiti.reduce((a, e) => a + e.letti, 0),
    esiti: esiti.map((e) => ({ tenantId: e.tenantId, ok: e.ok, letti: e.letti, messaggio: e.messaggio })),
  });
}

export async function POST(request: NextRequest) {
  return run(request);
}
export async function GET(request: NextRequest) {
  return run(request);
}
