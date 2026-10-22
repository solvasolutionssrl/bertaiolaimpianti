import { describe, expect, it } from 'vitest';

import { arrotondaAi5Min, oraMostrata } from './ora-mostrata';

// 22/10/2026, ora italiana (UTC+2): 12:32:29 locali = 10:32:29 UTC.
const T = (h: number, m: number, s = 0) => Date.UTC(2026, 9, 22, h - 2, m, s);

describe('ora mostrata ai 5 minuti', () => {
  it('12:32:29 scende a 12:30, 12:32:31 sale a 12:35 (il confine e’ 2:30)', () => {
    expect(oraMostrata(T(12, 32, 29))).toBe('12:30');
    expect(oraMostrata(T(12, 32, 30))).toBe('12:35');
    expect(oraMostrata(T(12, 32, 31))).toBe('12:35');
  });

  it('un orario gia’ sui 5 minuti non si muove, e i secondi spariscono', () => {
    expect(oraMostrata(T(8, 0, 0))).toBe('08:00');
    expect(oraMostrata(T(8, 0, 59))).toBe('08:00');
    expect(oraMostrata(T(8, 5, 0))).toBe('08:05');
  });

  it('⚠️ l’arrotondamento non e’ un troncamento: 10:27:43 va alle 10:30', () => {
    expect(oraMostrata(T(10, 27, 43))).toBe('10:30');
    expect(arrotondaAi5Min(T(10, 27, 43))).toBe(T(10, 30));
  });

  it('accetta ISO, Date e millisecondi; il vuoto resta vuoto', () => {
    const iso = new Date(T(17, 3, 50)).toISOString();
    expect(oraMostrata(iso)).toBe('17:05');
    expect(oraMostrata(new Date(iso))).toBe('17:05');
    expect(oraMostrata(null)).toBe('');
    expect(oraMostrata('')).toBe('');
    expect(oraMostrata('boh')).toBe('');
  });
});
