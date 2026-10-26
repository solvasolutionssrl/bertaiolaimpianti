import { leggiRegolaTimbri } from '@/app/_lib/kantiere-config';
import { arrotondaMs, arrotondaTimbrature } from '@kommessa/api/arrotondamento-timbri';
import 'server-only';

import type { createServerSupabase } from '@kommessa/api/server';
import { leggiTutto } from '@kommessa/api/pagine';
import { romeDay, romeDayBoundsUtc } from '@kommessa/api/rome-time';
import type { EventoTimbro } from '@kommessa/api/timbri-sequenza';
import {
  statoGiornataTimbro,
  type GiornataTimbro,
  type TimbraturaAttribuita,
} from '@kommessa/api/timbro-giornata';

/**
 * Le giornate viste dai timbri del terminale, persona per persona.
 *
 * Un lettore solo per tre consumatori — la pagina del tecnico, la vista
 * dell'ufficio, il promemoria della sera — cosi' «da ripartire» vuol dire la
 * stessa cosa in tutti e tre i posti. Il giudizio non e' qui: e'
 * `statoGiornataTimbro`, pura e provata. Qui si legge e si raggruppa.
 *
 * Accetta il client dell'utente (RLS: un tecnico vede i propri timbri,
 * l'ufficio tutti) o la service role (il cron).
 */

type Supa = ReturnType<typeof createServerSupabase>;

export interface TimbroVisto {
  id: string;
  ts: string;
  /** La direzione, risolta; null se l'evento e' stato scartato. */
  tipo: 'ingresso' | 'uscita' | null;
  /** La direzione l'abbiamo dedotta noi (badge) o era dichiarata (inserito a mano). */
  dedotto: boolean;
  genere: 'badge' | 'manuale' | 'api' | null;
  dispositivo: string | null;
  scartato: boolean;
  /** La fase del turno dichiarata dal terminale (26/10/2026), se c'e'. */
  passo: string | null;
  /** Chi l'ha stabilita: `person`/`office` dichiarano, `inferred` ipotizza. */
  passoOrigine: string | null;
}

export interface GiornataTimbroLetta extends GiornataTimbro {
  dipendenteId: string;
  giorno: string;
  timbri: TimbroVisto[];
  /** Da quali bocche sono arrivati gli eventi: `timbro` (terminale) e/o `app` (presenza segnata dall'app o dal PC). */
  sorgenti: string[];
}

interface RigaGrezza {
  id: string;
  sorgente: string;
  dipendente_id: string | null;
  ts: string | null;
  orologio: string;
  tipo: 'ingresso' | 'uscita' | null;
  genere: string | null;
  dispositivo: string | null;
  passo: string | null;
  passo_origine: string | null;
}

interface RigaTimbratura {
  id: string;
  dipendente_id: string;
  tipo: 'ingresso' | 'uscita';
  ts: string;
  pausa: boolean | null;
  cantiere_id: string | null;
  sottocantiere_id: string | null;
  commessa_id: string | null;
}

export const chiaveGiornata = (dipendenteId: string, giorno: string) => `${dipendenteId}|${giorno}`;

/**
 * Tutte le giornate con almeno un timbro del terminale fra due giorni
 * (inclusi, ora italiana). Chiave `dipendenteId|AAAA-MM-GG`.
 */
