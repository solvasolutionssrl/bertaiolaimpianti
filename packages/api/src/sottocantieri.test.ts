import { describe, expect, it } from 'vitest';
import {
  chiaveCantiere,
  etichettaLuogo,
  faseDiChiave,
  fasiScegibili,
  luogoDaChiave,
  luogoDaValore,
  ordinaFasi,
  radiceChiave,
  stessoLuogo,
  valoreLuogo,
} from './sottocantieri';

describe('chiavi con la fase', () => {
  it('la fase e\' un suffisso della chiave del cantiere', () => {
    expect(chiaveCantiere('c1')).toBe('cantiere:c1');
    expect(chiaveCantiere('c1', 'f1')).toBe('cantiere:c1/f1');
    expect(chiaveCantiere('c1', null)).toBe('cantiere:c1');
  });
  it('radice e fase si rileggono', () => {
    expect(radiceChiave('cantiere:c1/f1')).toBe('cantiere:c1');
    expect(radiceChiave('cantiere:c1')).toBe('cantiere:c1');
    expect(faseDiChiave('cantiere:c1/f1')).toBe('f1');
    expect(faseDiChiave('cantiere:c1')).toBeNull();
  });
  it('luogoDaChiave: solo le chiavi dei cantieri', () => {
    expect(luogoDaChiave('cantiere:c1/f1')).toEqual({ cantiereId: 'c1', sottocantiereId: 'f1' });
    expect(luogoDaChiave('cantiere:c1')).toEqual({ cantiereId: 'c1', sottocantiereId: null });
    expect(luogoDaChiave('commessa:x')).toBeNull();
    expect(luogoDaChiave('cantiere:')).toBeNull();
  });
});

describe('valore dei pannelli', () => {
  it('andata e ritorno', () => {
    expect(valoreLuogo('c1')).toBe('c1');
    expect(valoreLuogo('c1', 'f1')).toBe('c1/f1');
    expect(luogoDaValore('c1/f1')).toEqual({ cantiereId: 'c1', sottocantiereId: 'f1' });
    expect(luogoDaValore('c1')).toEqual({ cantiereId: 'c1', sottocantiereId: null });
    expect(luogoDaValore('')).toBeNull();
    expect(luogoDaValore(null)).toBeNull();
  });
  it('stessoLuogo ignora la differenza fra null e assente', () => {
    expect(stessoLuogo({ cantiereId: 'c1', sottocantiereId: null }, { cantiereId: 'c1', sottocantiereId: null })).toBe(true);
    expect(stessoLuogo({ cantiereId: 'c1', sottocantiereId: 'f1' }, { cantiereId: 'c1', sottocantiereId: null })).toBe(false);
  });
});

describe('ordinaFasi', () => {
  it('⭐ ordine naturale dei codici: 25151.2 prima di 25151.10, e il nome come spareggio', () => {
    const out = ordinaFasi([
      { codice: '25151.10', nome: 'B' },
      { codice: '25151.2', nome: 'A' },
      { codice: null, nome: 'Z' },
      { codice: null, nome: 'C' },
    ]);
    expect(out.map((f) => f.codice ?? f.nome)).toEqual(['C', 'Z', '25151.2', '25151.10']);
  });
  it('non tocca l\'elenco ricevuto', () => {
    const in_ = [{ codice: 'b', nome: 'b' }, { codice: 'a', nome: 'a' }];
    ordinaFasi(in_);
    expect(in_[0]!.codice).toBe('b');
    expect(ordinaFasi(null)).toEqual([]);
  });
});

describe('a video', () => {
  it('etichetta con e senza fase', () => {
    expect(etichettaLuogo('Fincantieri')).toBe('Fincantieri');
    expect(etichettaLuogo('Fincantieri', 'Quadri')).toBe('Fincantieri › Quadri');
  });
  it('le fasi chiuse non si propongono', () => {
    expect(fasiScegibili([{ stato: 'attivo' }, { stato: 'chiuso' }, {}]).length).toBe(2);
    expect(fasiScegibili(null)).toEqual([]);
  });
});

