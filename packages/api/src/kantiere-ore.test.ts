import { describe, it, expect } from 'vitest';
import {
  minutiPerCommessa,
  calcolaOreGiornata,
  prossimoTipoTimbratura,
  arrotonda15,
  minutiViaggioPerTarget,
  type Timbratura,
} from './kantiere-ore';

describe('minutiPerCommessa', () => {
  it('accoppia ingresso/uscita e somma i minuti', () => {
    const t: Timbratura[] = [
      { commessa_id: 'A', tipo: 'ingresso', ts: '2026-06-22T08:00:00Z' },
      { commessa_id: 'A', tipo: 'uscita', ts: '2026-06-22T12:00:00Z' },
    ];
    expect(minutiPerCommessa(t).get('A')).toBe(240);
  });
  it('pausa pranzo = uscita + successivo ingresso (gap non contato)', () => {
    const t: Timbratura[] = [
      { commessa_id: 'A', tipo: 'ingresso', ts: '2026-06-22T08:00:00Z' },
      { commessa_id: 'A', tipo: 'uscita', ts: '2026-06-22T12:00:00Z' },
      { commessa_id: 'A', tipo: 'ingresso', ts: '2026-06-22T13:00:00Z' },
      { commessa_id: 'A', tipo: 'uscita', ts: '2026-06-22T17:00:00Z' },
    ];
    expect(minutiPerCommessa(t).get('A')).toBe(480);
  });
  it('ignora la coda orfana (ingresso senza uscita)', () => {
    const t: Timbratura[] = [
      { commessa_id: 'A', tipo: 'ingresso', ts: '2026-06-22T08:00:00Z' },
    ];
    expect(minutiPerCommessa(t).get('A') ?? 0).toBe(0);
  });
  it('ignora uscita orfana iniziale', () => {
    const t: Timbratura[] = [
      { commessa_id: 'A', tipo: 'uscita', ts: '2026-06-22T08:00:00Z' },
      { commessa_id: 'A', tipo: 'ingresso', ts: '2026-06-22T09:00:00Z' },
      { commessa_id: 'A', tipo: 'uscita', ts: '2026-06-22T10:00:00Z' },
    ];
    expect(minutiPerCommessa(t).get('A')).toBe(60);
  });
  it('doppio ingresso: tiene il primo aperto, ignora il secondo', () => {
    const t: Timbratura[] = [
      { commessa_id: 'A', tipo: 'ingresso', ts: '2026-06-22T08:00:00Z' },
      { commessa_id: 'A', tipo: 'ingresso', ts: '2026-06-22T09:00:00Z' },
      { commessa_id: 'A', tipo: 'uscita', ts: '2026-06-22T10:00:00Z' },
    ];
    expect(minutiPerCommessa(t).get('A')).toBe(120);
  });
  it('separa per commessa e ordina per ts', () => {
    const t: Timbratura[] = [
      { commessa_id: 'B', tipo: 'uscita', ts: '2026-06-22T11:00:00Z' },
      { commessa_id: 'A', tipo: 'ingresso', ts: '2026-06-22T08:00:00Z' },
      { commessa_id: 'B', tipo: 'ingresso', ts: '2026-06-22T10:00:00Z' },
      { commessa_id: 'A', tipo: 'uscita', ts: '2026-06-22T09:00:00Z' },
    ];
    const m = minutiPerCommessa(t);
    expect(m.get('A')).toBe(60);
    expect(m.get('B')).toBe(60);
  });
});