export async function leggiGiornateTimbro(
  supabase: Supa,
  tenantId: string,
  opts: { dalGiorno: string; alGiorno: string; dipendenteId?: string; tolleranzaMin?: number },
): Promise<Map<string, GiornataTimbroLetta>> {
  const { fromIso } = romeDayBoundsUtc(opts.dalGiorno);
  const { toIso } = romeDayBoundsUtc(opts.alGiorno);

  const grezzi = await leggiTutto<RigaGrezza>(
    (da, a) => {
      let q = supabase
        .from('timbri_grezzi' as never)
        .select('id, sorgente, dipendente_id, ts, orologio, tipo, genere, dispositivo, passo, passo_origine')
        .eq('tenant_id', tenantId)
        // Tutte le bocche: il terminale e la presenza segnata dall'app o dal
        // PC senza un cantiere. Il registro e' uno.
        .eq('stato', 'valido')
        .not('dipendente_id', 'is', null)
        .gte('ts', fromIso)
        .lt('ts', toIso)
        .order('ts')
        .order('id')
        .range(da, a);
      if (opts.dipendenteId) q = q.eq('dipendente_id', opts.dipendenteId);
      return q as never;
    },
    { contesto: 'timbri del terminale' },
  );
  if (grezzi.length === 0) return new Map();

  const perGiornata = new Map<string, RigaGrezza[]>();
  for (const g of grezzi) {
    if (!g.dipendente_id || !g.ts) continue;
    const k = chiaveGiornata(g.dipendente_id, romeDay(new Date(g.ts)));
    const lista = perGiornata.get(k) ?? [];
    lista.push(g);
    perGiornata.set(k, lista);
  }
  const dipendenti = [...new Set(grezzi.map((g) => g.dipendente_id!).filter(Boolean))];

  // Le timbrature attribuite delle stesse persone negli stessi giorni.
  const timbrature = await leggiTutto<RigaTimbratura>(
    (da, a) =>
      supabase
        .from('timbrature' as never)
        .select('id, dipendente_id, tipo, ts, pausa, cantiere_id, sottocantiere_id, commessa_id')
        .eq('tenant_id', tenantId)
        .in('dipendente_id', dipendenti.slice(0, 100))
        .gte('ts', fromIso)
        .lt('ts', toIso)
        .order('ts')
        .order('id')
        .range(da, a) as never,
    { contesto: 'timbrature delle giornate timbrate' },
  );
  const timbPerGiornata = new Map<string, RigaTimbratura[]>();
  for (const t of timbrature) {
    const k = chiaveGiornata(t.dipendente_id, romeDay(new Date(t.ts)));
    const lista = timbPerGiornata.get(k) ?? [];
    lista.push(t);
    timbPerGiornata.set(k, lista);
  }

  // Il viaggio del giorno: legato a una timbratura (il giorno e' il suo) o
  // sciolto, con la sua `data`.
  const idTimb = timbrature.map((t) => t.id);
  const giornoDiTimb = new Map(timbrature.map((t) => [t.id, chiaveGiornata(t.dipendente_id, romeDay(new Date(t.ts)))]));
  const viaggioPerGiornata = new Map<string, number>();
  const somma = (k: string, min: number) => viaggioPerGiornata.set(k, (viaggioPerGiornata.get(k) ?? 0) + min);
  for (let i = 0; i < idTimb.length; i += 100) {
    const { data } = await supabase
      .from('timbratura_viaggio' as never)
      .select('timbratura_id, durata_confermata_min')
      .in('timbratura_id', idTimb.slice(i, i + 100));
    for (const v of (data as { timbratura_id: string; durata_confermata_min: number | null }[] | null) ?? []) {
      const k = giornoDiTimb.get(v.timbratura_id);
      if (k) somma(k, Number(v.durata_confermata_min) || 0);
    }
  }
  {
    const { data } = await supabase
      .from('timbratura_viaggio' as never)
      .select('dipendente_id, data, durata_confermata_min')
      .eq('tenant_id', tenantId)
      .in('dipendente_id', dipendenti.slice(0, 100))
      .is('timbratura_id', null)
      .gte('data', opts.dalGiorno)
      .lte('data', opts.alGiorno);
    for (const v of (data as { dipendente_id: string; data: string; durata_confermata_min: number | null }[] | null) ?? []) {
      somma(chiaveGiornata(v.dipendente_id, v.data), Number(v.durata_confermata_min) || 0);
    }
  }

  // Scatola e intervalli sugli orari arrotondati al passo del cliente: e' da
  // qui che nasce il tempo da ripartire. `timbri` (a video) resta esatto.
  const regola = await leggiRegolaTimbri(supabase, tenantId);
  const out = new Map<string, GiornataTimbroLetta>();
  for (const [k, righe] of perGiornata) {
    const [dipendenteId, giorno] = k.split('|') as [string, string];
    const eventi: EventoTimbro[] = righe.map((r) => ({
      id: r.id,
      ms: r.ts ? arrotondaMs(Date.parse(r.ts), regola) : Number.NaN,
      ordine: r.ts ? Date.parse(r.ts) : undefined,
      tipo: r.tipo,
      orologio: r.orologio === 'fisso' ? 'fisso' : 'telefono',
    }));
    const attribuite: TimbraturaAttribuita[] = (timbPerGiornata.get(k) ?? []).map((t) => ({
      id: t.id,
      tipo: t.tipo,
      ms: arrotondaMs(Date.parse(t.ts), regola),
      ordine: Date.parse(t.ts),
      pausa: !!t.pausa,
      cantiereId: t.cantiere_id ?? t.commessa_id,
      sottocantiereId: t.sottocantiere_id ?? null,
    }));
    const g = statoGiornataTimbro({
      eventi,
      timbrature: attribuite,
      viaggioMin: viaggioPerGiornata.get(k) ?? 0,
      tolleranzaMin: opts.tolleranzaMin,
    });
    const risolti = new Map((g.presenza?.timbri ?? []).map((t) => [t.id, t]));
    const timbri: TimbroVisto[] = righe
      .map((r) => {
        const ris = risolti.get(r.id);
        return {
          id: r.id,
          ts: r.ts!,
          tipo: ris?.tipo ?? null,
          dedotto: ris?.dedotto ?? true,
          genere: (r.genere === 'badge' || r.genere === 'manuale' || r.genere === 'api' ? r.genere : null) as TimbroVisto['genere'],
          dispositivo: r.dispositivo,
          scartato: !ris,
          passo: r.passo ?? null,
          passoOrigine: r.passo_origine ?? null,
        };
      })
      .sort((a, b) => a.ts.localeCompare(b.ts));
    out.set(k, { ...g, dipendenteId, giorno, timbri, sorgenti: [...new Set(righe.map((r) => r.sorgente))] });
  }
  return out;
}

