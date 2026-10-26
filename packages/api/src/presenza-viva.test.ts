import { describe, expect, it } from 'vitest';

import { minutiPresenza, scriviDurata } from './presenza-viva';

const ORA = Date.parse('2026-10-26T14:00:00Z');
const base = { aperta: true, inizioMs: ORA - 6 * 3_600_000, pausaTimbrataMin: 0, nettoMin: 0, oraMs: ORA };

describe('minutiPresenza — scorre solo mentre la presenza è aperta', () => {
  it('aperta da sei ore: sei ore', () => {
    expect(minutiPresenza(base)).toBe(360);
  });

  it('le pause già timbrate si scalano', () => {
    expect(minutiPresenza({ ...base, pausaTimbrataMin: 30 })).toBe(330);
  });

  it('⚠️⚠️ chiusa (pausa iniziata): vale il netto, NON «adesso meno inizio»', () => {
    expect(minutiPresenza({ ...base, aperta: false, nettoMin: 320 })).toBe(320);
  });

  it('⚠️ chiusa non vuol dire zero: una giornata ferma ha già le sue ore', () => {
    expect(minutiPresenza({ ...base, aperta: false, nettoMin: 1 })).toBe(1);
  });

  it('chiusa e davvero senza niente dentro: non si scrive un numero', () => {
    expect(minutiPresenza({ ...base, aperta: false, nettoMin: 0 })).toBeNull();
  });

  it('aperta senza un inizio: non si inventa', () => {
    expect(minutiPresenza({ ...base, inizioMs: null })).toBeNull();
    expect(minutiPresenza({ ...base, inizioMs: Number.NaN })).toBeNull();
  });

  it('⚠️ mai negativo: il terminale può essere avanti di qualche minuto', () => {
    expect(minutiPresenza({ ...base, inizioMs: ORA + 4 * 60_000 })).toBe(0);
    expect(minutiPresenza({ ...base, pausaTimbrataMin: 600 })).toBe(0);
  });
});

describe('scriviDurata', () => {
  it('sotto l’ora si scrivono solo i minuti', () => {
    expect(scriviDurata(45)).toBe('45m');
  });

  it('sopra l’ora i minuti hanno sempre due cifre', () => {
    expect(scriviDurata(380)).toBe('6h 20m');
    expect(scriviDurata(365)).toBe('6h 05m');
  });

  it('niente da dire si scrive, non si lascia vuoto', () => {
    expect(scriviDurata(null)).toBe('—');
  });
});
