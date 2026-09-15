import { describe, it, expect } from 'vitest';

import {
  calcolaSegmentiSplit,
  nettoMinuti,
  trasferimentiDaSegmenti,
  type CalcolaSplitInput,
} from './kantiere-split';
import { minutiPerCommessa, type Timbratura } from './kantiere-ore';

const T0 = Date.parse('2026-07-05T08:00:00.000Z');
const min = (n: number) => T0 + n * 60000;

/** Ricostruisce le ore per cantiere come farebbe il ricalcolo: ingresso reale
 *  (su segs[0]) + eventi sintetici → minutiPerCommessa. */
function orePerCantiere(input: CalcolaSplitInput) {
  const res = calcolaSegmentiSplit(input);
  if (!res.ok) throw new Error(res.error);
  const timb: Timbratura[] = [
    { commessa_id: input.segmenti[0]!.cantiereId, tipo: 'ingresso', ts: new Date(input.ingressoMs).toISOString() },
    ...res.eventi.map((e) => ({
      commessa_id: e.cantiereId,
      tipo: e.tipo,
      ts: new Date(e.ms).toISOString(),
    })),
  ];
  return { res, map: minutiPerCommessa(timb) };
}

describe('nettoMinuti', () => {
  it('sottrae la pausa dallo span', () => {
    expect(nettoMinuti(T0, min(540), 60)).toBe(480); // 9h span - 1h pausa = 8h
    expect(nettoMinuti(T0, min(480), 0)).toBe(480);
  });
});