describe('calcolaOreGiornata', () => {
  it('0h → righe a zero', () => {
    const r = calcolaOreGiornata({ minutiLavoratiPerCommessa: [] });
    expect(r.righe).toEqual([]);
    expect(r.ore_viaggio).toBe(0);
  });
  it('solo viaggio', () => {
    const r = calcolaOreGiornata({ minutiLavoratiPerCommessa: [], minutiViaggio: 90 });
    expect(r.righe).toEqual([]);
    expect(r.ore_viaggio).toBe(1.5);
  });
  it('sotto soglia → tutto ordinario', () => {
    const r = calcolaOreGiornata({ minutiLavoratiPerCommessa: [{ commessa_id: 'A', minuti: 300 }] });
    expect(r.righe[0]).toEqual({ commessa_id: 'A', ore_ordinarie: 5, ore_straordinarie: 0 });
  });
  it('esattamente soglia 8h → tutto ordinario', () => {
    const r = calcolaOreGiornata({ minutiLavoratiPerCommessa: [{ commessa_id: 'A', minuti: 480 }] });
    expect(r.righe[0]).toEqual({ commessa_id: 'A', ore_ordinarie: 8, ore_straordinarie: 0 });
  });
  it('sfora soglia → eccedenza straordinario', () => {
    const r = calcolaOreGiornata({ minutiLavoratiPerCommessa: [{ commessa_id: 'A', minuti: 600 }] });
    expect(r.righe[0]).toEqual({ commessa_id: 'A', ore_ordinarie: 8, ore_straordinarie: 2 });
  });
  it('multi-commessa: riempimento sequenziale fino a soglia', () => {
    const r = calcolaOreGiornata({
      minutiLavoratiPerCommessa: [
        { commessa_id: 'A', minuti: 300 }, // 5h → 5 ord
        { commessa_id: 'B', minuti: 300 }, // 5h → 3 ord + 2 straord
      ],
    });
    expect(r.righe[0]).toEqual({ commessa_id: 'A', ore_ordinarie: 5, ore_straordinarie: 0 });
    expect(r.righe[1]).toEqual({ commessa_id: 'B', ore_ordinarie: 3, ore_straordinarie: 2 });
  });
  it('soglia custom (tenant 6h)', () => {
    const r = calcolaOreGiornata({
      minutiLavoratiPerCommessa: [{ commessa_id: 'A', minuti: 480 }],
      sogliaOreOrdinarie: 6,
    });
    expect(r.righe[0]).toEqual({ commessa_id: 'A', ore_ordinarie: 6, ore_straordinarie: 2 });
  });
});

describe('prossimoTipoTimbratura', () => {
  it('nessuna timbrata → ingresso', () => expect(prossimoTipoTimbratura([])).toBe('ingresso'));
  it('ultima ingresso → uscita', () =>
    expect(prossimoTipoTimbratura([{ tipo: 'ingresso' }])).toBe('uscita'));
  it('ultima uscita → ingresso', () =>
    expect(prossimoTipoTimbratura([{ tipo: 'ingresso' }, { tipo: 'uscita' }])).toBe('ingresso'));
});

describe('arrotonda15', () => {
  it('arrotonda al quarto d\'ora più vicino', () => {
    expect(arrotonda15(150)).toBe(150);
    expect(arrotonda15(145)).toBe(150);
    expect(arrotonda15(143)).toBe(150); // 9.53 → 10*15
    expect(arrotonda15(142)).toBe(135); // 9.47 → 9*15
    expect(arrotonda15(38)).toBe(45);
    expect(arrotonda15(37)).toBe(30);
  });
  it('una tratta > 0 non scende sotto 15', () => {
    expect(arrotonda15(7)).toBe(15);
    expect(arrotonda15(1)).toBe(15);
  });
  it('zero o input non validi → 0', () => {
    expect(arrotonda15(0)).toBe(0);
    expect(arrotonda15(-10)).toBe(0);
    expect(arrotonda15(NaN)).toBe(0);
  });
});

describe('minutiViaggioPerTarget', () => {
  it('somma andata + ritorno per target', () => {
    const m = minutiViaggioPerTarget([
      { targetKey: 'cantiere:A', minuti: 90 },
      { targetKey: 'cantiere:A', minuti: 75 },
      { targetKey: 'commessa:B', minuti: 30 },
    ]);
    expect(m.get('cantiere:A')).toBe(165);
    expect(m.get('commessa:B')).toBe(30);
  });
  it('ignora chiavi vuote', () => {
    const m = minutiViaggioPerTarget([{ targetKey: '', minuti: 50 }]);
    expect(m.size).toBe(0);
  });
});

describe('viaggio extra: straordinari solo sul lavoro', () => {
  it('9h lavoro → 8 ord + 1 straord, viaggio separato non concorre', () => {
    const r = calcolaOreGiornata({
      minutiLavoratiPerCommessa: [{ commessa_id: 'cantiere:A', minuti: 9 * 60 }],
      minutiViaggio: 120,
      sogliaOreOrdinarie: 8,
    });
    expect(r.righe[0]!.ore_ordinarie).toBe(8);
    expect(r.righe[0]!.ore_straordinarie).toBe(1);
    expect(r.ore_viaggio).toBe(2);
  });
});
