import 'server-only';

import { createServiceSupabase } from '@kommessa/api/service';
import type { createServerSupabase } from '@kommessa/api/server';
import { romeDay } from '@kommessa/api/rome-time';

import { leggiGiornataTimbro } from '@/app/_lib/timbro/giornate';

/**
 * Si apre con una bocca e si chiude con un'altra.
 *
 * Chi la mattina passa il badge (o segna la presenza dall'app) e la sera
 * chiude il turno dal telefono, dal QR o dalla scrivania, ha chiuso la
 * giornata: non gli si chiede di tornare al terminale. Quando una timbratura
 * di FINE TURNO viene scritta e nel registro la presenza della persona e'
 * ancora aperta, qui si scrive l'uscita anche nel registro, alla stessa ora,
 * con scritto da dove viene.
 *
 * ⚠️ Solo la fine turno: una pausa non chiude la presenza, e un ingresso non
 * si specchia mai (la presenza aperta col badge E' gia' l'ingresso; un turno
 * aperto dall'app entra nella sequenza da solo, vedi `statoGiornataTimbro`).
 * ⚠️ Idempotente: se la presenza non e' aperta non scrive niente. Best-effort:
 * un errore qui non annulla la timbratura, che e' il fatto principale.
 */
export async function specchiaChiusuraNelRegistro(
  supabase: ReturnType<typeof createServerSupabase>,
  p: {
    tenantId: string;
    dipendenteId: string;
    userId: string | null;
    /** ISO dell'uscita appena scritta in `timbrature`. */
    ts: string;
    dispositivo: 'pc' | 'telefono';
    /** Da dove e' arrivata la chiusura, per chi legge il registro. */
    origine: 'qr' | 'cronometro' | 'capo' | 'manuale' | 'timbro';
  },
): Promise<void> {
  try {
    const giorno = romeDay(new Date(p.ts));
    const g = await leggiGiornataTimbro(supabase, p.tenantId, p.dipendenteId, giorno);
    if (!g?.presenza?.aperta) return;
    // La presenza deve essere stata aperta PRIMA di questa uscita: un registro
    // che parte dopo e' un altro fatto, non va chiuso qui.
    const primo = g.timbri.find((t) => !t.scartato);
    if (!primo || Date.parse(primo.ts) >= Date.parse(p.ts)) return;
    const service = createServiceSupabase();
    await service.from('timbri_grezzi' as never).insert({
      tenant_id: p.tenantId,
      sorgente: 'app',
      esterno_id: crypto.randomUUID(),
      dipendente_id: p.dipendenteId,
      badge: null,
      ts: p.ts,
      orologio: 'telefono',
      tipo: 'uscita',
      stato: 'valido',
      genere: null,
      dispositivo: p.dispositivo,
      grezzo: { specchio: 'fine_turno', origine: p.origine, user_id: p.userId },
    } as never);
  } catch {
    // best-effort: la timbratura e' scritta, il registro si sistema dall'ufficio.
  }
}
