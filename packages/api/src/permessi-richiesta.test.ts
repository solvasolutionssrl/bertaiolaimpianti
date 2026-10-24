import { describe, expect, it } from 'vitest';
import { addOre, controllaRichiesta, fmtQuantita, giorniFra, minutiFra, testoDurata } from './permessi-richiesta';

describe('richiesta di permesso: conti', () => {
  it('addOre resta nel giorno', () => {
    expect(addOre('08:00', 4)).toBe('12:00');
    expect(addOre('08:30', 1.5)).toBe('10:00');
    expect(addOre('22:00', 4)).toBe('23:59');
  });
  it('minuti e durata leggibile', () => {
    expect(minutiFra('08:00', '12:30')).toBe(270);
    expect(testoDurata(270)).toBe('4 ore e 30 min');
    expect(testoDurata(60)).toBe('1 ora');
    expect(testoDurata(45)).toBe('45 min');
  });
  it('giorni estremi compresi', () => {
    expect(giorniFra('2026-10-24', '2026-10-24')).toBe(1);
    expect(giorniFra('2026-10-24', '2026-10-26')).toBe(3);
    expect(giorniFra('2026-10-26', '2026-10-24')).toBe(0);
  });
  it('quantità', () => {
    expect(fmtQuantita({ dataInizio: '2026-10-24', dataFine: '2026-10-26', tuttoIlGiorno: true, oraInizio: null, oraFine: null })).toBe('3 giorni');
    expect(fmtQuantita({ dataInizio: '2026-10-24', dataFine: '2026-10-24', tuttoIlGiorno: false, oraInizio: '08:00', oraFine: '12:00' })).toBe('4 ore');
  });
  it('controlli prima di inviare', () => {
    const base = { tipo: 'ferie', aOre: false, dataInizio: '2026-10-24', dataFine: '2026-10-23', oraInizio: '', oraFine: '' };
    expect(controllaRichiesta(base)).toMatch(/ultimo giorno/);
    expect(controllaRichiesta({ ...base, dataFine: '2026-10-25' })).toBeNull();
    expect(controllaRichiesta({ ...base, aOre: true, oraInizio: '12:00', oraFine: '08:00' })).toMatch(/fine/);
    expect(controllaRichiesta({ ...base, aOre: true, oraInizio: '08:00', oraFine: '12:00' })).toBeNull();
  });
});
