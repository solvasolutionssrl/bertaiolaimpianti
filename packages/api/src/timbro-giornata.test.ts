import { describe, expect, it } from 'vitest';

import type { EventoTimbro } from './timbri-sequenza';
import {
  presenzaDaEventi,
  riempiScatola,
  statoGiornataTimbro,
  type TimbraturaAttribuita,
} from './timbro-giornata';

const T = (h: number, m = 0) => Date.UTC(2026, 9, 21, h, m);
const tocco = (id: string, ms: number): EventoTimbro => ({ id, ms, tipo: null, orologio: 'fisso' });
const timb = (
  id: string,
  tipo: 'ingresso' | 'uscita',
  ms: number,
  cantiereId = 'A',
  pausa = false,
): TimbraturaAttribuita => ({ id, tipo, ms, pausa, cantiereId });

/** Minuti di lavoro raccontati dagli eventi: ingresso → uscita successiva. */
function lavoroDagliEventi(eventi: { tipo: string; ms: number }[]): number {
  let tot = 0;
  let aperto: number | null = null;
  for (const e of eventi) {
    if (e.tipo === 'ingresso') aperto = e.ms;
    else if (aperto !== null) {
      tot += (e.ms - aperto) / 60_000;
      aperto = null;
    }
  }
  return tot;
}

describe('presenzaDaEventi', () => {
  it('quattro tocchi sono due intervalli e una pausa in mezzo', () => {
    const p = presenzaDaEventi([tocco('a', T(8)), tocco('b', T(12, 30)), tocco('c', T(13, 30)), tocco('d', T(18))]);
    expect(p.intervalli).toEqual([
      { inizioMs: T(8), fineMs: T(12, 30) },
      { inizioMs: T(13, 30), fineMs: T(18) },
    ]);
    expect(p.minutiNetti).toBe(270 + 270);
    expect(p.minutiPausa).toBe(60);
    expect(p.aperta).toBe(false);
  });

  it('un numero dispari di tocchi lascia la presenza aperta', () => {
    const p = presenzaDaEventi([tocco('a', T(8)), tocco('b', T(12)), tocco('c', T(13))]);
    expect(p.aperta).toBe(true);
    expect(p.intervalli).toHaveLength(1);
  });
});

