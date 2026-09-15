import { describe, it, expect } from 'vitest';

import {
  ORARIO_ORDINARIO_DEFAULT_MIN,
  minutiDaTimbrature,
  oreDaMinuti,
  orarioOrdinarioValido,
  quoteDaRiga,
  quoteGiornata,
  quoteOre,
  sommaQuote,
} from './kantiere-quote';

const H = 60;
const riga = (chiave: string, lavoroH: number, viaggioH = 0) => ({
  chiave,
  minutiLavoro: Math.round(lavoroH * H),
  minutiViaggio: Math.round(viaggioH * H),
});

describe('quoteGiornata: la regola del cliente (14/09/2026)', () => {
  it('10 ore di lavoro sono 10 ore: 8 ordinarie e 2 straordinarie, niente di più', () => {
    const { totali } = quoteGiornata([riga('A', 10)], 8 * H);
    expect(totali).toEqual({
      minutiLavoro: 600,
      minutiViaggio: 0,
      minutiOrdinari: 480,
      minutiStraordinari: 120,
      minutiViaggioOrdinari: 0,
      minutiViaggioEccedenti: 0,
    });
  });

  it('7 di lavoro + 2 di viaggio: 8 ordinarie (7 + 1 di viaggio) e 1 di viaggio eccedente', () => {
    const { totali } = quoteGiornata([riga('A', 7, 2)], 8 * H);
    expect(totali.minutiOrdinari + totali.minutiViaggioOrdinari).toBe(480);
    expect(totali.minutiViaggioOrdinari).toBe(60);
    expect(totali.minutiViaggioEccedenti).toBe(60);
    expect(totali.minutiStraordinari).toBe(0);
  });

  it('10 + 2: 8 ordinarie, 2 straordinarie e tutto il viaggio eccedente', () => {
    const { totali } = quoteGiornata([riga('A', 10, 2)], 8 * H);
    expect(totali.minutiOrdinari).toBe(480);
    expect(totali.minutiStraordinari).toBe(120);
    expect(totali.minutiViaggioOrdinari).toBe(0);
    expect(totali.minutiViaggioEccedenti).toBe(120);
  });

  it('caso reale Biscaro 10/09: 5 di lavoro + 4:10 di viaggio → 3 di viaggio ordinario, 1:10 eccedente', () => {
    const { totali } = quoteGiornata([{ chiave: 'A', minutiLavoro: 300, minutiViaggio: 250 }], 8 * H);
    expect(totali.minutiOrdinari).toBe(300);
    expect(totali.minutiViaggioOrdinari).toBe(180);
    expect(totali.minutiViaggioEccedenti).toBe(70);
  });

  it('sotto l orario ordinario non c è niente di speciale', () => {
    const { totali } = quoteGiornata([riga('A', 6, 1)], 8 * H);
    expect(totali).toMatchObject({ minutiOrdinari: 360, minutiStraordinari: 0, minutiViaggioOrdinari: 60, minutiViaggioEccedenti: 0 });
  });

  it('più cantieri: il lavoro consuma l orario per primo, poi il viaggio, e le righe sommano ai totali', () => {
    const { righe, totali } = quoteGiornata([riga('A', 5, 1), riga('B', 4, 1)], 8 * H);
    expect(righe[0]).toMatchObject({ minutiOrdinari: 300, minutiStraordinari: 0, minutiViaggioOrdinari: 0, minutiViaggioEccedenti: 60 });
    expect(righe[1]).toMatchObject({ minutiOrdinari: 180, minutiStraordinari: 60, minutiViaggioOrdinari: 0, minutiViaggioEccedenti: 60 });
    for (const k of ['minutiOrdinari', 'minutiStraordinari', 'minutiViaggioOrdinari', 'minutiViaggioEccedenti'] as const) {
      expect(righe.reduce((a, r) => a + r[k], 0)).toBe(totali[k]);
    }
    expect(totali.minutiOrdinari + totali.minutiStraordinari).toBe(totali.minutiLavoro);
    expect(totali.minutiViaggioOrdinari + totali.minutiViaggioEccedenti).toBe(totali.minutiViaggio);
  });

  it('un tenant con orario ordinario diverso usa il suo', () => {
    const { totali } = quoteGiornata([riga('A', 7, 1)], 7.5 * H);
    expect(totali).toMatchObject({ minutiOrdinari: 420, minutiViaggioOrdinari: 30, minutiViaggioEccedenti: 30 });
  });

  it('valori sporchi: negativi e decimali si puliscono, orario non valido torna al default', () => {
    expect(orarioOrdinarioValido(0)).toBe(ORARIO_ORDINARIO_DEFAULT_MIN);
    expect(orarioOrdinarioValido(Number.NaN)).toBe(ORARIO_ORDINARIO_DEFAULT_MIN);
    expect(orarioOrdinarioValido(25 * H)).toBe(ORARIO_ORDINARIO_DEFAULT_MIN);
    const { totali } = quoteGiornata([{ chiave: 'A', minutiLavoro: -30, minutiViaggio: 59.6 }], 0);
    expect(totali).toMatchObject({ minutiLavoro: 0, minutiViaggio: 60, minutiViaggioOrdinari: 60 });
  });
});

