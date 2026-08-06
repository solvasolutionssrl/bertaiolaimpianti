import { createHash } from 'node:crypto';

import { type NextRequest } from 'next/server';

import { createServiceSupabase } from '@kommessa/api/service';

import { autenticaAgente, erroreApi, leggiJson } from '../_lib/guard';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const ENTITA_AMMESSE = ['commessa', 'cliente', 'dipendente'] as const;
const MAX_RECORD = 1000;

interface RecordLetto {
  externalId: string;
  dati: Record<string, unknown>;
}

/**
 * POST /api/integrazione/v1/letture
 * body: { entita: 'commessa'|'cliente'|'dipendente', record: [{externalId, dati}] }
 *
 * L'agente deposita cio' che ha letto dal gestionale. I dati atterrano **grezzi**
 * in `integrazione_staging` e NON toccano le tabelle di dominio.
 *
 * Il motivo e' difensivo: un gestionale che risponde a meta', con campi
 * rinominati o con una pagina vuota per un timeout non deve poter corrompere i
 * cantieri veri. La promozione a dati di produzione e' un passo separato, fatto
 * da Kommessa, revisionabile.
 *
 * `contenuto_hash` serve a saltare in fretta cio' che non e' cambiato: con
 * qualche migliaio di record, riconciliare solo le differenze cambia i tempi.
 */
export async function POST(request: NextRequest) {
  const g = await autenticaAgente(request);
  if (!g.ok) return g.risposta;
  const { tenantId, sistema } = g.ctx;

  const body = await leggiJson<{ entita?: string; record?: RecordLetto[] }>(request);
  const entita = body?.entita;
  const record = body?.record;

  if (!entita || !(ENTITA_AMMESSE as readonly string[]).includes(entita)) {
    return erroreApi(
      400,
      'entita_non_valida',
      `\`entita\` deve essere una fra: ${ENTITA_AMMESSE.join(', ')}.`,
    );
  }
  if (!Array.isArray(record) || record.length === 0) {
    return erroreApi(400, 'corpo_non_valido', 'Manca l\'elenco `record`.');
  }
  if (record.length > MAX_RECORD) {
    return erroreApi(
      413,
      'lotto_troppo_grande',
      `Massimo ${MAX_RECORD} record per chiamata: spezza in piu' pagine.`,
    );
  }

  const scartati: string[] = [];
  const righe = record
    .filter((r) => {
      const ok = r && typeof r.externalId === 'string' && r.externalId.trim() !== '';
      if (!ok) scartati.push(String((r as RecordLetto | undefined)?.externalId ?? '?'));
      return ok;
    })
    .map((r) => ({
      tenant_id: tenantId,
      sistema,
      entita,
      external_id: r.externalId.trim(),
      dati: r.dati ?? {},
      contenuto_hash: createHash('sha256')
        .update(JSON.stringify(r.dati ?? {}))
        .digest('hex'),
      letto_at: new Date().toISOString(),
    }));

  if (righe.length === 0) {
    return erroreApi(400, 'nessun_record_valido', 'Nessun record aveva un `externalId`.');
  }

  const service = createServiceSupabase();
  const { error } = await service
    .from('integrazione_staging' as never)
    .upsert(righe as never, { onConflict: 'tenant_id,sistema,entita,external_id' });

  if (error) {
    return erroreApi(503, 'scrittura_fallita', 'Non riesco a salvare i dati letti.');
  }

  return Response.json({
    contratto: 1,
    entita,
    salvati: righe.length,
    scartati,
  });
}
