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
  viaggioFraCantieri,
  type PezzoTratta,
  type TrattaEstrema,
  trattaModificata,
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

describe('lavoro dalla sede', () => {
  it('partenza dalla sede in cui si lavora: nessuna tratta e niente da chiedere', () => {
    const t = sede(null, { senzaViaggio: true });
    expect(minutiTratta(t)).toBe(0);
    expect(trattaModificata({ ...t, stimaMin: 30, minutiCorretti: 20 })).toBe(false);
    expect(ciSonoViaggi({ andata: t, ritorno: casa, intermedie: [] })).toBe(false);
    expect(
      datiMancanti({ andata: t, ritorno: casa, intermedie: [], autista: true, mezzo: null, mezziDisponibili: 3 }),
    ).toEqual([]);
  });

  it('una sede diversa da quella di lavoro resta una tratta normale', () => {
    const t = sede(null, { senzaViaggio: false });
    expect(datiMancanti({ andata: t, ritorno: casa, intermedie: [], autista: false, mezzo: null, mezziDisponibili: 0 })).toEqual([
      'tempo_andata',
    ]);
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

  it('con la strada allo stesso cambio la pausa va dopo 30 minuti sul cantiere di arrivo', () => {
    const s = segmentiBarraGiornata({
      andataMin: 30,
      ritornoMin: 30,
      minutiCantieri: [200, 220],
      trasferimentiMin: [0, 40],
      pausaMin: 60,
      nettoMin: 420,
    });
    expect(s).toEqual([
      { tipo: 'andata', minuti: 30 },
      { tipo: 'cantiere', indice: 0, minuti: 200 },
      { tipo: 'trasferimento', minuti: 40 },
      { tipo: 'cantiere', indice: 1, minuti: 30 },
      { tipo: 'pausa', minuti: 60 },
      { tipo: 'cantiere', indice: 1, minuti: 190 },
      { tipo: 'ritorno', minuti: 30 },
    ]);
    // Da partenza a rientro: andata + (fine − inizio) + ritorno.
    expect(somma(s)).toBe(30 + (420 + 40 + 60) + 30);
  });

  it('la barra mette pausa e tratta dove le mette la registrazione', () => {
    const barra = segmentiBarraGiornata({ andataMin: 0, ritornoMin: 0, minutiCantieri: [200, 220], trasferimentiMin: [0, 40], pausaMin: 60, nettoMin: 420 });
    const calc = calcolaSegmentiSplit({
      ingressoMs: T0,
      uscitaMs: T0 + 520 * 60000,
      pausaMin: 60,
      segmenti: [
        { cantiereId: 'A', minuti: 200 },
        { cantiereId: 'B', minuti: 220 },
      ],
      viaggioPrima: [0, 40],
    });
    expect(calc.ok).toBe(true);
    if (!calc.ok) return;
    // Minuti dall'inizio in cui ogni pezzo della barra finisce = orari degli eventi.
    let t = 0;
    const fini = barra.map((x) => (t += x.minuti));
    const eventi = calc.eventi.map((e) => (e.ms - T0) / 60000);
    expect(eventi).toEqual([fini[0], fini[1], fini[2], fini[3], fini[4]]);
  });

  it('senza pausa la tratta separa i due cantieri', () => {
    const s = segmentiBarraGiornata({ andataMin: 0, ritornoMin: 0, minutiCantieri: [240, 200], trasferimentiMin: [0, 40], pausaMin: 0, nettoMin: 440 });
    expect(s).toEqual([
      { tipo: 'cantiere', indice: 0, minuti: 240 },
      { tipo: 'trasferimento', minuti: 40 },
      { tipo: 'cantiere', indice: 1, minuti: 200 },
    ]);
  });

  it('la tratta verso un cantiere ancora a zero resta in barra, prima del da assegnare', () => {
    const s = segmentiBarraGiornata({ andataMin: 0, ritornoMin: 0, minutiCantieri: [300, 0], trasferimentiMin: [0, 25], pausaMin: 0, nettoMin: 455 });
    expect(s).toEqual([
      { tipo: 'cantiere', indice: 0, minuti: 300 },
      { tipo: 'trasferimento', minuti: 25 },
      { tipo: 'da_assegnare', minuti: 155 },
    ]);
    expect(somma(s)).toBe(480);
  });

  it('la pausa va al cambio più vicino a metà giornata, come nella registrazione', () => {
    // Confini a 120 e 300 su 480: il centro è 240, vince 300 (distanza 60 contro 120).
    const s = segmentiBarraGiornata({ andataMin: 0, ritornoMin: 0, minutiCantieri: [120, 180, 180], pausaMin: 45, nettoMin: 480 });
    expect(s.map((x) => x.tipo)).toEqual(['cantiere', 'cantiere', 'pausa', 'cantiere']);
  });
});

describe('viaggioFraCantieri', () => {
  const stime = (pezzo: PezzoTratta) =>
    pezzo.tipo === 'fra_cantieri' ? 20 : pezzo.tipo === 'verso_sede' ? 15 : 25;

  it('diretta = stima, passando dalla sede = le due tratte, passando da casa = 0', () => {
    const intermedie = tratteIntermedie(
      [
        { da: 'A', a: 'B' },
        { da: 'B', a: 'C' },
        { da: 'C', a: 'D' },
      ],
      { [chiaveCoppia({ da: 'B', a: 'C' })]: { sedeId: 'S1' }, [chiaveCoppia({ da: 'C', a: 'D' })]: 'casa' },
    );
    const v = viaggioFraCantieri(['A', 'B', 'C', 'D'], intermedie, stime);
    expect(v).toEqual({ prima: [0, 20, 40, 0], totale: 60, inArrivo: false });
  });

  it('chiede i pezzi giusti per la tratta che passa dalla sede', () => {
    const chiesti: PezzoTratta[] = [];
    viaggioFraCantieri(['A', 'B'], [{ tipo: 'via_sede', da: 'A', a: 'B', sedeId: 'S1' }], (p) => {
      chiesti.push(p);
      return 10;
    });
    expect(chiesti).toEqual([
      { tipo: 'verso_sede', cantiereId: 'A', sedeId: 'S1' },
      { tipo: 'da_sede', sedeId: 'S1', cantiereId: 'B' },
    ]);
  });

  it('una stima in arrivo blocca e intanto vale 0; una stima assente vale 0', () => {
    const intermedie = [{ tipo: 'diretta', da: 'A', a: 'B' } as const];
    expect(viaggioFraCantieri(['A', 'B'], intermedie, () => null)).toEqual({ prima: [0, 0], totale: 0, inArrivo: true });
    expect(viaggioFraCantieri(['A', 'B'], intermedie, () => 0)).toEqual({ prima: [0, 0], totale: 0, inArrivo: false });
  });

  it('un solo cantiere: nessuna tratta', () => {
    expect(viaggioFraCantieri(['A'], [], stime)).toEqual({ prima: [0], totale: 0, inArrivo: false });
  });

  it('con la registrazione: le ore dei cantieri sono lavoro, la tratta è un buco fra uscita e ingresso', () => {
    const intermedie = [{ tipo: 'diretta', da: 'A', a: 'B' } as const];
    const v = viaggioFraCantieri(['A', 'B'], intermedie, () => 40);
    // 8 ore di presenza senza pausa: 40 minuti di strada, 440 di lavoro da assegnare.
    const calc = calcolaSegmentiSplit({
      ingressoMs: T0,
      uscitaMs: T0 + 480 * 60000,
      pausaMin: 0,
      segmenti: [
        { cantiereId: 'A', minuti: 200 },
        { cantiereId: 'B', minuti: 480 - v.totale - 200 },
      ],
      viaggioPrima: v.prima,
    });
    expect(calc.ok).toBe(true);
    if (!calc.ok) return;
    expect(calc.nettoMin).toBe(440);
    const uscitaA = calc.eventi.find((e) => e.cantiereId === 'A' && e.tipo === 'uscita')!;
    const ingressoB = calc.eventi.find((e) => e.cantiereId === 'B' && e.tipo === 'ingresso')!;
    expect((ingressoB.ms - uscitaA.ms) / 60000).toBe(40);
    expect((uscitaA.ms - T0) / 60000).toBe(200);
  });
});

describe('spostaOrario', () => {
  it('sposta avanti e indietro, anche oltre la mezzanotte', () => {
    expect(spostaOrario('08:00', -40)).toBe('07:20');
    expect(spostaOrario('17:30', 95)).toBe('19:05');
    expect(spostaOrario('00:10', -20)).toBe('23:50');
  });
});
