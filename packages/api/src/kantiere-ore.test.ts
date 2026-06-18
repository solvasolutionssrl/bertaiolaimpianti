import { describe, it, expect } from 'vitest';
import {
  minutiPerCommessa,
  calcolaOreGiornata,
  prossimoTipoTimbratura,
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
