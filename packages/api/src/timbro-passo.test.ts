import { describe, expect, it } from 'vitest';
import {
  etichettaPasso,
  faseDaSeguire,
  leggiPasso,
  passoDaAzione,
  statoNostroDa,
  passoDaTimbratura,
  daSpecchiare,
} from './timbro-passo';

describe('leggiPasso — la fase impone il verso', () => {
  it('le quattro fasi dicono verso e pausa', () => {
    const v = (step: string) => {
      const l = leggiPasso({ step, step_source: 'person' });
      return `${l.verso}${l.pausa ? '+pausa' : ''}`;
    };
    expect(v('start')).toBe('ingresso');
    expect(v('pause_start')).toBe('uscita+pausa');
    expect(v('pause_end')).toBe('ingresso+pausa');
    expect(v('end')).toBe('uscita');
  });

  it('⚠️ senza fase non si decide il verso: lo decide la nostra sequenza', () => {
    const l = leggiPasso({ step: null, step_source: null, shift_was_open: true });
    expect(l).toEqual({ passo: null, fiducia: 'nessuna', verso: null, pausa: false, contraddice: false });
  });

  it('una fase che non conosciamo non diventa una fase', () => {
    expect(leggiPasso({ step: 'lunch_break', step_source: 'person' }).passo).toBe(null);
  });
});

describe('leggiPasso — quanto fidarsi', () => {
  it('la persona e l’ufficio dichiarano; il terminale ipotizza; le nostre sono nostre', () => {
    expect(leggiPasso({ step: 'end', step_source: 'person' }).fiducia).toBe('dichiarata');
    expect(leggiPasso({ step: 'end', step_source: 'office' }).fiducia).toBe('dichiarata');
    expect(leggiPasso({ step: 'start', step_source: 'inferred' }).fiducia).toBe('ipotesi');
    expect(leggiPasso({ step: 'start', step_source: 'api' }).fiducia).toBe('nostra');
  });

  it('⚠️ un’origine sconosciuta NON si promuove a dichiarata', () => {
    // Se un domani Timbro aggiunge un valore, non deve diventare una verità
    // da noi solo perché non lo riconosciamo.
    expect(leggiPasso({ step: 'end', step_source: 'qualcosa_di_nuovo' }).fiducia).toBe('ipotesi');
    expect(faseDaSeguire(leggiPasso({ step: 'end', step_source: 'qualcosa_di_nuovo' }))).toBe(false);
  });

  it('si segue solo ciò che è dichiarato o nostro', () => {
    expect(faseDaSeguire(leggiPasso({ step: 'pause_start', step_source: 'person' }))).toBe(true);
    expect(faseDaSeguire(leggiPasso({ step: 'pause_start', step_source: 'inferred' }))).toBe(false);
    expect(faseDaSeguire(leggiPasso({ step: null, step_source: null }))).toBe(false);
  });
});

describe("leggiPasso — l'ipotesi del terminale contro la nostra sequenza", () => {
  it('⭐ «inizio giornata» dedotto mentre per noi il turno è APERTO: contraddice', () => {
    // È il caso descritto da Timbro: la persona ha aperto il turno dall'app e
    // il terminale non lo sapeva.
    expect(leggiPasso({ step: 'start', step_source: 'inferred' }, 'aperto').contraddice).toBe(true);
    expect(leggiPasso({ step: 'start', step_source: 'inferred' }, 'in_pausa').contraddice).toBe(true);
    expect(leggiPasso({ step: 'start', step_source: 'inferred' }, 'chiuso').contraddice).toBe(false);
  });

  it('«rientro dalla pausa» dedotto mentre per noi non si era in pausa: contraddice', () => {
    expect(leggiPasso({ step: 'pause_end', step_source: 'inferred' }, 'aperto').contraddice).toBe(true);
    expect(leggiPasso({ step: 'pause_end', step_source: 'inferred' }, 'in_pausa').contraddice).toBe(false);
  });

  it('una pausa o una fine dedotte a turno chiuso contraddicono', () => {
    expect(leggiPasso({ step: 'pause_start', step_source: 'inferred' }, 'chiuso').contraddice).toBe(true);
    expect(leggiPasso({ step: 'end', step_source: 'inferred' }, 'aperto').contraddice).toBe(false);
  });

  it('⚠️ ciò che la persona ha DICHIARATO non contraddice mai: si crede a lei', () => {
    expect(leggiPasso({ step: 'start', step_source: 'person' }, 'aperto').contraddice).toBe(false);
    expect(leggiPasso({ step: 'pause_end', step_source: 'office' }, 'chiuso').contraddice).toBe(false);
  });

  it('se non sappiamo il nostro stato non si contraddice niente', () => {
    expect(leggiPasso({ step: 'start', step_source: 'inferred' }, 'ignoto').contraddice).toBe(false);
    expect(leggiPasso({ step: 'start', step_source: 'inferred' }).contraddice).toBe(false);
  });
});

