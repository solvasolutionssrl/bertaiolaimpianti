import { describe, it, expect } from 'vitest';
import { isModuleActive, MODULE_CODES } from './modules';

describe('isModuleActive', () => {
  it('base è sempre attivo, anche senza righe', () => {
    expect(isModuleActive([], 'base')).toBe(true);
  });

  it('kantiere è inattivo se non esiste alcuna riga', () => {
    expect(isModuleActive([], 'kantiere')).toBe(false);
  });

  it('kantiere è attivo se esiste una riga attiva', () => {
    expect(
      isModuleActive([{ module_code: 'kantiere', attivo: true }], 'kantiere'),
    ).toBe(true);
  });

  it('kantiere è inattivo se la riga esiste ma attivo=false', () => {
    expect(
      isModuleActive([{ module_code: 'kantiere', attivo: false }], 'kantiere'),
    ).toBe(false);
  });

  it('ignora righe di altri moduli', () => {
    expect(
      isModuleActive([{ module_code: 'altro', attivo: true }], 'kantiere'),
    ).toBe(false);
  });

  it('MODULE_CODES contiene base e kantiere', () => {
    expect(MODULE_CODES).toEqual(['base', 'kantiere']);
  });
});
