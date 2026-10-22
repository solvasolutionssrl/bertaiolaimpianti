import 'server-only';

import type { createServerSupabase } from '@kommessa/api/server';
import type { ModalitaTimbratura } from '@kommessa/api/kantiere-cronologia';

import { specchiaChiusuraNelRegistro } from './presenza-registro';

/**
 * ⭐ Lo scrittore UNICO di `timbrature`.
 *
 * Una timbratura nasce da molte bocche — QR, app, capo squadra, ufficio,
 * divisione di fine turno, pausa dichiarata, scatola del terminale, chiusura
 * automatica — ma si scrive in UN modo. Prima erano quattordici `insert`
 * sparsi: ogni regola nuova (la `modalita` obbligatoria, lo specchio della
 * chiusura nel registro) andava ricordata in quattordici posti, e una volta
 * su quattordici si dimenticava.
 *
 * Cosa fa, sempre:
 *  - inserisce le righe e restituisce gli id (in ordine di inserimento);
 *  - se fra le righe c'e' una FINE TURNO (uscita non di pausa) e la presenza
 *    della persona e' aperta nel registro (badge o presenza dall'app), scrive
 *    l'uscita anche li': «si apre con una bocca, si chiude con un'altra».
 *
 * Cosa NON fa, di proposito: il ricalcolo della giornata. Chi scrive sa se
 * deve ricalcolare subito, dopo le tratte, o con una versione a nome suo.
 */
export interface TimbraturaDaScrivere {
  tenant_id: string;
  dipendente_id: string;
  cantiere_id: string | null;
  commessa_id: string | null;
  tipo: 'ingresso' | 'uscita';
  pausa: boolean;
  origine: 'qr' | 'cronometro' | 'capo' | 'manuale' | 'timbro';
  modalita: ModalitaTimbratura;
  /** ISO. */
  ts: string;
  creato_da: string | null;
  sede_lavoro_id?: string | null;
  geo_lat?: number | null;
  geo_lng?: number | null;
  auto_chiusa?: boolean;
}

export interface TimbraturaScritta {
  id: string;
  tipo: 'ingresso' | 'uscita';
  ts: string;
  pausa: boolean;
  cantiere_id: string | null;
}

export type EsitoScrittura = { ok: true; righe: TimbraturaScritta[] } | { ok: false; error: string };

export async function scriviTimbrature(
  supabase: ReturnType<typeof createServerSupabase>,
  righe: TimbraturaDaScrivere[],
  opts: { dispositivo?: 'pc' | 'telefono' } = {},
): Promise<EsitoScrittura> {
  if (righe.length === 0) return { ok: true, righe: [] };
  const { data, error } = await supabase
    .from('timbrature' as never)
    .insert(righe as never)
    .select('id, tipo, ts, pausa, cantiere_id');
  if (error) return { ok: false, error: error.message };
  const scritte = ((data as { id: string; tipo: 'ingresso' | 'uscita'; ts: string; pausa: boolean | null; cantiere_id: string | null }[] | null) ?? [])
    .map((r) => ({ id: r.id, tipo: r.tipo, ts: r.ts, pausa: !!r.pausa, cantiere_id: r.cantiere_id }));

  // Una fine turno per persona: l'ultima, se ce n'e' piu' d'una nel lotto.
  const fini = new Map<string, TimbraturaDaScrivere>();
  for (const r of righe) {
    if (r.tipo !== 'uscita' || r.pausa) continue;
    const prev = fini.get(r.dipendente_id);
    if (!prev || Date.parse(r.ts) > Date.parse(prev.ts)) fini.set(r.dipendente_id, r);
  }
  for (const r of fini.values()) {
    await specchiaChiusuraNelRegistro(supabase, {
      tenantId: r.tenant_id,
      dipendenteId: r.dipendente_id,
      userId: r.creato_da,
      ts: r.ts,
      dispositivo: opts.dispositivo ?? (r.modalita === 'ufficio' || r.modalita === 'giornata_dichiarata' ? 'pc' : 'telefono'),
      origine: r.origine,
    });
  }
  return { ok: true, righe: scritte };
}
