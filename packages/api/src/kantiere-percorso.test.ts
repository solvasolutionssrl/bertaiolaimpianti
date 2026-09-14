import { describe, it, expect } from 'vitest';

import {
  chiaveCoppia,
  ciSonoViaggi,
  confiniFraCantieri,
  datiMancanti,
  MEZZO_NON_IN_ELENCO,
  minutiTratta,
  passaggioDaVia,
  segmentiBarraGiornata,
  spostaOrario,
  tratteIntermedie,
  viaDaPassaggio,
  type TrattaEstrema,
} from './kantiere-percorso';
import { calcolaSegmentiSplit, trasferimentiDaSegmenti } from './kantiere-split';

const T0 = Date.parse('2026-09-14T06:00:00.000Z');

const nonIndicata: TrattaEstrema = { luogo: null, stimaMin: null, inArrivo: false, minutiCorretti: null, motivo: '' };
const casa: TrattaEstrema = { ...nonIndicata, luogo: { tipo: 'casa' } };
const sede = (stimaMin: number | null, extra: Partial<TrattaEstrema> = {}): TrattaEstrema => ({
  ...nonIndicata,
  luogo: { tipo: 'sede', sedeId: 'S1' },
  stimaMin,
  ...extra,
});

describe('tratteIntermedie', () => {
  const coppie = [
    { da: 'A', a: 'B' },
    { da: 'B', a: 'C' },
  ];

  it('senza indicazioni ogni tratta è diretta', () => {
    expect(tratteIntermedie(coppie, {})).toEqual([
      { tipo: 'diretta', da: 'A', a: 'B' },
      { tipo: 'diretta', da: 'B', a: 'C' },
    ]);
  });

  it('rispetta il passaggio dalla sede o da casa, per coppia', () => {
    const t = tratteIntermedie(coppie, {
      [chiaveCoppia({ da: 'A', a: 'B' })]: { sedeId: 'S1' },
      [chiaveCoppia({ da: 'B', a: 'C' })]: 'casa',
    });
    expect(t).toEqual([
      { tipo: 'via_sede', da: 'A', a: 'B', sedeId: 'S1' },
      { tipo: 'via_casa', da: 'B', a: 'C' },
    ]);
  });

  it('un passaggio rimasto da cantieri che non ci sono più si ignora', () => {
    const t = tratteIntermedie([{ da: 'A', a: 'C' }], { 'A>B': 'casa' });
    expect(t).toEqual([{ tipo: 'diretta', da: 'A', a: 'C' }]);
  });

  it('il valore `via` del payload fa andata e ritorno', () => {
    for (const via of ['diretto', 'casa', '5b0c5f3e-0000-4000-8000-000000000001']) {
      expect(viaDaPassaggio(passaggioDaVia(via))).toBe(via);
    }
  });
});

describe('confiniFraCantieri', () => {
  /** Eventi completi come li scrive registraGiornataDaZero: ingresso + split. */
  function eventiGiornata(split: { cantiereId: string; minuti: number }[], pausaMin: number, fineMin: number) {
    const calc = calcolaSegmentiSplit({
      ingressoMs: T0,
      uscitaMs: T0 + fineMin * 60000,
      pausaMin,
      segmenti: split,
    });
    if (!calc.ok) throw new Error(calc.error);
    return [{ cantiereId: split[0]!.cantiereId, tipo: 'ingresso' as const, pausa: false, ms: T0 }, ...calc.eventi];
  }

  it('due cantieri con la pausa al cambio: un solo confine, fra A e B', () => {
    const ev = eventiGiornata(
      [
        { cantiereId: 'A', minuti: 240 },
        { cantiereId: 'B', minuti: 240 },
      ],
      60,
      540,
    );
    const confini = confiniFraCantieri(ev);
    expect(confini).toHaveLength(1);
    expect(confini[0]!.uscita.cantiereId).toBe('A');
    expect(confini[0]!.ingresso.cantiereId).toBe('B');
  });

  it('tre cantieri: i confini seguono l\'ordine delle coppie dei trasferimenti', () => {
    const split = [
      { cantiereId: 'A', minuti: 120 },
      { cantiereId: 'B', minuti: 180 },
      { cantiereId: 'C', minuti: 180 },
    ];
    const confini = confiniFraCantieri(eventiGiornata(split, 45, 525));
    expect(confini.map((c) => ({ da: c.uscita.cantiereId, a: c.ingresso.cantiereId }))).toEqual(
      trasferimentiDaSegmenti(split),
    );
  });

  it('un cantiere solo con la pausa: nessun confine (la pausa non è un cambio)', () => {
    expect(confiniFraCantieri(eventiGiornata([{ cantiereId: 'A', minuti: 480 }], 60, 540))).toEqual([]);
  });
});

