import { type NextRequest } from 'next/server';

import { createServiceSupabase } from '@kommessa/api/service';

import { CONTRATTO, autenticaApi, erroreApi, leggiJson } from '../_lib/api';

export const dynamic = 'force-dynamic';
export const maxDuration = 15;

interface CorpoApri {
  azione: 'apri';
  direzione: 'lettura' | 'scrittura';
  avvio?: 'manuale' | 'schedulato';
}

interface CorpoChiudi {
  azione: 'chiudi';
  id: string;
  esito: 'ok' | 'parziale' | 'errore';
  letti?: number;
  scritti?: number;
  errori?: number;
  messaggio?: string;
  dettaglio?: unknown;
}

/**
 * POST /api/v1/esecuzioni
 * body: { azione: 'apri', direzione } → { id }
 * body: { azione: 'chiudi', id, esito, letti?, scritti?, errori?, messaggio? }
 *
 * Il diario dei giri di sincronizzazione. Serve a una cosa sola, ma decisiva:
 * accorgersi quando l'integrazione ha smesso di funzionare.
 *
 * Un'integrazione che si rompe in silenzio e' peggio di una che non c'e': in
 * ufficio continuano a fidarsi di numeri fermi da giorni. Un giro aperto e mai
 * chiuso e' altrettanto significativo di uno chiuso in errore — vuol dire che
 * l'agente e' morto a meta' — e per questo l'apertura si registra subito,
 * prima di iniziare a lavorare.
 *
 * `esito: 'parziale'` non e' un ripiego: e' il caso normale (otto righe passate,
 * due in errore) e va potuto dire senza dover scegliere fra "tutto bene" e
 * "disastro".
 */
export async function POST(request: NextRequest) {
  const g = await autenticaApi(request);
  if (!g.ok) return g.risposta;
  const { tenantId, sistema } = g.ctx;
  if (!sistema) {
    return erroreApi(409, 'sistema_non_configurato', 'Manca il sistema di destinazione.');
  }

  const body = await leggiJson<CorpoApri | CorpoChiudi>(request);
  if (!body?.azione) {
    return erroreApi(400, 'corpo_non_valido', 'Manca `azione` (apri | chiudi).');
  }

  const service = createServiceSupabase();

  if (body.azione === 'apri') {
    const direzione = body.direzione;
    if (direzione !== 'lettura' && direzione !== 'scrittura') {
      return erroreApi(
        400,
        'direzione_non_valida',
        '`direzione` deve essere `lettura` o `scrittura`.',
      );
    }

    const { data, error } = await service
      .from('integrazione_esecuzioni' as never)
      .insert({
        tenant_id: tenantId,
        sistema,
        direzione,
        avvio: body.avvio === 'schedulato' ? 'schedulato' : 'manuale',
      } as never)
      .select('id')
      .single();

    if (error) {
      return erroreApi(503, 'apertura_fallita', 'Non riesco ad aprire il giro.');
    }
    return Response.json({ contratto: CONTRATTO, id: (data as unknown as { id: string }).id });
  }

  if (body.azione === 'chiudi') {
    const { id, esito } = body;
    if (!id || !['ok', 'parziale', 'errore'].includes(esito)) {
      return erroreApi(
        400,
        'chiusura_non_valida',
        'Servono `id` ed `esito` (ok | parziale | errore).',
      );
    }

    const { data, error } = await service
      .from('integrazione_esecuzioni' as never)
      .update({
        conclusa_at: new Date().toISOString(),
        esito,
        letti: Number(body.letti) || 0,
        scritti: Number(body.scritti) || 0,
        errori: Number(body.errori) || 0,
        messaggio: body.messaggio?.slice(0, 2000) ?? null,
        dettaglio: body.dettaglio ?? null,
      } as never)
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .eq('sistema', sistema)
      // Un giro gia' chiuso non si riscrive: la storia resta com'e' andata.
      .is('conclusa_at', null)
      .select('id');

    if (error) {
      return erroreApi(503, 'chiusura_fallita', 'Non riesco a chiudere il giro.');
    }
    if ((data ?? []).length === 0) {
      return erroreApi(
        409,
        'giro_gia_chiuso',
        'Questo giro è già stato chiuso, oppure non appartiene a questo cliente.',
      );
    }
    return Response.json({ contratto: CONTRATTO, chiuso: id });
  }

  return erroreApi(400, 'azione_sconosciuta', '`azione` deve essere `apri` o `chiudi`.');
}
