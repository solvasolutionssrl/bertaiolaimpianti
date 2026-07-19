import { describe, it, expect } from 'vitest';
import {
  risolviFascia,
  normalizzaOra,
  minutiDa,
  intervalliSovrapposti,
  rilevaConflitti,
  sovrapposizioniPerCandidato,
  addGiorni,
  lunediDellaSettimana,
  giorniSettimana,
  settimanaISO,
  slugPianificazione,
  type VoceOccupazione,
} from './pianificazione';

describe('risolviFascia', () => {
  it('preset danno orari fissi', () => {
    expect(risolviFascia('giornata')).toEqual({ inizio: '08:00', fine: '17:00' });
    expect(risolviFascia('mattina')).toEqual({ inizio: '08:00', fine: '12:00' });
    expect(risolviFascia('pomeriggio')).toEqual({ inizio: '13:00', fine: '17:00' });
  });
  it('custom usa gli orari passati', () => {
    expect(risolviFascia('custom', { inizio: '09:30', fine: '15:45' })).toEqual({
      inizio: '09:30',
      fine: '15:45',
    });
  });
  it('custom senza orari usa i default', () => {
    expect(risolviFascia('custom')).toEqual({ inizio: '08:00', fine: '17:00' });
  });
});

describe('normalizzaOra', () => {
  it('normalizza HH:MM e HH:MM:SS', () => {
    expect(normalizzaOra('8:5')).toBe(null); // minuti a 1 cifra non validi
    expect(normalizzaOra('08:05')).toBe('08:05');
    expect(normalizzaOra('8:05')).toBe('08:05');
    expect(normalizzaOra('13:00:00')).toBe('13:00');
  });
  it('rifiuta valori fuori range o vuoti', () => {
    expect(normalizzaOra('25:00')).toBe(null);
    expect(normalizzaOra('10:99')).toBe(null);
    expect(normalizzaOra('')).toBe(null);
    expect(normalizzaOra(null)).toBe(null);
  });
});

describe('minutiDa', () => {
  it('converte in minuti dalla mezzanotte', () => {
    expect(minutiDa('00:00')).toBe(0);
    expect(minutiDa('08:00')).toBe(480);
    expect(minutiDa('13:30')).toBe(810);
  });
});

describe('intervalliSovrapposti', () => {
  it('sovrapposti veri', () => {
    expect(intervalliSovrapposti('08:00', '12:00', '11:00', '15:00')).toBe(true);
    expect(intervalliSovrapposti('08:00', '17:00', '13:00', '14:00')).toBe(true);
  });
  it('adiacenti al confine NON confliggono (half-open)', () => {
    expect(intervalliSovrapposti('08:00', '12:00', '12:00', '17:00')).toBe(false);
  });
  it('disgiunti non confliggono', () => {
    expect(intervalliSovrapposti('08:00', '10:00', '13:00', '17:00')).toBe(false);
  });
});

describe('rilevaConflitti', () => {
  const v = (
    entita: string,
    data: string,
    inizio: string,
    fine: string,
    refId: string,
  ): VoceOccupazione => ({ entita, data, inizio, fine, refId });

  it('stessa persona, stesso giorno, orari sovrapposti → 1 conflitto', () => {
    const c = rilevaConflitti([
      v('dip1', '2026-07-13', '08:00', '12:00', 'b1'),
      v('dip1', '2026-07-13', '11:00', '17:00', 'b2'),
    ]);
    expect(c).toHaveLength(1);
    expect(new Set([c[0]!.a, c[0]!.b])).toEqual(new Set(['b1', 'b2']));
  });

  it('stessa persona giorni diversi → nessun conflitto', () => {
    expect(
      rilevaConflitti([
        v('dip1', '2026-07-13', '08:00', '17:00', 'b1'),
        v('dip1', '2026-07-14', '08:00', '17:00', 'b2'),
      ]),
    ).toHaveLength(0);
  });

  it('persone diverse stesso giorno stessi orari → nessun conflitto', () => {
    expect(
      rilevaConflitti([
        v('dip1', '2026-07-13', '08:00', '17:00', 'b1'),
        v('dip2', '2026-07-13', '08:00', '17:00', 'b1'),
      ]),
    ).toHaveLength(0);
  });

  it('mattina + pomeriggio adiacenti → nessun conflitto', () => {
    expect(
      rilevaConflitti([
        v('dip1', '2026-07-13', '08:00', '12:00', 'b1'),
        v('dip1', '2026-07-13', '13:00', '17:00', 'b2'),
      ]),
    ).toHaveLength(0);
  });

  it('stesso refId non conflitta con se stesso', () => {
    expect(
      rilevaConflitti([
        v('dip1', '2026-07-13', '08:00', '17:00', 'b1'),
        v('dip1', '2026-07-13', '08:00', '17:00', 'b1'),
      ]),
    ).toHaveLength(0);
  });

  it('mezzo doppio-prenotato → conflitto', () => {
    const c = rilevaConflitti([
      v('mezzoA', '2026-07-13', '08:00', '12:00', 'b1'),
      v('mezzoA', '2026-07-13', '10:00', '17:00', 'b2'),
    ]);
    expect(c).toHaveLength(1);
  });
});

