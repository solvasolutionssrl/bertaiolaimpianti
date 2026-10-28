import { describe, expect, it } from 'vitest';
import { abbinaRighe } from './righe-abbina';

describe('abbinaRighe', () => {
  it('stessa chiave: si aggiorna e tiene l\'id', () => {
    const r = abbinaRighe([{ id: 'a', chiave: 'cantiere:X' }], [{ chiave: 'cantiere:X', riga: 8 }]);
    expect(r).toEqual({ aggiorna: [{ id: 'a', riga: 8 }], inserisci: [], cancella: [] });
  });

  it('chiave nuova si inserisce, chiave sparita si cancella', () => {
    const r = abbinaRighe(
      [{ id: 'a', chiave: 'cantiere:X' }, { id: 'b', chiave: 'cantiere:Y' }],
      [{ chiave: 'cantiere:X', riga: 4 }, { chiave: 'cantiere:Z', riga: 4 }],
    );
    expect(r.aggiorna).toEqual([{ id: 'a', riga: 4 }]);
    expect(r.inserisci).toEqual([4]);
    expect(r.cancella).toEqual(['b']);
  });

  it('la fase fa parte della chiave', () => {
    const r = abbinaRighe([{ id: 'a', chiave: 'cantiere:X' }], [{ chiave: 'cantiere:X/F1', riga: 8 }]);
    expect(r).toEqual({ aggiorna: [], inserisci: [8], cancella: ['a'] });
  });

  it('doppioni in tabella: il primo resta, l\'altro va via', () => {
    const r = abbinaRighe(
      [{ id: 'a', chiave: 'cantiere:X' }, { id: 'b', chiave: 'cantiere:X' }],
      [{ chiave: 'cantiere:X', riga: 8 }],
    );
    expect(r).toEqual({ aggiorna: [{ id: 'a', riga: 8 }], inserisci: [], cancella: ['b'] });
  });

  it('giornata svuotata: si cancella tutto', () => {
    const r = abbinaRighe([{ id: 'a', chiave: 'cantiere:X' }], []);
    expect(r).toEqual({ aggiorna: [], inserisci: [], cancella: ['a'] });
  });
});
