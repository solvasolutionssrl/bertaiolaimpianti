import { describe, it, expect } from 'vitest';

import {
  meritaAvviso,
  valutaCollegamento,
  type FotoCollegamento,
} from './integrazione-salute';

const ADESSO = new Date('2026-08-12T12:00:00Z').getTime();
const oreFa = (n: number) => new Date(ADESSO - n * 3_600_000).toISOString();

function foto(patch: Partial<FotoCollegamento> = {}): FotoCollegamento {
  return {
    tenantId: 't',
    tenant: 'Cliente',
    sistema: 'ergo',
    modalita: 'attiva',
    ultimaAttivita: oreFa(1),
    scrittureOk: 5,
    scrittureErrore: 0,
    ultimoErrore: null,
    ultimoOk: oreFa(1),
    ritardoAckMin: 2,
    giriAperti: 0,
    nonCollegati: 0,
    sogliaSilenzioOre: 24,
    ...patch,
  };
}

describe('valutaCollegamento', () => {
  it('collegamento vivo e senza errori = ok', () => {
    const d = valutaCollegamento(foto(), ADESSO);
    expect(d.stato).toBe('ok');
    expect(d.silenzioOre).toBe(1);
  });

  it('mai visto se non si è mai fatto vivo', () => {
    const d = valutaCollegamento(foto({ ultimaAttivita: null }), ADESSO);
    expect(d.stato).toBe('mai_visto');
    expect(d.silenzioOre).toBeNull();
  });

  it('distingue "gestionale non scelto" da "agente mai partito"', () => {
    expect(
      valutaCollegamento(foto({ ultimaAttivita: null, sistema: null }), ADESSO).motivi[0],
    ).toMatch(/non ancora scelto/);
    expect(
      valutaCollegamento(foto({ ultimaAttivita: null }), ADESSO).motivi[0],
    ).toMatch(/mai chiamato/);
  });

  it('silenzio oltre soglia = attenzione, oltre il doppio = guasto', () => {
    expect(valutaCollegamento(foto({ ultimaAttivita: oreFa(25) }), ADESSO).stato).toBe(
      'attenzione',
    );
    expect(valutaCollegamento(foto({ ultimaAttivita: oreFa(49) }), ADESSO).stato).toBe(
      'guasto',
    );
  });

  it('la soglia è per-tenant, non una costante', () => {
    const stretta = foto({ ultimaAttivita: oreFa(3), sogliaSilenzioOre: 2 });
    expect(valutaCollegamento(stretta, ADESSO).stato).toBe('attenzione');
    const larga = foto({ ultimaAttivita: oreFa(3), sogliaSilenzioOre: 72 });
    expect(valutaCollegamento(larga, ADESSO).stato).toBe('ok');
  });

  it('soglia a zero o negativa ricade sul default invece di far scattare tutto', () => {
    const d = valutaCollegamento(foto({ ultimaAttivita: oreFa(3), sogliaSilenzioOre: 0 }), ADESSO);
    expect(d.stato).toBe('ok');
  });

  it('errore come ultimo evento = guasto', () => {
    const d = valutaCollegamento(
      foto({ scrittureErrore: 3, ultimoErrore: oreFa(1), ultimoOk: oreFa(5) }),
      ADESSO,
    );
    expect(d.stato).toBe('guasto');
    expect(d.motivi.join(' ')).toMatch(/nessuna riuscita dopo/);
  });

  it('errore seguito da un successo è solo attenzione: ha ripreso', () => {
    const d = valutaCollegamento(
      foto({ scrittureErrore: 3, ultimoErrore: oreFa(5), ultimoOk: oreFa(1) }),
      ADESSO,
    );
    expect(d.stato).toBe('attenzione');
    expect(d.motivi.join(' ')).toMatch(/poi ha ripreso/);
  });

  it('giri aperti e ritardo ACK alto alzano ad attenzione', () => {
    expect(valutaCollegamento(foto({ giriAperti: 2 }), ADESSO).stato).toBe('attenzione');
    expect(valutaCollegamento(foto({ ritardoAckMin: 180 }), ADESSO).stato).toBe('attenzione');
  });

  it('un ritardo ACK normale non allarma', () => {
    expect(valutaCollegamento(foto({ ritardoAckMin: 30 }), ADESSO).stato).toBe('ok');
  });

  it('anagrafiche non collegate sono visibili anche se il canale è vivo', () => {
    const d = valutaCollegamento(foto({ nonCollegati: 190 }), ADESSO);
    expect(d.stato).toBe('attenzione');
    expect(d.motivi.join(' ')).toMatch(/190 anagrafiche/);
  });

  it('lo stato è il peggiore, non l’ultimo controllo eseguito', () => {
    const d = valutaCollegamento(
      foto({
        ultimaAttivita: oreFa(72),
        scrittureErrore: 1,
        ultimoErrore: oreFa(80),
        ultimoOk: oreFa(73),
        nonCollegati: 4,
      }),
      ADESSO,
    );
    expect(d.stato).toBe('guasto');
    expect(d.motivi.length).toBeGreaterThan(1);
  });

  it('quando va tutto bene dice comunque qualcosa', () => {
    expect(valutaCollegamento(foto(), ADESSO).motivi[0]).toMatch(/5 scritture riuscite/);
    expect(valutaCollegamento(foto({ scrittureOk: 0 }), ADESSO).motivi[0]).toMatch(
      /nessuna scrittura/,
    );
  });
});

describe('meritaAvviso', () => {
  it('avvisa solo sui guasti in modalità attiva', () => {
    const rotto = foto({ ultimaAttivita: oreFa(72) });
    const d = valutaCollegamento(rotto, ADESSO);
    expect(meritaAvviso(rotto, d)).toBe(true);
  });

  it('in simulazione non avvisa: un agente in scrittura si ferma di continuo', () => {
    const rotto = foto({ ultimaAttivita: oreFa(72), modalita: 'simulazione' });
    expect(meritaAvviso(rotto, valutaCollegamento(rotto, ADESSO))).toBe(false);
  });

  it('attenzione non basta a mandare una mail', () => {
    const f = foto({ giriAperti: 1 });
    expect(meritaAvviso(f, valutaCollegamento(f, ADESSO))).toBe(false);
  });
});
