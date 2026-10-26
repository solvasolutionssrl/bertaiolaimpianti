import { describe, expect, it } from 'vitest';
import { decidiFase, messaggioFaseRichiesta, MESSAGGIO_FASE_RICHIESTA_SPESA } from './sottocantieri';

const f = (id: string, stato: string | null = 'attivo') => ({ id, stato, nome: id, codice: id });

describe('decidiFase', () => {
  it('nessuna fase: non si chiede niente', () => {
    expect(decidiFase([], { obbligatoria: true })).toEqual({ modo: 'nessuna' });
    expect(decidiFase(null)).toEqual({ modo: 'nessuna' });
  });

  it('⭐ una fase sola e obbligatoria: si prende quella, senza chiedere', () => {
    const d = decidiFase([f('a')], { obbligatoria: true });
    expect(d.modo).toBe('automatica');
    expect(d.modo === 'automatica' && d.fase.id).toBe('a');
  });

  it('⭐ più di una: la scelta è obbligatoria', () => {
    const d = decidiFase([f('a'), f('b')], { obbligatoria: true });
    expect(d).toEqual({ modo: 'chiedi', fasi: [f('a'), f('b')], obbligatoria: true });
  });

  it('⚠️ senza il flag del cliente non si prende niente da soli, nemmeno con una sola', () => {
    const d = decidiFase([f('a')], { obbligatoria: false });
    expect(d.modo).toBe('chiedi');
    expect(d.modo === 'chiedi' && d.obbligatoria).toBe(false);
  });

  it('le fasi chiuse non contano', () => {
    expect(decidiFase([f('a', 'chiusa'), f('b')], { obbligatoria: true }).modo).toBe('automatica');
    expect(decidiFase([f('a', 'chiusa')], { obbligatoria: true })).toEqual({ modo: 'nessuna' });
  });
});

describe('messaggioFaseRichiesta', () => {
  it('nomina il cantiere invece di dire «questo»', () => {
    expect(messaggioFaseRichiesta(['Fincantieri'])).toBe(
      'Il cantiere Fincantieri ha delle fasi: indica su quale hai lavorato.',
    );
  });
  it('con più cantieri li elenca tutti', () => {
    expect(messaggioFaseRichiesta(['Fincantieri', 'Elettra'])).toContain('Fincantieri, Elettra');
  });
  it('senza nomi resta la frase generica', () => {
    expect(messaggioFaseRichiesta([])).toBe('Questo cantiere ha delle fasi: indica su quale hai lavorato.');
  });
  it('⚠️ su una spesa cambia il verbo: non si è «lavorato» su uno scontrino', () => {
    expect(messaggioFaseRichiesta(['Elettra'], MESSAGGIO_FASE_RICHIESTA_SPESA)).toBe(
      'Il cantiere Elettra ha delle fasi: indica a quale va questa spesa.',
    );
  });
});