/** La giornata di una persona in un giorno, o null se il terminale non l'ha vista. */
export async function leggiGiornataTimbro(
  supabase: Supa,
  tenantId: string,
  dipendenteId: string,
  giorno: string,
  tolleranzaMin?: number,
): Promise<GiornataTimbroLetta | null> {
  const m = await leggiGiornateTimbro(supabase, tenantId, {
    dalGiorno: giorno,
    alGiorno: giorno,
    dipendenteId,
    tolleranzaMin,
  });
  return m.get(chiaveGiornata(dipendenteId, giorno)) ?? null;
}

/**
 * Per una persona: la giornata timbrata di oggi (se c'e') e la piu' vecchia
 * ancora da ripartire negli ultimi `giorni` giorni. E' cio' che il telefono
 * mostra e cio' che il promemoria controlla.
 */
export async function giornateTimbroPersona(
  supabase: Supa,
  tenantId: string,
  dipendenteId: string,
  giorni = 7,
): Promise<{ oggi: GiornataTimbroLetta | null; daFare: GiornataTimbroLetta | null }> {
  const oggi = romeDay(new Date());
  const dal = romeDay(new Date(Date.now() - giorni * 86_400_000));
  const m = await leggiGiornateTimbro(supabase, tenantId, { dalGiorno: dal, alGiorno: oggi, dipendenteId });
  const tutte = [...m.values()].sort((a, b) => a.giorno.localeCompare(b.giorno));
  const daFare = tutte.find((g) => g.stato === 'da_ripartire' || g.stato === 'da_chiudere') ?? null;
  return { oggi: m.get(chiaveGiornata(dipendenteId, oggi)) ?? null, daFare };
}
