import { describe, expect, it } from 'vitest';
import { minutiDaTesto, testoDaMinuti } from './ore-testo';

describe('minutiDaTesto', () => {
  it('le forme che una persona scrive', () => {
    expect(minutiDaTesto('7:30')).toBe(450);
    expect(minutiDaTesto('7,5')).toBe(450);
    expect(minutiDaTesto('7.5')).toBe(450);
    expect(minutiDaTesto('7.25')).toBe(435);
    expect(minutiDaTesto('730')).toBe(450);
    expect(minutiDaTesto('0730')).toBe(450);
    expect(minutiDaTesto('7h30')).toBe(450);
    expect(minutiDaTesto('7 h 30')).toBe(450);
    expect(minutiDaTesto('7h')).toBe(420);
    expect(minutiDaTesto('90m')).toBe(90);
    expect(minutiDaTesto('90 min')).toBe(90);
  });
  it('un intero nudo: fino a 24 sono ore, oltre minuti', () => {
    expect(minutiDaTesto('8')).toBe(480);
    expect(minutiDaTesto('24')).toBe(1440);
    expect(minutiDaTesto('90')).toBe(90);
    expect(minutiDaTesto('240')).toBe(160); // «240» si legge 2:40 (tre cifre = H MM)
  });
  it('vuoto = 0, incomprensibile = null', () => {
    expect(minutiDaTesto('')).toBe(0);
    expect(minutiDaTesto('  ')).toBe(0);
    expect(minutiDaTesto('abc')).toBeNull();
    expect(minutiDaTesto('7:75')).toBe(495); // minuti oltre 59 si sommano, non si rifiutano
    expect(minutiDaTesto('799')).toBeNull();
  });
  it('testoDaMinuti: zero non si mostra', () => {
    expect(testoDaMinuti(0)).toBe('');
    expect(testoDaMinuti(450)).toBe('7:30');
    expect(testoDaMinuti(5)).toBe('0:05');
  });
});
