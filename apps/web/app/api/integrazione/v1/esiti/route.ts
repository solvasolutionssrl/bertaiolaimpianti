import { type NextRequest } from 'next/server';

import { createServiceSupabase } from '@kommessa/api/service';

import { autenticaAgente, erroreApi, leggiJson } from '../_lib/guard';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const MAX_ESITI = 500;

interface EsitoInviato {
  id: string;
  stato: 'inviato' | 'errore';
  /** Identificativi restituiti dal gestionale (docId, numero documento, ...). */
  esitoEsterno?: unknown;
  /** Messaggio leggibile in ufficio. Niente stack trace. */
  errore?: string;
}

/**
 * POST /api/integrazione/v1/esiti
 * body: { esiti: [{ id, stato, esitoEsterno?, errore? }] }
 *
 * L'agente racconta com'e' andata. È il momento piu' delicato dell'intero
 * scambio, per una ragione sola: **cio' che e' stato scritto sul gestionale non
 * si puo' disfare**. Da qui discendono due regole rigide.
 *
 * 1. Una riga gia' `inviato` non si tocca mai piu'. Se l'agente ripete l'esito
 *    (rete ballerina, riavvio a meta' lotto) la seconda volta e' un no-op, non
 *    un secondo invio. Questa e' l'idempotenza vista dal lato HTTP.
 * 2. `esito_esterno` e' l'unico registro di cosa e' finito nel gestionale: la'
 *    non possiamo rileggere. Si scrive sempre, anche quando sembra superfluo.
 */
export async function POST(request: NextRequest) {
  const g = await autenticaAgente(request);
  if (!g.ok) return g.risposta;
  const { tenantId, sistema } = g.ctx;

  const body = await leggiJson<{ esiti?: EsitoInviato[] }>(request);
  const esiti = body?.esiti;
  if (!Array.isArray(esiti) || esiti.length === 0) {
    return erroreApi(400, 'corpo_non_valido', 'Manca l\'elenco `esiti`.');
  }
  if (esiti.length > MAX_ESITI) {
    return erroreApi(
      413,
      'lotto_troppo_grande',
      `Massimo ${MAX_ESITI} esiti per chiamata.`,
    );
  }

  const service = createServiceSupabase();
  const adesso = new Date().toISOString();

  let applicati = 0;
  let ignorati = 0;
  const nonTrovati: string[] = [];

  for (const e of esiti) {
    if (!e?.id || (e.stato !== 'inviato' && e.stato !== 'errore')) {
      nonTrovati.push(String(e?.id ?? '?'));
      continue;
    }

    const patch =
      e.stato === 'inviato'
        ? {
            stato: 'inviato',
            inviato_at: adesso,
            esito_esterno: e.esitoEsterno ?? null,
            ultimo_errore: null,
          }
        : {
            stato: 'errore',
            ultimo_errore: (e.errore ?? 'Errore non specificato').slice(0, 2000),
          };

    // `neq('stato','inviato')` e' la guardia che vale tutto il resto: chiude la
    // porta a un secondo invio della stessa operazione.
    const { data, error } = await service
      .from('integrazione_outbox' as never)
      .update(patch as never)
      .eq('id', e.id)
      .eq('tenant_id', tenantId)
      .eq('sistema', sistema)
      .neq('stato', 'inviato')
      .select('id');

    if (error) {
      nonTrovati.push(e.id);
      continue;
    }
    if ((data ?? []).length === 0) {
      // Gia' inviata (o non e' sua): nessun errore, semplicemente non si rifa'.
      ignorati += 1;
      continue;
    }
    applicati += 1;
  }

  return Response.json({
    contratto: 1,
    applicati,
    // Quante erano gia' chiuse: se questo numero e' alto, l'agente sta
    // ripetendo lavoro e conviene che se ne accorga.
    ignorati,
    nonTrovati,
  });
}