describe('i motori delle ore con la fase', async () => {
  const { calcolaSegmentiSplit } = await import('./kantiere-split');
  const { riempiScatola } = await import('./timbro-giornata');
  const { minutiDaTimbrature } = await import('./kantiere-quote');
  const H = 3_600_000;
  const T0 = Date.parse('2026-10-23T06:00:00Z');

  it('split: la fase viaggia con gli eventi, due fasi dello stesso cantiere sono due segmenti', () => {
    const r = calcolaSegmentiSplit({
      ingressoMs: T0,
      uscitaMs: T0 + 8 * H,
      pausaMin: 0,
      segmenti: [
        { cantiereId: 'c1', sottocantiereId: 'f1', minuti: 300 },
        { cantiereId: 'c1', sottocantiereId: 'f2', minuti: 180 },
      ],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.eventi.map((e) => `${e.tipo}:${e.cantiereId}/${e.sottocantiereId ?? '-'}`)).toEqual([
      'uscita:c1/f1',
      'ingresso:c1/f2',
      'uscita:c1/f2',
    ]);
  });

  it('scatola: fasi diverse non si fondono, la stessa fase si', () => {
    const r = riempiScatola({
      intervalli: [{ inizioMs: T0, fineMs: T0 + 8 * H }],
      segmenti: [
        { cantiereId: 'c1', sottocantiereId: 'f1', minuti: 120 },
        { cantiereId: 'c1', sottocantiereId: 'f1', minuti: 60 },
        { cantiereId: 'c1', sottocantiereId: null, minuti: 300 },
      ],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const ingressi = r.eventi.filter((e) => e.tipo === 'ingresso');
    expect(ingressi.map((e) => e.sottocantiereId ?? null)).toEqual(['f1', null]);
    expect(r.eventi[0]!.sottocantiereId).toBe('f1');
  });

  it('⭐ il viaggio del cantiere va alla prima fase di quel cantiere, non a una riga vuota', () => {
    const out = minutiDaTimbrature(
      [
        { id: 'i1', tipo: 'ingresso', ms: T0, chiave: 'cantiere:c1/f1' },
        { id: 'u1', tipo: 'uscita', ms: T0 + 4 * H, chiave: 'cantiere:c1/f1' },
        { id: 'i2', tipo: 'ingresso', ms: T0 + 4 * H, chiave: 'cantiere:c1/f2' },
        { id: 'u2', tipo: 'uscita', ms: T0 + 8 * H, chiave: 'cantiere:c1/f2' },
      ],
      [{ minuti: 30, timbraturaId: null, chiave: 'cantiere:c1', daChiave: null }],
    );
    expect([...out.keys()]).toEqual(['cantiere:c1/f1', 'cantiere:c1/f2']);
    expect(out.get('cantiere:c1/f1')).toEqual({ minutiLavoro: 240, minutiViaggio: 30 });
    expect(out.get('cantiere:c1/f2')).toEqual({ minutiLavoro: 240, minutiViaggio: 0 });
  });

  it('⭐ il trasferimento fra due cantieri si riconosce anche se le righe sono per fase', () => {
    const out = minutiDaTimbrature(
      [
        { id: 'i1', tipo: 'ingresso', ms: T0, chiave: 'cantiere:c1/f1' },
        { id: 'u1', tipo: 'uscita', ms: T0 + 4 * H, chiave: 'cantiere:c1/f1' },
        { id: 'i2', tipo: 'ingresso', ms: T0 + 4 * H, chiave: 'cantiere:c2/g1' },
        { id: 'u2', tipo: 'uscita', ms: T0 + 8 * H, chiave: 'cantiere:c2/g1' },
      ],
      [{ minuti: 30, timbraturaId: null, chiave: 'cantiere:c2', daChiave: 'cantiere:c1' }],
    );
    // Cambio dal vivo: la strada erode il cantiere di arrivo.
    expect(out.get('cantiere:c1/f1')).toEqual({ minutiLavoro: 240, minutiViaggio: 0 });
    expect(out.get('cantiere:c2/g1')).toEqual({ minutiLavoro: 210, minutiViaggio: 30 });
  });
});
