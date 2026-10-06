import { describe, expect, it } from 'vitest';

import {
  FASE_PREDEFINITA,
  FASI_LAVORI,
  VOCI_FASE_LAVORI,
  VOCI_FILTRO_FASE,
  eFaseLavori,
  etichettaFase,
  pesoFase,
} from './fase-lavori';

describe('eFaseLavori', () => {
  it('riconosce i tre valori dell’enum Postgres', () => {
    for (const f of FASI_LAVORI) expect(eFaseLavori(f)).toBe(true);
  });

  it('rifiuta tutto il resto senza sollevare', () => {
    for (const v of ['Finale', 'finali', '', null, undefined, 3, {}, []]) {
      expect(eFaseLavori(v)).toBe(false);
    }
  });
});

describe('etichettaFase', () => {
  it('scrive in italiano, non in snake_case', () => {
    expect(etichettaFase('in_corso')).toBe('In corso');
    expect(etichettaFase('sopralluogo')).toBe('Sopralluogo');
    expect(etichettaFase('finale')).toBe('Fine lavori');
  });

  it('non mostra MAI il valore grezzo di un dato che non conosce', () => {
    // Era il difetto vero: la didascalia sotto ogni foto stampava `f.momento`
    // così com'era, e un cliente leggeva «in_corso».
    for (const v of ['in_corso_v2', 'chissa', null, undefined, 42]) {
      const out = etichettaFase(v);
      expect(out).toBe('—');
      expect(out).not.toContain('_');
    }
  });
});

describe('le voci per i selettori', () => {
  it('coprono tutte e tre le fasi, in ordine di lavoro', () => {
    expect(VOCI_FASE_LAVORI.map((v) => v.valore)).toEqual([...FASI_LAVORI]);
  });

  it('nel filtro «Tutte» viene prima e vale stringa vuota', () => {
    expect(VOCI_FILTRO_FASE[0]).toEqual({ valore: '', etichetta: 'Tutte' });
    expect(VOCI_FILTRO_FASE).toHaveLength(FASI_LAVORI.length + 1);
  });

  it('ogni voce ha un’etichetta leggibile', () => {
    for (const v of VOCI_FASE_LAVORI) {
      expect(v.etichetta).toBe(etichettaFase(v.valore));
      expect(v.etichetta).not.toMatch(/[_]/);
    }
  });
});

describe('pesoFase', () => {
  it('ordina come si svolge il lavoro, non in alfabetico', () => {
    const mescolate = ['finale', 'sopralluogo', 'in_corso'];
    expect([...mescolate].sort((a, b) => pesoFase(a) - pesoFase(b))).toEqual([
      'sopralluogo',
      'in_corso',
      'finale',
    ]);
  });

  it('mette in fondo quello che non conosce, non in mezzo', () => {
    expect(pesoFase('chissa')).toBe(FASI_LAVORI.length);
    expect(pesoFase(null)).toBeGreaterThan(pesoFase('finale'));
  });
});

describe('il predefinito', () => {
  it('è una fase vera', () => {
    expect(eFaseLavori(FASE_PREDEFINITA)).toBe(true);
  });
});