describe('statoGiornataTimbro', () => {
  it('senza timbri del terminale non c’e’ niente da fare', () => {
    const g = statoGiornataTimbro({ eventi: [], timbrature: [timb('x', 'ingresso', T(8))] });
    expect(g.stato).toBe('nessun_timbro');
  });

  it('un solo tocco: la presenza e’ aperta e si aspetta', () => {
    expect(statoGiornataTimbro({ eventi: [tocco('a', T(8))], timbrature: [] }).stato).toBe('presenza_aperta');
  });

  it('tocchi chiusi e niente di attribuito: la scatola e’ da riempire, con gli estremi fisici', () => {
    const g = statoGiornataTimbro({
      eventi: [tocco('a', T(8, 27)), tocco('b', T(12, 30)), tocco('c', T(13, 30)), tocco('d', T(18))],
      timbrature: [],
    });
    expect(g.stato).toBe('da_ripartire');
    expect(g.scatola?.inizioFisico).toBe(true);
    expect(g.scatola?.fineFisica).toBe(true);
    expect(g.scatola?.ingressoEsistente).toBeNull();
    expect(g.scatola?.nettoMin).toBe(243 + 270);
    expect(g.scatola?.pausaTimbrataMin).toBe(60);
  });

  it('turno aperto dall’app e un tocco dopo: il tocco lo chiude, e il primo cantiere e’ quello del turno', () => {
    const g = statoGiornataTimbro({
      eventi: [tocco('a', T(18))],
      timbrature: [timb('x', 'ingresso', T(8, 30), 'CANT-1')],
    });
    expect(g.stato).toBe('da_chiudere');
    expect(g.scatola?.ingressoEsistente).toEqual({ id: 'x', cantiereId: 'CANT-1', ms: T(8, 30) });
    expect(g.scatola?.inizioFisico).toBe(false);
    expect(g.scatola?.fineFisica).toBe(true);
    expect(g.scatola?.intervalli).toEqual([{ inizioMs: T(8, 30), fineMs: T(18) }]);
  });

  it('turno aperto dall’app con tocco di ingresso prima e uscita dopo: la scatola parte dal turno', () => {
    const g = statoGiornataTimbro({
      eventi: [tocco('a', T(8)), tocco('b', T(18))],
      timbrature: [timb('x', 'ingresso', T(8, 30), 'CANT-1')],
    });
    expect(g.stato).toBe('da_chiudere');
    expect(g.scatola?.intervalli).toEqual([{ inizioMs: T(8, 30), fineMs: T(18) }]);
    expect(g.scatola?.nettoMin).toBe(570);
  });

  it('giornata chiusa dall’app che copre la presenza, viaggio compreso: coperta', () => {
    const g = statoGiornataTimbro({
      eventi: [tocco('a', T(8)), tocco('b', T(18))],
      timbrature: [timb('x', 'ingresso', T(8, 30)), timb('y', 'uscita', T(17, 30))],
      viaggioMin: 60,
    });
    expect(g.stato).toBe('coperta');
  });

  it('⭐ badge in sede, turno in cantiere, chiusura dall’app: cio’ che resta fuori dal turno e’ una scatola', () => {
    // Badge alle 8, in cantiere dalle 10 alle 17 (col pranzo timbrato dentro),
    // chiusa dall'app alle 18 (specchiata nel registro): restano 8→10 e 17→18.
    const g = statoGiornataTimbro({
      eventi: [tocco('a', T(8)), { id: 'fine', ms: T(18), tipo: 'uscita', orologio: 'telefono' }],
      timbrature: [
        timb('x', 'ingresso', T(10)),
        timb('p1', 'uscita', T(12), 'A', true),
        timb('p2', 'ingresso', T(13), 'A', true),
        timb('y', 'uscita', T(17)),
      ],
    });
    expect(g.stato).toBe('da_ripartire');
    expect(g.scatola?.intervalli).toEqual([
      { inizioMs: T(8), fineMs: T(10) },
      { inizioMs: T(17), fineMs: T(18) },
    ]);
    expect(g.scatola?.nettoMin).toBe(180);
    expect(g.scatola?.ingressoEsistente).toBeNull();
  });

  it('⭐ turno dall’app chiuso dal badge, poi ripartito: il badge resta un’uscita e la giornata e’ coperta', () => {
    // Il registro ha SOLO il badge delle 18. Dopo la ripartizione il turno e'
    // chiuso (9→17:40, strada di rientro 20 min): senza innesto il badge
    // sarebbe un ingresso e la giornata «manca l'uscita».
    const g = statoGiornataTimbro({
      eventi: [tocco('b', T(18))],
      timbrature: [timb('x', 'ingresso', T(9)), timb('y', 'uscita', T(17, 40))],
      viaggioMin: 20,
    });
    expect(g.stato).toBe('coperta');
    expect(g.presenza?.aperta).toBe(false);
  });

  it('due turni dall’app con un badge di uscita in mezzo: si innesta anche il secondo', () => {
    const g = statoGiornataTimbro({
      eventi: [tocco('out', T(12))],
      timbrature: [
        timb('a', 'ingresso', T(8)),
        timb('b', 'uscita', T(11, 50)),
        timb('c', 'ingresso', T(13)),
      ],
    });
    // 8 in (innesto), 12 badge → uscita, 13 in (innesto): presenza aperta, turno aperto.
    expect(g.stato).toBe('presenza_aperta');
    expect(g.presenza?.intervalli).toEqual([{ inizioMs: T(8), fineMs: T(12) }]);
  });

  it('un turno chiuso dall’app e poi una presenza dichiarata: niente innesto, la presenza e’ aperta', () => {
    const g = statoGiornataTimbro({
      eventi: [{ id: 'p', ms: T(14, 37), tipo: 'ingresso', orologio: 'telefono' }],
      timbrature: [timb('a', 'ingresso', T(14, 35)), timb('b', 'uscita', T(14, 36))],
    });
    expect(g.stato).toBe('presenza_aperta');
    expect(g.presenza?.incoerente).toBe(false);
  });

  it('le pause e le strade fra i cantieri stanno dentro il turno: non sono presenza scoperta', () => {
    const g = statoGiornataTimbro({
      eventi: [tocco('a', T(8)), tocco('b', T(17))],
      timbrature: [
        timb('x', 'ingresso', T(8)),
        timb('x2', 'uscita', T(12), 'A'),
        timb('y', 'ingresso', T(12, 40), 'B'),
        timb('y2', 'uscita', T(17), 'B'),
      ],
    });
    expect(g.stato).toBe('coperta');
  });

  it('ore attribuite che lasciano scoperta la coda della presenza: da ripartire, non da verificare', () => {
    const g = statoGiornataTimbro({
      eventi: [tocco('a', T(8)), tocco('b', T(18))],
      timbrature: [timb('x', 'ingresso', T(8)), timb('y', 'uscita', T(15))],
    });
    expect(g.stato).toBe('da_ripartire');
    expect(g.scatola?.intervalli).toEqual([{ inizioMs: T(15), fineMs: T(18) }]);
    expect(g.scatola?.nettoMin).toBe(180);
  });

  it('una direzione dichiarata che contraddice la sequenza va all’ufficio', () => {
    const g = statoGiornataTimbro({
      eventi: [tocco('a', T(8)), { id: 'b', ms: T(9), tipo: 'ingresso', orologio: 'fisso' }],
      timbrature: [],
    });
    expect(g.stato).toBe('da_verificare');
  });

  it('ore attribuite oltre la presenza (stima di strada lunga): coperta, non una scatola vuota', () => {
    const g = statoGiornataTimbro({
      eventi: [tocco('a', T(8)), tocco('b', T(18))],
      timbrature: [timb('x', 'ingresso', T(8, 30)), timb('y', 'uscita', T(17, 30))],
      viaggioMin: 120,
    });
    expect(g.stato).toBe('coperta');
  });

  it('turno dell’app chiuso ma manca il tocco di uscita: da verificare', () => {
    const g = statoGiornataTimbro({
      eventi: [tocco('a', T(8))],
      timbrature: [timb('x', 'ingresso', T(8, 30)), timb('y', 'uscita', T(17))],
    });
    expect(g.stato).toBe('da_verificare');
  });
});

