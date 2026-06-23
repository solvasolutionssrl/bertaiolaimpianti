import { describe, it, expect } from 'vitest';
import { etichettaAccesso, prossimoCodiceDipendente, puoTimbrarePer, prossimoCodiceCantiere, targetTimbratura } from './kantiere';

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

describe('puoTimbrarePer', () => {
  it('sé stesso sempre', () =>
    expect(puoTimbrarePer({ self: true, capoSquadra: false, bersaglioInSquadra: false })).toBe(true));
  it('capo per membro della sua squadra', () =>
    expect(puoTimbrarePer({ self: false, capoSquadra: true, bersaglioInSquadra: true })).toBe(true));
  it('capo per chi è fuori squadra → no', () =>
    expect(puoTimbrarePer({ self: false, capoSquadra: true, bersaglioInSquadra: false })).toBe(false));
  it('estraneo → no', () =>
    expect(puoTimbrarePer({ self: false, capoSquadra: false, bersaglioInSquadra: true })).toBe(false));
});

describe('prossimoCodiceCantiere', () => {
  it('primo codice CAN-00001 su lista vuota', () => {
    expect(prossimoCodiceCantiere([])).toBe('CAN-00001');
  });
  it('incrementa il massimo esistente', () => {
    expect(prossimoCodiceCantiere(['CAN-00001', 'CAN-00007', 'CAN-00003'])).toBe('CAN-00008');
  });
  it('ignora i codici non conformi e i null', () => {
    expect(prossimoCodiceCantiere([null, 'X', 'CAN-00002', undefined, 'DIP-009'])).toBe('CAN-00003');
  });
  it('conta sia il vecchio formato a 3 cifre sia il nuovo a 5', () => {
    expect(prossimoCodiceCantiere(['CAN-002'])).toBe('CAN-00003');
  });
});

describe('targetTimbratura', () => {
  it('cantiere quando cantiere_id valorizzato', () => {
    expect(targetTimbratura({ commessa_id: null, cantiere_id: 'K1' })).toEqual({ tipo: 'cantiere', id: 'K1' });
  });
  it('commessa quando solo commessa_id', () => {
    expect(targetTimbratura({ commessa_id: 'C1', cantiere_id: null })).toEqual({ tipo: 'commessa', id: 'C1' });
  });
  it('null quando nessuno', () => {
    expect(targetTimbratura({ commessa_id: null, cantiere_id: null })).toBeNull();
  });
  it('preferisce cantiere se entrambi (difensivo)', () => {
    expect(targetTimbratura({ commessa_id: 'C1', cantiere_id: 'K1' })).toEqual({ tipo: 'cantiere', id: 'K1' });
  });
});