describe('datiMancanti', () => {
  const base = { intermedie: [], autista: false, mezzo: null, mezziDisponibili: 5 };

  it('pagina appena aperta: mancano partenza e rientro', () => {
    expect(datiMancanti({ ...base, andata: nonIndicata, ritorno: nonIndicata })).toEqual(['partenza', 'rientro']);
  });

  it('da casa a casa su un cantiere solo: niente viaggio, niente da chiedere', () => {
    expect(datiMancanti({ ...base, andata: casa, ritorno: casa, autista: true })).toEqual([]);
    expect(ciSonoViaggi({ andata: casa, ritorno: casa, intermedie: [] })).toBe(false);
  });

  it('dalla sede senza stima: serve il tempo; con la stima in arrivo si aspetta', () => {
    expect(datiMancanti({ ...base, andata: sede(null), ritorno: casa })).toEqual(['tempo_andata']);
    expect(datiMancanti({ ...base, andata: sede(null, { inArrivo: true }), ritorno: casa })).toEqual([]);
    expect(datiMancanti({ ...base, andata: sede(null, { minutiCorretti: 30 }), ritorno: casa })).toEqual([]);
  });

  it('tempo diverso dalla stima: serve il motivo, come chiede il server', () => {
    const corretta = sede(40, { minutiCorretti: 55 });
    expect(datiMancanti({ ...base, andata: casa, ritorno: corretta })).toEqual(['motivo_ritorno']);
    expect(datiMancanti({ ...base, andata: casa, ritorno: { ...corretta, motivo: 'traffico' } })).toEqual([]);
    // Riportata alla stima: nessun motivo.
    expect(datiMancanti({ ...base, andata: casa, ritorno: sede(40, { minutiCorretti: 40 }) })).toEqual([]);
  });

  it('chi guida sceglie il mezzo, anche «non in elenco»; senza parco mezzi non si chiede', () => {
    const p = { ...base, andata: sede(30), ritorno: sede(30), autista: true };
    expect(datiMancanti(p)).toEqual(['mezzo']);
    expect(datiMancanti({ ...p, mezzo: MEZZO_NON_IN_ELENCO })).toEqual([]);
    expect(datiMancanti({ ...p, mezziDisponibili: 0 })).toEqual([]);
    expect(datiMancanti({ ...p, autista: false })).toEqual([]);
  });

  it('da casa a casa ma due cantieri: il trasferimento è un viaggio, il mezzo serve', () => {
    const p = {
      ...base,
      andata: casa,
      ritorno: casa,
      autista: true,
      intermedie: tratteIntermedie([{ da: 'A', a: 'B' }], {}),
    };
    expect(datiMancanti(p)).toEqual(['mezzo']);
    // …a meno che fra i due sia passato da casa.
    expect(datiMancanti({ ...p, intermedie: tratteIntermedie([{ da: 'A', a: 'B' }], { 'A>B': 'casa' }) })).toEqual([]);
  });

  it('i minuti: la correzione vince sulla stima, casa vale zero', () => {
    expect(minutiTratta(sede(40))).toBe(40);
    expect(minutiTratta(sede(40, { minutiCorretti: 50 }))).toBe(50);
    expect(minutiTratta({ ...casa, stimaMin: 40 })).toBe(0);
  });
});

describe('segmentiBarraGiornata', () => {
  const somma = (s: { minuti: number }[]) => s.reduce((a, x) => a + x.minuti, 0);

  it('andata, due cantieri con la pausa al cambio, ritorno', () => {
    const s = segmentiBarraGiornata({ andataMin: 40, ritornoMin: 45, minutiCantieri: [240, 240], pausaMin: 60, nettoMin: 480 });
    expect(s.map((x) => x.tipo)).toEqual(['andata', 'cantiere', 'pausa', 'cantiere', 'ritorno']);
    expect(somma(s)).toBe(40 + 480 + 60 + 45);
  });

  it('un cantiere solo: la pausa lo spezza a metà', () => {
    const s = segmentiBarraGiornata({ andataMin: 0, ritornoMin: 0, minutiCantieri: [480], pausaMin: 60, nettoMin: 480 });
    expect(s).toEqual([
      { tipo: 'cantiere', indice: 0, minuti: 240 },
      { tipo: 'pausa', minuti: 60 },
      { tipo: 'cantiere', indice: 0, minuti: 240 },
    ]);
  });

  it('le ore non assegnate restano visibili, i cantieri a zero no', () => {
    const s = segmentiBarraGiornata({ andataMin: 0, ritornoMin: 30, minutiCantieri: [300, 0], pausaMin: 0, nettoMin: 480 });
    expect(s).toEqual([
      { tipo: 'cantiere', indice: 0, minuti: 300 },
      { tipo: 'da_assegnare', minuti: 180 },
      { tipo: 'ritorno', minuti: 30 },
    ]);
  });

  it('la pausa va al cambio più vicino a metà giornata, come nella registrazione', () => {
    // Confini a 120 e 300 su 480: il centro è 240, vince 300 (distanza 60 contro 120).
    const s = segmentiBarraGiornata({ andataMin: 0, ritornoMin: 0, minutiCantieri: [120, 180, 180], pausaMin: 45, nettoMin: 480 });
    expect(s.map((x) => x.tipo)).toEqual(['cantiere', 'cantiere', 'pausa', 'cantiere']);
  });
});

describe('spostaOrario', () => {
  it('sposta avanti e indietro, anche oltre la mezzanotte', () => {
    expect(spostaOrario('08:00', -40)).toBe('07:20');
    expect(spostaOrario('17:30', 95)).toBe('19:05');
    expect(spostaOrario('00:10', -20)).toBe('23:50');
  });
});
