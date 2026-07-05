import { describe, it, expect } from 'vitest';

import { calcolaSegmentiSplit, nettoMinuti, type CalcolaSplitInput } from './kantiere-split';
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