describe('quoteDaRiga: righe nuove e righe vecchie', () => {
  it('riga nuova: minuti puri e quote come salvate', () => {
    expect(
      quoteDaRiga({
        minuti_lavoro: 420,
        minuti_viaggio: 120,
        ore_ordinarie: '7.00',
        ore_straordinarie: 0,
        ore_viaggio: 2,
        ore_viaggio_ordinarie: 1,
        ore_viaggio_eccedenti: 1,
      }),
    ).toEqual({
      minutiLavoro: 420,
      minutiViaggio: 120,
      minutiOrdinari: 420,
      minutiStraordinari: 0,
      minutiViaggioOrdinari: 60,
      minutiViaggioEccedenti: 60,
    });
  });

  it('riga vecchia: resta com era, il viaggio tutto a parte', () => {
    // Giornata scritta a mano prima del 14/09: tutto nelle ordinarie.
    expect(quoteDaRiga({ ore_ordinarie: 10, ore_straordinarie: 0, ore_viaggio: 2 })).toEqual({
      minutiLavoro: 600,
      minutiViaggio: 120,
      minutiOrdinari: 600,
      minutiStraordinari: 0,
      minutiViaggioOrdinari: 0,
      minutiViaggioEccedenti: 120,
    });
  });

  it('riga vecchia con i minuti puri riempiti dalla migrazione: il viaggio resta a parte', () => {
    expect(quoteDaRiga({ minuti_lavoro: 540, minuti_viaggio: 60, ore_ordinarie: 8, ore_straordinarie: 1, ore_viaggio: 1 })).toEqual({
      minutiLavoro: 540,
      minutiViaggio: 60,
      minutiOrdinari: 480,
      minutiStraordinari: 60,
      minutiViaggioOrdinari: 0,
      minutiViaggioEccedenti: 60,
    });
  });

  it('sommaQuote somma righe di epoche diverse', () => {
    const t = sommaQuote([
      { ore_ordinarie: 8, ore_straordinarie: 1, ore_viaggio: 1 },
      { minuti_lavoro: 300, minuti_viaggio: 60, ore_ordinarie: 5, ore_viaggio_ordinarie: 1, ore_viaggio_eccedenti: 0 },
    ]);
    expect(t).toEqual({
      minutiLavoro: 840,
      minutiViaggio: 120,
      minutiOrdinari: 780,
      minutiStraordinari: 60,
      minutiViaggioOrdinari: 60,
      minutiViaggioEccedenti: 60,
    });
  });

  it('oreDaMinuti arrotonda a 2 decimali per le colonne ore', () => {
    expect(oreDaMinuti(250)).toBe(4.17);
    expect(oreDaMinuti(70)).toBe(1.17);
    expect(oreDaMinuti(-5)).toBe(0);
  });
});

