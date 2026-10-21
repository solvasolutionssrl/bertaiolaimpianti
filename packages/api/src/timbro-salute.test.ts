import { describe, expect, it } from 'vitest';

import { GIRO_FERMO_MIN, valutaTimbro, type FotoTimbro } from './timbro-salute';

const ADESSO = Date.UTC(2026, 9, 22, 10, 0);
const min = (n: number) => new Date(ADESSO - n * 60_000).toISOString();
const base: FotoTimbro = {
  stato: 'attivo',
  conToken: true,
  dal: '2026-10-22',
  ultimoGiroAt: min(1),
  ultimoGiroEsito: 'ok',
  ultimoGiroMessaggio: null,
  ultimoTimbroAt: min(30),
  orfani: 0,
  senzaOra: 0,
};

describe('valutaTimbro', () => {
  it('spento o senza token: mai partito, non guasto', () => {
    expect(valutaTimbro({ ...base, stato: 'spento' }, ADESSO).stato).toBe('mai_visto');
    expect(valutaTimbro({ ...base, conToken: false }, ADESSO).stato).toBe('mai_visto');
  });
  it('tutto a posto: regolare', () => {
    expect(valutaTimbro(base, ADESSO)).toEqual({ stato: 'ok', motivi: ['Legge ogni due minuti, e i timbri arrivano.'] });
  });
  it('il cron che non gira e’ un guasto nostro', () => {
    const d = valutaTimbro({ ...base, ultimoGiroAt: min(GIRO_FERMO_MIN + 1) }, ADESSO);
    expect(d.stato).toBe('guasto');
    expect(d.motivi[0]).toContain('cron');
  });
  it('l’ultimo giro in errore e’ un guasto', () => {
    expect(valutaTimbro({ ...base, ultimoGiroEsito: 'errore', ultimoGiroMessaggio: 'unauthorized' }, ADESSO).stato).toBe('guasto');
  });
  it('nessun timbro da due giorni e’ da guardare, non in avaria', () => {
    expect(valutaTimbro({ ...base, ultimoTimbroAt: min(49 * 60) }, ADESSO).stato).toBe('attenzione');
  });
  it('i badge non assegnati si segnalano', () => {
    const d = valutaTimbro({ ...base, orfani: 3 }, ADESSO);
    expect(d.stato).toBe('attenzione');
    expect(d.motivi.join(' ')).toContain('3 timbri senza persona');
  });
});
