import { describe, expect, it } from 'vitest';
import { formattaMargine, margineGiorno, margineMese, type GiornoMargine } from './margine-ore';

const g = (data: string, extra: Partial<GiornoMargine> = {}): GiornoMargine => ({
  data,
  minutiLavoro: 0,
  minutiViaggioOrdinari: 0,
  minutiViaggioEccedenti: 0,
  orarioMin: 480,
  minutiPermesso: 0,
  assenzaIntera: false,
  registrata: true,
  ...extra,
});

describe('margine ore', () => {
  it('nove ore oggi e sette domani fanno zero', () => {
    const m = margineMese([g('2026-10-26', { minutiLavoro: 540 }), g('2026-10-27', { minutiLavoro: 420 })]);
    expect(m.giorni.map((d) => d.margine)).toEqual([60, -60]);
    expect(m.margine).toBe(0);
  });

  it('il viaggio dentro l\'orario conta, quello oltre no', () => {
    const d = margineGiorno(g('2026-10-26', { minutiLavoro: 420, minutiViaggioOrdinari: 60, minutiViaggioEccedenti: 90 }));
    expect(d.margine).toBe(0);
    const m = margineMese([g('2026-10-26', { minutiLavoro: 420, minutiViaggioOrdinari: 60, minutiViaggioEccedenti: 90 })]);
    expect(m.minutiViaggioEccedenti).toBe(90);
  });

  it('un permesso a ore copre la sua parte', () => {
    expect(margineGiorno(g('2026-10-26', { minutiLavoro: 360, minutiPermesso: 120 })).margine).toBe(0);
  });

  it('il sabato e la domenica sono tutto in piu\'', () => {
    expect(margineGiorno(g('2026-10-24', { minutiLavoro: 240 }))).toMatchObject({ esito: 'extra', margine: 240 });
    expect(margineGiorno(g('2026-10-25', { registrata: false }))).toMatchObject({ esito: 'riposo', margine: 0 });
  });

  it('un festivo non ha orario teorico', () => {
    expect(margineGiorno(g('2026-11-02', { minutiLavoro: 0, registrata: false })).esito).toBe('vuoto');
    expect(margineGiorno(g('2026-11-01', { minutiLavoro: 300 })).margine).toBe(300);
  });

  it('una giornata intera di ferie non conta, nemmeno se ha ore', () => {
    expect(margineGiorno(g('2026-10-26', { assenzaIntera: true, minutiLavoro: 60 }))).toMatchObject({ esito: 'assente', margine: 0 });
  });

  it('un feriale vuoto non diventa «meno otto», ma si conta a parte', () => {
    const m = margineMese([g('2026-10-26', { registrata: false }), g('2026-10-27', { minutiLavoro: 480 })]);
    expect(m.margine).toBe(0);
    expect(m.giorniVuoti).toBe(1);
    expect(m.giorniLavorati).toBe(1);
  });

  it('una giornata registrata a zero ore e\' un giorno sotto, non un vuoto', () => {
    expect(margineGiorno(g('2026-10-26', { minutiLavoro: 0 }))).toMatchObject({ esito: 'lavorato', margine: -480 });
  });

  it('il segno si scrive sempre', () => {
    expect(formattaMargine(90)).toBe('+1:30');
    expect(formattaMargine(-45)).toBe('−0:45');
    expect(formattaMargine(0)).toBe('0:00');
  });
});