describe('minutiDaTimbrature: il viaggio dentro l orario non è lavoro', () => {
  const T = Date.parse('2026-09-15T06:00:00.000Z');
  const m = (n: number) => T + n * 60000;
  const t = (id: string, tipo: 'ingresso' | 'uscita', min: number, chiave: string) => ({ id, tipo, ms: m(min), chiave });
  const giornata = (a: [number, number], b: [number, number]) => [
    t('a1', 'ingresso', a[0], 'cantiere:A'),
    t('a2', 'uscita', a[1], 'cantiere:A'),
    t('b1', 'ingresso', b[0], 'cantiere:B'),
    t('b2', 'uscita', b[1], 'cantiere:B'),
  ];

  it('cambio cantiere dal vivo (uscita e ingresso insieme): la strada si toglie dal cantiere di arrivo', () => {
    const r = minutiDaTimbrature(giornata([0, 240], [240, 540]), [
      { minuti: 30, timbraturaId: null, chiave: 'cantiere:B', daChiave: 'cantiere:A' },
    ]);
    expect(r.get('cantiere:A')).toEqual({ minutiLavoro: 240, minutiViaggio: 0 });
    expect(r.get('cantiere:B')).toEqual({ minutiLavoro: 270, minutiViaggio: 30 });
  });

  it('Registra giornata lascia il buco: niente da togliere', () => {
    const r = minutiDaTimbrature(giornata([0, 240], [270, 540]), [
      { minuti: 30, timbraturaId: null, chiave: 'cantiere:B', daChiave: 'cantiere:A' },
    ]);
    expect(r.get('cantiere:B')).toEqual({ minutiLavoro: 270, minutiViaggio: 30 });
  });

  it('andata prima del primo ingresso e ritorno dopo l ultima uscita non toccano il lavoro', () => {
    const r = minutiDaTimbrature(giornata([0, 240], [270, 540]), [
      { minuti: 40, timbraturaId: 'a1', chiave: null, daChiave: null },
      { minuti: 45, timbraturaId: 'b2', chiave: null, daChiave: null },
    ]);
    expect(r.get('cantiere:A')).toEqual({ minutiLavoro: 240, minutiViaggio: 40 });
    expect(r.get('cantiere:B')).toEqual({ minutiLavoro: 270, minutiViaggio: 45 });
  });

  it('passando dalla sede senza buco: il ritorno pesa sul cantiere lasciato, l andata su quello raggiunto', () => {
    const r = minutiDaTimbrature(giornata([0, 240], [240, 540]), [
      { minuti: 35, timbraturaId: 'a2', chiave: null, daChiave: null },
      { minuti: 32, timbraturaId: 'b1', chiave: null, daChiave: null },
    ]);
    expect(r.get('cantiere:A')).toEqual({ minutiLavoro: 205, minutiViaggio: 35 });
    expect(r.get('cantiere:B')).toEqual({ minutiLavoro: 268, minutiViaggio: 32 });
  });

  it('una pausa al cambio copre la strada', () => {
    const r = minutiDaTimbrature(giornata([0, 240], [300, 540]), [
      { minuti: 30, timbraturaId: null, chiave: 'cantiere:B', daChiave: 'cantiere:A' },
    ]);
    expect(r.get('cantiere:A')!.minutiLavoro + r.get('cantiere:B')!.minutiLavoro).toBe(480);
  });

  it('tratte scritte a mano senza timbrature: solo viaggio', () => {
    const r = minutiDaTimbrature([], [{ minuti: 250, timbraturaId: null, chiave: 'cantiere:A', daChiave: null }]);
    expect(r.get('cantiere:A')).toEqual({ minutiLavoro: 0, minutiViaggio: 250 });
  });

  it('turno ancora aperto: il tratto aperto non conta', () => {
    const r = minutiDaTimbrature([t('a1', 'ingresso', 0, 'cantiere:A')], []);
    expect(r.get('cantiere:A')).toBeUndefined();
  });
});

describe('quoteOre', () => {
  it('le ordinarie mostrate comprendono il viaggio entro l orario', () => {
    const { totali } = quoteGiornata([{ chiave: 'A', minutiLavoro: 420, minutiViaggio: 120 }], 480);
    expect(quoteOre(totali)).toEqual({
      lavoro: 7,
      viaggio: 2,
      ordinarie: 8,
      lavoroOrdinario: 7,
      viaggioOrdinario: 1,
      straordinarie: 0,
      viaggioEccedente: 1,
    });
  });

  it('una riga vecchia resta com era: ordinarie = lavoro ordinario, viaggio tutto eccedente', () => {
    expect(quoteOre(quoteDaRiga({ ore_ordinarie: 8, ore_straordinarie: 2, ore_viaggio: 1.5 }))).toMatchObject({
      ordinarie: 8,
      straordinarie: 2,
      viaggioOrdinario: 0,
      viaggioEccedente: 1.5,
    });
  });
});
