import { describe, it, expect } from 'vitest';
import { etichettaAccesso, prossimoCodiceDipendente } from './kantiere';

describe('etichettaAccesso', () => {
  it('Con accesso se ha user_id', () => {
    expect(etichettaAccesso({ user_id: 'u1' })).toBe('Con accesso');
  });
  it('Solo timbratura se user_id null/undefined', () => {
    expect(etichettaAccesso({ user_id: null })).toBe('Solo timbratura');
    expect(etichettaAccesso({ user_id: undefined })).toBe('Solo timbratura');
  });
});

describe('prossimoCodiceDipendente', () => {
  it('DIP-001 se nessun codice', () => {
    expect(prossimoCodiceDipendente([])).toBe('DIP-001');
  });
  it('incrementa dal massimo', () => {
    expect(prossimoCodiceDipendente(['DIP-001'])).toBe('DIP-002');
    expect(prossimoCodiceDipendente(['DIP-001', 'DIP-005', 'DIP-003'])).toBe('DIP-006');
  });
  it('ignora null/undefined e formati non DIP', () => {
    expect(prossimoCodiceDipendente([null, undefined, 'ABC', 'DIP-x', 'DIP-002'])).toBe('DIP-003');
  });
});