describe('passoDaAzione — i nostri quattro gesti combaciano uno a uno', () => {
  it('inizio/pausa/ripresa/fine → start/pause_start/pause_end/end', () => {
    expect(passoDaAzione('inizio')).toBe('start');
    expect(passoDaAzione('pausa')).toBe('pause_start');
    expect(passoDaAzione('ripresa')).toBe('pause_end');
    expect(passoDaAzione('fine')).toBe('end');
  });
  it('un gesto che non è una fase non ne inventa una', () => {
    expect(passoDaAzione('cambio_cantiere')).toBe(null);
    expect(passoDaAzione('')).toBe(null);
  });
});

describe('statoNostroDa', () => {
  it('legge il nostro stato dalla nostra ultima timbratura', () => {
    expect(statoNostroDa({ tipo: 'ingresso' })).toBe('aperto');
    expect(statoNostroDa({ tipo: 'uscita', pausa: true })).toBe('in_pausa');
    expect(statoNostroDa({ tipo: 'uscita', pausa: false })).toBe('chiuso');
    expect(statoNostroDa(null)).toBe('ignoto');
  });
});

describe('etichettaPasso', () => {
  it('ogni fase ha un nome a schermo, e il niente non ne ha uno', () => {
    expect(etichettaPasso('pause_start')).toBe('Inizio pausa');
    expect(etichettaPasso('end')).toBe('Fine giornata');
    expect(etichettaPasso(null)).toBe(null);
  });
});

describe('passoDaTimbratura', () => {
  it('le nostre quattro combinazioni danno le quattro fasi', () => {
    expect(passoDaTimbratura('ingresso', false)).toBe('start');
    expect(passoDaTimbratura('uscita', true)).toBe('pause_start');
    expect(passoDaTimbratura('ingresso', true)).toBe('pause_end');
    expect(passoDaTimbratura('uscita', false)).toBe('end');
  });
});

describe('daSpecchiare — cosa si manda a Timbro e cosa no', () => {
  const r = (tipo: 'ingresso' | 'uscita', pausa: boolean, origine: string, ts: string, dipendenteId = 'p1') =>
    ({ tipo, pausa, origine, ts, dipendenteId });

  it('un gesto solo si manda', () => {
    expect(daSpecchiare([r('uscita', true, 'cronometro', '2026-10-26T12:00:00Z')])).toHaveLength(1);
    expect(daSpecchiare([r('ingresso', false, 'qr', '2026-10-26T08:00:00Z')])).toHaveLength(1);
  });

  it('⚠️ di una giornata ricostruita si manda SOLO la fine turno', () => {
    const lotto = [
      r('ingresso', false, 'cronometro', '2026-10-26T08:00:00Z'),
      r('uscita', false, 'cronometro', '2026-10-26T12:00:00Z'),
      r('ingresso', false, 'cronometro', '2026-10-26T13:00:00Z'),
      r('uscita', false, 'cronometro', '2026-10-26T17:00:00Z'),
    ];
    const out = daSpecchiare(lotto);
    expect(out).toHaveLength(1);
    expect(out[0]!.ts).toBe('2026-10-26T17:00:00Z');
  });

  it('⚠️ le righe che vengono DA Timbro non tornano a Timbro', () => {
    expect(daSpecchiare([r('ingresso', false, 'timbro', '2026-10-26T08:00:00Z')])).toEqual([]);
  });

  it('le righe scritte a mano dall’ufficio non si specchiano', () => {
    expect(daSpecchiare([r('uscita', false, 'manuale', '2026-10-26T17:00:00Z')])).toEqual([]);
  });

  it('un cambio cantiere (uscita + ingresso) non dice a Timbro che il turno è finito', () => {
    const out = daSpecchiare([
      r('uscita', false, 'cronometro', '2026-10-26T14:00:00Z'),
      r('ingresso', false, 'cronometro', '2026-10-26T14:25:00Z'),
    ]);
    // L'uscita è l'ultima fine-turno del lotto: si manda quella e basta, mai
    // il riaperto. ⚠️ È il compromesso dichiarato: il terminale saprà che il
    // turno è chiuso finché non arriva un badge.
    expect(out).toHaveLength(1);
    expect(out[0]!.tipo).toBe('uscita');
  });

  it('con due persone nello stesso lotto, una fine turno ciascuna', () => {
    const out = daSpecchiare([
      r('uscita', false, 'capo', '2026-10-26T17:00:00Z', 'p1'),
      r('uscita', false, 'capo', '2026-10-26T17:05:00Z', 'p2'),
      r('ingresso', false, 'capo', '2026-10-26T08:00:00Z', 'p1'),
    ]);
    expect(out.map((x) => x.dipendenteId).sort()).toEqual(['p1', 'p2']);
  });
});