describe('riempiScatola', () => {
  it('un intervallo e un cantiere: ingresso e uscita sugli orari veri', () => {
    const r = riempiScatola({
      intervalli: [{ inizioMs: T(8), fineMs: T(17) }],
      segmenti: [{ cantiereId: 'A', minuti: 0 }],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.eventi).toEqual([
      { cantiereId: 'A', tipo: 'ingresso', pausa: false, ms: T(8) },
      { cantiereId: 'A', tipo: 'uscita', pausa: false, ms: T(17) },
    ]);
    expect(r.nettoMin).toBe(540);
  });

  it('la pausa timbrata resta dove e’ stata timbrata', () => {
    const r = riempiScatola({
      intervalli: [
        { inizioMs: T(8), fineMs: T(12, 31) },
        { inizioMs: T(13, 28), fineMs: T(18) },
      ],
      segmenti: [{ cantiereId: 'A', minuti: 0 }],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.eventi).toEqual([
      { cantiereId: 'A', tipo: 'ingresso', pausa: false, ms: T(8) },
      { cantiereId: 'A', tipo: 'uscita', pausa: true, ms: T(12, 31) },
      { cantiereId: 'A', tipo: 'ingresso', pausa: true, ms: T(13, 28) },
      { cantiereId: 'A', tipo: 'uscita', pausa: false, ms: T(18) },
    ]);
    expect(lavoroDagliEventi(r.eventi)).toBe(r.nettoMin);
  });

  it('due cantieri con strada in mezzo: la strada e’ un buco, e l’ultimo assorbe il resto', () => {
    const r = riempiScatola({
      intervalli: [{ inizioMs: T(8), fineMs: T(17) }],
      segmenti: [
        { cantiereId: 'A', minuti: 120 },
        { cantiereId: 'B', minuti: 0 },
      ],
      viaggioPrima: [0, 30],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.eventi).toEqual([
      { cantiereId: 'A', tipo: 'ingresso', pausa: false, ms: T(8) },
      { cantiereId: 'A', tipo: 'uscita', pausa: false, ms: T(10) },
      { cantiereId: 'B', tipo: 'ingresso', pausa: false, ms: T(10, 30) },
      { cantiereId: 'B', tipo: 'uscita', pausa: false, ms: T(17) },
    ]);
    expect(r.nettoMin).toBe(540 - 30);
    expect(lavoroDagliEventi(r.eventi)).toBe(r.nettoMin);
  });

  it('andata e ritorno dentro il contenitore spostano il primo ingresso e l’ultima uscita', () => {
    const r = riempiScatola({
      intervalli: [{ inizioMs: T(8), fineMs: T(18) }],
      segmenti: [{ cantiereId: 'A', minuti: 0 }],
      andataMin: 25,
      ritornoMin: 35,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.eventi[0]).toEqual({ cantiereId: 'A', tipo: 'ingresso', pausa: false, ms: T(8, 25) });
    expect(r.eventi[1]).toEqual({ cantiereId: 'A', tipo: 'uscita', pausa: false, ms: T(17, 25) });
    expect(r.nettoMin).toBe(600 - 60);
  });

  it('una pausa dichiarata si scava al centro dell’intervallo piu’ lungo', () => {
    const r = riempiScatola({
      intervalli: [{ inizioMs: T(8), fineMs: T(18) }],
      segmenti: [{ cantiereId: 'A', minuti: 0 }],
      pausaDichiarataMin: 60,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.eventi.map((e) => [e.tipo, e.pausa, e.ms])).toEqual([
      ['ingresso', false, T(8)],
      ['uscita', true, T(12, 30)],
      ['ingresso', true, T(13, 30)],
      ['uscita', false, T(18)],
    ]);
    expect(r.nettoMin).toBe(540);
  });

  it('un cambio di cantiere che cade sulla pausa timbrata la rispetta', () => {
    const r = riempiScatola({
      intervalli: [
        { inizioMs: T(8), fineMs: T(12) },
        { inizioMs: T(13), fineMs: T(17) },
      ],
      segmenti: [
        { cantiereId: 'A', minuti: 240 },
        { cantiereId: 'B', minuti: 0 },
      ],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.eventi).toEqual([
      { cantiereId: 'A', tipo: 'ingresso', pausa: false, ms: T(8) },
      { cantiereId: 'A', tipo: 'uscita', pausa: true, ms: T(12) },
      { cantiereId: 'B', tipo: 'ingresso', pausa: true, ms: T(13) },
      { cantiereId: 'B', tipo: 'uscita', pausa: false, ms: T(17) },
    ]);
  });

  it('cantieri consecutivi uguali sono uno solo', () => {
    const r = riempiScatola({
      intervalli: [{ inizioMs: T(8), fineMs: T(12) }],
      segmenti: [
        { cantiereId: 'A', minuti: 60 },
        { cantiereId: 'A', minuti: 0 },
      ],
      viaggioPrima: [0, 15],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.eventi).toHaveLength(2);
    expect(r.nettoMin).toBe(240);
  });

  it('se i minuti dichiarati superano la presenza, lo dice', () => {
    const r = riempiScatola({
      intervalli: [{ inizioMs: T(8), fineMs: T(12) }],
      segmenti: [
        { cantiereId: 'A', minuti: 300 },
        { cantiereId: 'B', minuti: 0 },
      ],
    });
    expect(r).toEqual({ ok: false, error: 'SOMMA_NON_TORNA' });
  });

  it('senza intervalli o senza segmenti non si scrive niente', () => {
    expect(riempiScatola({ intervalli: [], segmenti: [{ cantiereId: 'A', minuti: 0 }] })).toEqual({
      ok: false,
      error: 'NESSUN_INTERVALLO',
    });
    expect(riempiScatola({ intervalli: [{ inizioMs: T(8), fineMs: T(9) }], segmenti: [] })).toEqual({
      ok: false,
      error: 'NESSUN_SEGMENTO',
    });
  });

  it('il lavoro raccontato dagli eventi e’ sempre il netto, anche con pause, strada e viaggi insieme', () => {
    const r = riempiScatola({
      intervalli: [
        { inizioMs: T(7, 50), fineMs: T(12, 20) },
        { inizioMs: T(13, 5), fineMs: T(18, 10) },
      ],
      segmenti: [
        { cantiereId: 'A', minuti: 90 },
        { cantiereId: 'B', minuti: 200 },
        { cantiereId: 'C', minuti: 0 },
      ],
      viaggioPrima: [0, 20, 40],
      andataMin: 15,
      ritornoMin: 25,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(lavoroDagliEventi(r.eventi)).toBe(r.nettoMin);
    expect(r.nettoMin).toBe(270 + 305 - 20 - 40 - 15 - 25);
    // Tutti gli eventi stanno dentro gli intervalli.
    for (const e of r.eventi) {
      expect((e.ms >= T(7, 50) && e.ms <= T(12, 20)) || (e.ms >= T(13, 5) && e.ms <= T(18, 10))).toBe(true);
    }
  });
});
