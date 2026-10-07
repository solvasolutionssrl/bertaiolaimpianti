import { describe, expect, it } from 'vitest';

import { indirizzoDopoScelta, cittaDopoScelta } from './indirizzo-scelto';

describe('indirizzoDopoScelta', () => {
  it('⭐ un suggerimento SENZA via non cancella la via scritta a mano', () => {
    // Il caso vero: OpenStreetMap non conosce quella strada e propone il paese.
    expect(
      indirizzoDopoScelta({
        scritto: 'Via Roma 12 Valeggio',
        etichetta: 'Valeggio sul Mincio, Verona, Veneto, Italia',
      }),
    ).toBe('Via Roma 12 Valeggio');
  });

  it('un suggerimento CON via vince: è la forma normalizzata', () => {
    expect(
      indirizzoDopoScelta({
        scritto: 'via roma 12 valeggio',
        etichetta: 'Via Roma, 27034, Valeggio, Lombardia, Italia',
        via: 'Via Roma',
      }),
    ).toBe('Via Roma, 27034, Valeggio, Lombardia, Italia');
  });

  it('campo vuoto: meglio il paese che niente', () => {
    expect(
      indirizzoDopoScelta({ scritto: '', etichetta: 'Valeggio sul Mincio, Italia' }),
    ).toBe('Valeggio sul Mincio, Italia');
  });

  it('campo con soli spazi conta come vuoto', () => {
    expect(
      indirizzoDopoScelta({ scritto: '   ', etichetta: 'Sona, Verona' }),
    ).toBe('Sona, Verona');
  });

  it('via dichiarata ma etichetta vuota: non si svuota il campo', () => {
    expect(
      indirizzoDopoScelta({ scritto: 'Via Verdi 3', etichetta: '', via: 'Via Verdi' }),
    ).toBe('Via Verdi 3');
  });

  it('via a stringa vuota vale come assente', () => {
    expect(
      indirizzoDopoScelta({ scritto: 'Via Verdi 3', etichetta: 'Sona', via: '' }),
    ).toBe('Via Verdi 3');
  });

  it('⚠️ non restituisce mai qualcosa di meno preciso di ciò che era scritto', () => {
    const scritto = 'Via Giuseppe Garibaldi 5';
    for (const via of [undefined, null, '']) {
      expect(indirizzoDopoScelta({ scritto, etichetta: 'Verona', via })).toBe(scritto);
    }
  });
});

describe('cittaDopoScelta', () => {
  it('una città scritta a mano non si sovrascrive mai', () => {
    expect(cittaDopoScelta({ scritta: 'Valeggio', dalProvider: 'Verona' })).toBe('Valeggio');
  });

  it('se il campo è vuoto si prende quella del provider', () => {
    expect(cittaDopoScelta({ scritta: '', dalProvider: 'Valeggio' })).toBe('Valeggio');
  });

  it('se non la sa nessuno resta vuota', () => {
    expect(cittaDopoScelta({ scritta: '', dalProvider: null })).toBe('');
  });
});
