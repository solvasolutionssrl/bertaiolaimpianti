import { type NextRequest } from 'next/server';

import { createServiceSupabase } from '@kommessa/api/service';

import { autenticaAgente, erroreApi, leggiJson } from '../_lib/guard';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/** Quante operazioni per giro. Un lotto piccolo si ritenta senza dolore. */
const LIMITE_DEFAULT = 50;
const LIMITE_MAX = 200;

/**
 * POST /api/integrazione/v1/lavori
 * body: { limite?: 50 }
 *
 * Consegna all'agente il prossimo lotto di operazioni da scrivere sul
 * gestionale, e **le prende in carico** nello stesso colpo (`in_corso`).
 *
 * Perche' prenderle in carico subito: se due giri si sovrappongono — un agente
 * lento e il successivo che parte — senza presa in carico lavorerebbero le
 * stesse righe e sul gestionale finirebbero DUE volte. E li' non si cancella.
 *
 * La presa in carico e' un confronta-e-scambia: si aggiornano solo le righe che
 * sono ANCORA in attesa, e si restituiscono soltanto quelle che l'update ha
 * effettivamente catturato. Se qualcun altro le ha prese nel frattempo, qui non
 * tornano.
 *
 * ⚠️ **Perche' POST e non GET**, anche se "sembra" una lettura. Per specifica
 * HTTP la GET e' idempotente, quindi client, proxy e bilanciatori la ritentano
 * DA SOLI dopo un timeout. Scenario reale: il server prende in carico 50 righe,
 * la risposta si perde per strada, il client ritenta in automatico, il server
 * ne prende in carico altre 50 — e le prime 50 restano orfane in `in_corso`.
 * Esattamente il danno che la presa in carico atomica doveva evitare, causato
 * dall'averla messa su una GET. Un singolo agente puo' disattivare i propri
 * retry, ma sarebbe una protezione solo dalla sua parte: il prossimo agente,
 * scritto fra un anno da qualcun altro, ci ricadrebbe. Con la POST il buco e'
 * chiuso per costruzione.
 */
export async function POST(request: NextRequest) {
  const g = await autenticaAgente(request);
  if (!g.ok) return g.risposta;
  const { tenantId, sistema } = g.ctx;

  const body = await leggiJson<{ limite?: number }>(request);
  const richiesto = Number(body?.limite);
  const limite = Number.isFinite(richiesto) && richiesto > 0
    ? Math.min(Math.trunc(richiesto), LIMITE_MAX)
    : LIMITE_DEFAULT;

  const service = createServiceSupabase();

  // 1. Candidate: piu' vecchie prima, cosi' nessuna resta indietro per sempre.
  //    `errore` rientra in coda: e' un ritentativo.
  const { data: candidate, error: errSelect } = await service
    .from('integrazione_outbox' as never)
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('sistema', sistema)
    .in('stato', ['in_attesa', 'errore'])
    .order('created_at', { ascending: true })
    .limit(limite);

  if (errSelect) {
    return erroreApi(503, 'coda_non_leggibile', 'Non riesco a leggere la coda.');
  }

  const ids = ((candidate ?? []) as unknown as { id: string }[]).map((r) => r.id);
  if (ids.length === 0) return Response.json({ contratto: 1, lavori: [] });

  // 2. Presa in carico. Il filtro sullo stato e' la parte che conta: e' cio' che
  //    rende innocuo il caso di due agenti sovrapposti.
  const { data: prese, error: errUpdate } = await service
    .from('integrazione_outbox' as never)
    .update({ stato: 'in_corso' } as never)
    .in('id', ids)
    .in('stato', ['in_attesa', 'errore'])
    .select('id, tipo, payload, idempotency_key, tentativi, origine_tipo, origine_id');

  if (errUpdate) {
    return erroreApi(503, 'presa_in_carico_fallita', 'Non riesco a prendere in carico la coda.');
  }

  const righe = (prese ?? []) as unknown as {
    id: string;
    tipo: string;
    payload: unknown;
    idempotency_key: string;
    tentativi: number;
    origine_tipo: string | null;
    origine_id: string | null;
  }[];

  return Response.json({
    contratto: 1,
    lavori: righe.map((r) => ({
      id: r.id,
      tipo: r.tipo,
      payload: r.payload,
      // Da riportare identica nell'esito: e' cio' che lega la risposta alla
      // richiesta anche se l'agente riordina o parallelizza il lotto.
      idempotencyKey: r.idempotency_key,
      // Quante volte ci abbiamo gia' provato. Se e' alto, l'agente puo'
      // rallentare invece di martellare un gestionale che sta rifiutando.
      tentativi: r.tentativi,
      origine: { tipo: r.origine_tipo, id: r.origine_id },
    })),
  });
}