describe('sovrapposizioniPerCandidato', () => {
  const esistenti: VoceOccupazione[] = [
    { entita: 'dip1', data: '2026-07-13', inizio: '08:00', fine: '12:00', refId: 'b1' },
    { entita: 'dip1', data: '2026-07-13', inizio: '14:00', fine: '17:00', refId: 'b2' },
    { entita: 'dip2', data: '2026-07-13', inizio: '08:00', fine: '17:00', refId: 'b3' },
  ];
  it('trova solo le voci della stessa persona che si sovrappongono', () => {
    const r = sovrapposizioniPerCandidato(
      { entita: 'dip1', data: '2026-07-13', inizio: '11:00', fine: '15:00' },
      esistenti,
    );
    expect(r.map((x) => x.refId).sort()).toEqual(['b1', 'b2']);
  });
  it('esclude il proprio refId (modifica)', () => {
    const r = sovrapposizioniPerCandidato(
      { entita: 'dip1', data: '2026-07-13', inizio: '08:00', fine: '12:00', refId: 'b1' },
      esistenti,
    );
    expect(r).toHaveLength(0);
  });
  it('candidato in slot libero → nessuna sovrapposizione', () => {
    const r = sovrapposizioniPerCandidato(
      { entita: 'dip1', data: '2026-07-13', inizio: '12:00', fine: '14:00' },
      esistenti,
    );
    expect(r).toHaveLength(0);
  });
});

describe('matematica settimana', () => {
  it('addGiorni gestisce il cambio mese e anno', () => {
    expect(addGiorni('2026-07-13', 1)).toBe('2026-07-14');
    expect(addGiorni('2026-07-31', 1)).toBe('2026-08-01');
    expect(addGiorni('2026-01-01', -1)).toBe('2025-12-31');
  });
  it('lunediDellaSettimana torna il lunedì', () => {
    // 2026-07-13 è un lunedì; 2026-07-15 mercoledì; 2026-07-19 domenica
    expect(lunediDellaSettimana('2026-07-13')).toBe('2026-07-13');
    expect(lunediDellaSettimana('2026-07-15')).toBe('2026-07-13');
    expect(lunediDellaSettimana('2026-07-19')).toBe('2026-07-13');
  });
  it('giorniSettimana torna 7 giorni lun→dom', () => {
    const g = giorniSettimana('2026-07-13');
    expect(g).toHaveLength(7);
    expect(g[0]).toBe('2026-07-13');
    expect(g[6]).toBe('2026-07-19');
  });
});

describe('settimanaISO', () => {
  it('settimana ordinaria', () => {
    expect(settimanaISO('2026-07-20')).toEqual({ anno: 2026, settimana: 30 });
  });
  it('primo gennaio (giovedì) è settimana 1', () => {
    expect(settimanaISO('2026-01-01')).toEqual({ anno: 2026, settimana: 1 });
  });
  it('fine dicembre appartiene alla settimana ISO dell’anno seguente', () => {
    // Lun 29/12/2025 → giovedì 01/01/2026 → settimana 1 del 2026
    expect(settimanaISO('2025-12-29')).toEqual({ anno: 2026, settimana: 1 });
  });
  it('anno con 53 settimane', () => {
    expect(settimanaISO('2026-12-31')).toEqual({ anno: 2026, settimana: 53 });
  });
  it('coerente lungo tutta la settimana (lun e dom danno lo stesso numero)', () => {
    expect(settimanaISO('2026-07-20').settimana).toBe(settimanaISO('2026-07-26').settimana);
  });
});

describe('slugPianificazione', () => {
  it('minuscolo semplice', () => {
    expect(slugPianificazione('Officina')).toBe('officina');
  });
  it('non-alfanumerici collassano in underscore singolo', () => {
    expect(slugPianificazione('Cantiere & Manutenzione')).toBe('cantiere_manutenzione');
  });
  it('toglie gli accenti', () => {
    expect(slugPianificazione('Città Est')).toBe('citta_est');
  });
  it('stringa vuota o solo simboli → gruppo', () => {
    expect(slugPianificazione('   ')).toBe('gruppo');
    expect(slugPianificazione('—/—')).toBe('gruppo');
  });
});
