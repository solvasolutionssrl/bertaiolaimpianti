import { describe, expect, it } from 'vitest';
import { indiceDopoRiordino, latoRilascioInserimento, latoRilascioRiordino } from './trascina-riordino';

describe('latoRilascioRiordino', () => {
  it('⭐ scendendo la card finisce SOTTO la riga puntata', () => {
    expect(latoRilascioRiordino(0, 3)).toBe('sotto');
    expect(latoRilascioRiordino(1, 2)).toBe('sotto');
  });

  it('⭐ salendo finisce SOPRA: è la parte che si inverte senza accorgersene', () => {
    expect(latoRilascioRiordino(3, 0)).toBe('sopra');
    expect(latoRilascioRiordino(2, 1)).toBe('sopra');
  });

  it('sulla propria riga non si disegna niente', () => {
    expect(latoRilascioRiordino(2, 2)).toBe(null);
  });

  it('non inventa un lato su un indice che non è un numero intero', () => {
    expect(latoRilascioRiordino(1, Number.NaN)).toBe(null);
  });
});

describe('latoRilascioInserimento', () => {
  it('la pausa segue la metà della riga in cui sta il puntatore', () => {
    expect(latoRilascioInserimento(true)).toBe('sotto');
    expect(latoRilascioInserimento(false)).toBe('sopra');
  });
});

describe('indiceDopoRiordino', () => {
  it('dice dove è finita la card, per poterla accendere un attimo', () => {
    expect(indiceDopoRiordino(4, 0, 2)).toBe(2);
  });
  it('non esce dalla lista', () => {
    expect(indiceDopoRiordino(3, 0, 9)).toBe(2);
    expect(indiceDopoRiordino(3, 2, -4)).toBe(0);
    expect(indiceDopoRiordino(0, 0, 1)).toBe(0);
  });
});