describe('calcolaSegmentiSplit', () => {
  it('un solo cantiere, nessuna pausa: solo l\'uscita finale', () => {
    const { res, map } = orePerCantiere({
      ingressoMs: T0, uscitaMs: min(480), pausaMin: 0,
      segmenti: [{ cantiereId: 'A', minuti: 480 }],
    });
    expect(res.ok).toBe(true);
    expect((res as any).eventi.at(-1)).toMatchObject({ tipo: 'uscita', ms: min(480) });
    expect(map.get('A')).toBe(480);
  });

  it('3 cantieri, nessuna pausa: ore per cantiere = dichiarate, chiude a T1', () => {
    const { res, map } = orePerCantiere({
      ingressoMs: T0, uscitaMs: min(480), pausaMin: 0,
      segmenti: [{ cantiereId: 'A', minuti: 120 }, { cantiereId: 'B', minuti: 180 }, { cantiereId: 'C', minuti: 180 }],
    });
    expect(res.ok).toBe(true);
    expect(map.get('A')).toBe(120);
    expect(map.get('B')).toBe(180);
    expect(map.get('C')).toBe(180);
    expect((res as any).eventi.at(-1).ms).toBe(min(480));
  });

  it('con pausa: gap escluso, ore nette = dichiarate, chiude a T1', () => {
    // span 540 (9h), pausa 60 → netto 480
    const input: CalcolaSplitInput = {
      ingressoMs: T0, uscitaMs: min(540), pausaMin: 60,
      segmenti: [{ cantiereId: 'A', minuti: 240 }, { cantiereId: 'B', minuti: 240 }],
    };
    const { res, map } = orePerCantiere(input);
    expect(res.ok).toBe(true);
    expect((res as any).nettoMin).toBe(480);
    expect(map.get('A')).toBe(240);
    expect(map.get('B')).toBe(240);
    expect((res as any).eventi.at(-1).ms).toBe(min(540)); // chiude a T1
    // esiste una coppia pausa (flag true)
    expect((res as any).eventi.some((e: any) => e.pausa)).toBe(true);
  });

  it('un cantiere con pausa (straddle): netto corretto, giornata chiusa', () => {
    const { res, map } = orePerCantiere({
      ingressoMs: T0, uscitaMs: min(510), pausaMin: 30, // netto 480
      segmenti: [{ cantiereId: 'A', minuti: 480 }],
    });
    expect(res.ok).toBe(true);
    expect(map.get('A')).toBe(480);
    expect((res as any).eventi.at(-1)).toMatchObject({ tipo: 'uscita', pausa: false, ms: min(510) });
  });

  it('l\'ultima riga assorbe il resto', () => {
    // netto 480; dichiaro A 100, B 100 → C assorbe 280
    const { res, map } = orePerCantiere({
      ingressoMs: T0, uscitaMs: min(480), pausaMin: 0,
      segmenti: [{ cantiereId: 'A', minuti: 100 }, { cantiereId: 'B', minuti: 100 }, { cantiereId: 'C', minuti: 999 }],
    });
    expect(res.ok).toBe(true);
    expect(map.get('C')).toBe(280);
  });

  it('cronologia strettamente non decrescente e primo evento è un\'uscita', () => {
    const res = calcolaSegmentiSplit({
      ingressoMs: T0, uscitaMs: min(540), pausaMin: 60,
      segmenti: [{ cantiereId: 'A', minuti: 200 }, { cantiereId: 'B', minuti: 280 }],
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.eventi[0]!.tipo).toBe('uscita');
    for (let i = 1; i < res.eventi.length; i++) {
      expect(res.eventi[i]!.ms).toBeGreaterThanOrEqual(res.eventi[i - 1]!.ms);
    }
    // ingressi === uscite (giornata bilanciata/chiusa) contando l'ingresso reale
    const ing = 1 + res.eventi.filter((e) => e.tipo === 'ingresso').length;
    const usc = res.eventi.filter((e) => e.tipo === 'uscita').length;
    expect(ing).toBe(usc);
  });

  it('l\'ultima assorbe: sovra-dichiarare l\'ultima la riduce (non è errore)', () => {
    // netto 480; A 300, B 300 → B (ultima) assorbe → 180. Nessun errore.
    const { res, map } = orePerCantiere({
      ingressoMs: T0, uscitaMs: min(480), pausaMin: 0,
      segmenti: [{ cantiereId: 'A', minuti: 300 }, { cantiereId: 'B', minuti: 300 }],
    });
    expect(res.ok).toBe(true);
    expect(map.get('A')).toBe(300);
    expect(map.get('B')).toBe(180);
  });

  it('i NON-ultimi superano il netto → errore', () => {
    // netto 480; A 300 + B 300 (non-ultimi) = 600 > 480 → errore.
    const res = calcolaSegmentiSplit({
      ingressoMs: T0, uscitaMs: min(480), pausaMin: 0,
      segmenti: [{ cantiereId: 'A', minuti: 300 }, { cantiereId: 'B', minuti: 300 }, { cantiereId: 'C', minuti: 60 }],
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe('SOMMA_NON_TORNA');
  });

  it('netto non valido (uscita = ingresso) → errore', () => {
    const res = calcolaSegmentiSplit({
      ingressoMs: T0, uscitaMs: T0, pausaMin: 0, segmenti: [{ cantiereId: 'A', minuti: 0 }],
    });
    expect(res.ok).toBe(false);
  });
});

describe('trasferimentiDaSegmenti', () => {
  it('3 cantieri distinti → 2 tratte in sequenza', () => {
    expect(
      trasferimentiDaSegmenti([
        { cantiereId: 'A', minuti: 120 },
        { cantiereId: 'B', minuti: 180 },
        { cantiereId: 'C', minuti: 180 },
      ]),
    ).toEqual([
      { da: 'A', a: 'B' },
      { da: 'B', a: 'C' },
    ]);
  });

  it('un solo cantiere → nessuna tratta', () => {
    expect(trasferimentiDaSegmenti([{ cantiereId: 'A', minuti: 480 }])).toEqual([]);
  });

  it('nessun segmento → nessuna tratta', () => {
    expect(trasferimentiDaSegmenti([])).toEqual([]);
  });

  it('cantieri consecutivi identici → collassati, nessun tragitto verso sé stessi', () => {
    expect(
      trasferimentiDaSegmenti([
        { cantiereId: 'A', minuti: 120 },
        { cantiereId: 'A', minuti: 360 },
      ]),
    ).toEqual([]);
  });

  it('segmento intermedio a 0 minuti → saltato (tratta diretta A→C)', () => {
    expect(
      trasferimentiDaSegmenti([
        { cantiereId: 'A', minuti: 120 },
        { cantiereId: 'B', minuti: 0 },
        { cantiereId: 'C', minuti: 360 },
      ]),
    ).toEqual([{ da: 'A', a: 'C' }]);
  });

  it('ultimo segmento a 0 dichiarati (assorbe il resto) → resta visitato', () => {
    expect(
      trasferimentiDaSegmenti([
        { cantiereId: 'A', minuti: 240 },
        { cantiereId: 'B', minuti: 0 },
      ]),
    ).toEqual([{ da: 'A', a: 'B' }]);
  });

  it('ritorno su un cantiere già visitato → tratta reale (A→B→A)', () => {
    expect(
      trasferimentiDaSegmenti([
        { cantiereId: 'A', minuti: 120 },
        { cantiereId: 'B', minuti: 120 },
        { cantiereId: 'A', minuti: 240 },
      ]),
    ).toEqual([
      { da: 'A', a: 'B' },
      { da: 'B', a: 'A' },
    ]);
  });
});

describe('calcolaSegmentiSplit con i trasferimenti fra cantieri (viaggioPrima)', () => {
  const T0s = Date.parse('2026-09-15T06:00:00.000Z');
  const minS = (n: number) => T0s + n * 60000;

  it('il trasferimento diventa un buco fra i due cantieri: le ore dichiarate restano lavoro', () => {
    // 08:00-17:00, niente pausa, A 4:00 poi 0:30 di strada, B 4:30.
    const r = calcolaSegmentiSplit({
      ingressoMs: minS(0),
      uscitaMs: minS(540),
      pausaMin: 0,
      segmenti: [
        { cantiereId: 'A', minuti: 240 },
        { cantiereId: 'B', minuti: 270 },
      ],
      viaggioPrima: [0, 30],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.nettoMin).toBe(510);
    expect(r.eventi).toEqual([
      { cantiereId: 'A', tipo: 'uscita', pausa: false, ms: minS(240) },
      { cantiereId: 'B', tipo: 'ingresso', pausa: false, ms: minS(270) },
      { cantiereId: 'B', tipo: 'uscita', pausa: false, ms: minS(540) },
    ]);
  });

  it('con la pausa allo stesso cambio della strada: la pausa va dopo 30 minuti sul cantiere di arrivo', () => {
    // Pausa e tratta nello stesso buco farebbero sembrare la pausa di 1:30.
    const r = calcolaSegmentiSplit({
      ingressoMs: minS(0),
      uscitaMs: minS(570),
      pausaMin: 60,
      segmenti: [
        { cantiereId: 'A', minuti: 240 },
        { cantiereId: 'B', minuti: 240 },
      ],
      viaggioPrima: [0, 30],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.eventi.map((e) => [e.cantiereId, e.tipo, e.pausa, (e.ms - T0s) / 60000])).toEqual([
      ['A', 'uscita', false, 240],
      ['B', 'ingresso', false, 270],
      ['B', 'uscita', true, 300],
      ['B', 'ingresso', true, 360],
      ['B', 'uscita', false, 570],
    ]);
  });

  it('se il cantiere di arrivo è troppo corto la pausa va prima della partenza', () => {
    const r = calcolaSegmentiSplit({
      ingressoMs: minS(0),
      uscitaMs: minS(331),
      pausaMin: 60,
      segmenti: [
        { cantiereId: 'A', minuti: 240 },
        { cantiereId: 'B', minuti: 1 },
      ],
      viaggioPrima: [0, 30],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.eventi.map((e) => [e.cantiereId, e.tipo, e.pausa, (e.ms - T0s) / 60000])).toEqual([
      ['A', 'uscita', true, 210],
      ['A', 'ingresso', true, 270],
      ['A', 'uscita', false, 300],
      ['B', 'ingresso', false, 330],
      ['B', 'uscita', false, 331],
    ]);
  });

  it('le ore che non tornano col viaggio tolto si segnalano', () => {
    const r = calcolaSegmentiSplit({
      ingressoMs: minS(0),
      uscitaMs: minS(480),
      pausaMin: 0,
      segmenti: [
        { cantiereId: 'A', minuti: 470 },
        { cantiereId: 'B', minuti: 10 },
      ],
      viaggioPrima: [0, 30],
    });
    expect(r).toEqual({ ok: false, error: 'SOMMA_NON_TORNA' });
  });
});
