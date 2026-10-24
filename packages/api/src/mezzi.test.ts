import { describe, expect, it } from 'vitest';
import { eAutoPersonale, etichettaMezzo, etichettaMezzoEstesa, ordinaMezzi } from './mezzi';

describe('auto personale fra i mezzi', () => {
  const auto = { id: 'p', targa: 'AUTO PERSONALE', modello: 'Auto personale', personale: true };
  const furgone = { id: 'f', targa: 'AB123CD', modello: 'Ducato' };

  it('si riconosce dalla colonna o dalla targa segnaposto', () => {
    expect(eAutoPersonale(auto)).toBe(true);
    expect(eAutoPersonale({ targa: 'auto personale' })).toBe(true);
    expect(eAutoPersonale(furgone)).toBe(false);
  });
  it('non grida: a schermo si legge «Auto personale»', () => {
    expect(etichettaMezzo(auto)).toBe('Auto personale');
    expect(etichettaMezzo(furgone)).toBe('AB123CD');
    expect(etichettaMezzoEstesa(auto)).toBe('Auto personale');
    expect(etichettaMezzoEstesa(furgone)).toBe('AB123CD · Ducato');
    expect(etichettaMezzoEstesa({ id: 'x', targa: 'XY999ZZ' })).toBe('XY999ZZ');
  });
  it('sta in fondo all\'elenco, i mezzi dell\'azienda prima e in ordine', () => {
    const out = ordinaMezzi([auto, { id: 'c', targa: 'ZZ999ZZ' }, furgone]);
    expect(out.map((m) => m.targa)).toEqual(['AB123CD', 'ZZ999ZZ', 'AUTO PERSONALE']);
  });
});
