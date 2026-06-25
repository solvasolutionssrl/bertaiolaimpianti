import { describe, it, expect } from 'vitest';
import {
  CATEGORIE_SPESA,
  isCategoriaSpesa,
  normalizzaCategoria,
  parseImportoIt,
  estrazioneSufficiente,
  calcolaImponibile,
} from './spese';

describe('parseImportoIt', () => {
  it('virgola decimale italiana', () => {
    expect(parseImportoIt('15,90')).toBe(15.9);
    expect(parseImportoIt('1.234,50')).toBe(1234.5);
    expect(parseImportoIt('€ 8,00')).toBe(8);
  });
  it('punto decimale anglosassone', () => {
    expect(parseImportoIt('15.90')).toBe(15.9);
    expect(parseImportoIt('1,234.50')).toBe(1234.5);
  });
  it('numero gia parsato', () => {
    expect(parseImportoIt(42.5)).toBe(42.5);
  });
  it('valore non parsabile → null', () => {
    expect(parseImportoIt('abc')).toBeNull();
    expect(parseImportoIt('')).toBeNull();
    expect(parseImportoIt(null)).toBeNull();
    expect(parseImportoIt(undefined)).toBeNull();
  });
});

describe('estrazioneSufficiente', () => {
  it('ok se totale (>0) + data presenti', () => {
    expect(
      estrazioneSufficiente({ importo_totale: 10, data_scontrino: '2026-06-25T12:00:00Z' }),
    ).toBe(true);
  });
  it('ko se manca il totale', () => {
    expect(
      estrazioneSufficiente({ importo_totale: null, data_scontrino: '2026-06-25T12:00:00Z' }),
    ).toBe(false);
  });
  it('ko se totale = 0', () => {
    expect(
      estrazioneSufficiente({ importo_totale: 0, data_scontrino: '2026-06-25T12:00:00Z' }),
    ).toBe(false);
  });
  it('ko se manca la data', () => {
    expect(estrazioneSufficiente({ importo_totale: 10, data_scontrino: null })).toBe(false);
  });
});

describe('categorie', () => {
  it('contiene le 6 categorie', () => {
    expect(CATEGORIE_SPESA).toEqual([
      'hotel',
      'ristorante',
      'bar',
      'trasporti',
      'carburante',
      'varie',
    ]);
  });
  it('isCategoriaSpesa', () => {
    expect(isCategoriaSpesa('bar')).toBe(true);
    expect(isCategoriaSpesa('benzina')).toBe(false);
  });
  it('normalizzaCategoria → varie se sconosciuta', () => {
    expect(normalizzaCategoria('hotel')).toBe('hotel');
    expect(normalizzaCategoria('xyz')).toBe('varie');
    expect(normalizzaCategoria(null)).toBe('varie');
  });
});

describe('calcolaImponibile', () => {
  it('totale - iva a 2 decimali', () => {
    expect(calcolaImponibile(122, 22)).toBe(100);
    expect(calcolaImponibile(15.9, 2.87)).toBe(13.03);
  });
  it('null se manca un valore', () => {
    expect(calcolaImponibile(122, null)).toBeNull();
    expect(calcolaImponibile(null, 22)).toBeNull();
  });
});
