import { describe, it, expect } from 'vitest';

import {
  PAUSA_MASSIMA_MIN,
  PAUSA_MINIMA_MIN,
  PAUSE_RAPIDE_MIN,
  arrotondaPausaMin,
  etichettaPausa,
  pausaArrotondata,
} from './kantiere-pausa';

describe('arrotondaPausaMin', () => {
  it('porta al multiplo di cinque piu vicino', () => {
    expect(arrotondaPausaMin(32)).toBe(30);
    expect(arrotondaPausaMin(33)).toBe(35);
    expect(arrotondaPausaMin(47)).toBe(45);
    expect(arrotondaPausaMin(48)).toBe(50);
  });

  it('a meta strada arrotonda per eccesso', () => {
    expect(arrotondaPausaMin(2.5)).toBe(PAUSA_MINIMA_MIN);
    expect(arrotondaPausaMin(37.5)).toBe(40);
  });

  it('le scelte rapide restano se stesse', () => {
    for (const m of PAUSE_RAPIDE_MIN) expect(arrotondaPausaMin(m)).toBe(m);
  });

  it('zero significa «nessuna pausa» e resta zero', () => {
    // In «Registra giornata» e' una risposta vera, non un valore mancante.
    expect(arrotondaPausaMin(0)).toBe(0);
    expect(arrotondaPausaMin(-10)).toBe(0);
  });

  it('un valore piccolo ma positivo sale al minimo, non a zero', () => {
    // Chi scrive 2 intende una pausa cortissima, non «nessuna pausa».
    expect(arrotondaPausaMin(1)).toBe(PAUSA_MINIMA_MIN);
    expect(arrotondaPausaMin(2)).toBe(PAUSA_MINIMA_MIN);
  });

  it('non supera il massimo ammesso dal server', () => {
    expect(arrotondaPausaMin(600)).toBe(PAUSA_MASSIMA_MIN);
    expect(arrotondaPausaMin(241)).toBe(PAUSA_MASSIMA_MIN);
  });

  it('regge input non numerici senza esplodere', () => {
    expect(arrotondaPausaMin(Number.NaN)).toBe(0);
    expect(arrotondaPausaMin(Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe('pausaArrotondata', () => {
  it('lo dice solo quando il numero e cambiato davvero', () => {
    expect(pausaArrotondata(32)).toBe(true);
    expect(pausaArrotondata(30)).toBe(false);
    expect(pausaArrotondata(45)).toBe(false);
  });

  it('su zero non avvisa: non c e niente da arrotondare', () => {
    expect(pausaArrotondata(0)).toBe(false);
  });
});

describe('etichettaPausa', () => {
  it('legge le durate come le direbbe una persona', () => {
    expect(etichettaPausa(0)).toBe('Nessuna');
    expect(etichettaPausa(45)).toBe('45 min');
    expect(etichettaPausa(60)).toBe('1 h');
    expect(etichettaPausa(90)).toBe('1 h 30 min');
  });
});
