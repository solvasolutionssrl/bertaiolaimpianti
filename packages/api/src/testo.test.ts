import { describe, expect, it } from 'vitest';

import { tagliaAParolaIntera, testoPerFiltroOr } from './testo';

describe('tagliaAParolaIntera', () => {
  it('lascia stare un testo che ci sta già', () => {
    expect(tagliaAParolaIntera('Sostituzione caldaia', 60)).toBe('Sostituzione caldaia');
  });

  it('taglia alla parola, non al carattere', () => {
    const fuori = tagliaAParolaIntera(
      'Sostituzione caldaia e rifacimento impianto bagno piano primo',
      40,
    );
    expect(fuori).toBe('Sostituzione caldaia e rifacimento');
    expect(fuori.length).toBeLessThanOrEqual(40);
    // Il taglio secco avrebbe lasciato «…rifacimento impiant».
    expect(fuori.endsWith('impiant')).toBe(false);
  });

  it('se la prima parola non ci sta, taglia lei invece di tornare vuoto', () => {
    // ⚠️ Tornare '' qui svuoterebbe un campo obbligatorio e bloccherebbe chi
    // sta creando la commessa: meglio una parola mozza che un modulo rotto.
    const fuori = tagliaAParolaIntera('Supercalifragilistichespiralidoso', 10);
    expect(fuori).toHaveLength(10);
    expect(fuori).toBe('Supercalif');
  });

  it('compatta gli spazi prima di misurare', () => {
    expect(tagliaAParolaIntera('  Impianto    gas   ', 60)).toBe('Impianto gas');
  });

  it('con un limite a zero o negativo torna vuoto invece di esplodere', () => {
    expect(tagliaAParolaIntera('qualcosa', 0)).toBe('');
    expect(tagliaAParolaIntera('qualcosa', -5)).toBe('');
  });

  it('regge il testo vuoto', () => {
    expect(tagliaAParolaIntera('', 60)).toBe('');
    expect(tagliaAParolaIntera('    ', 60)).toBe('');
  });

  it('non allunga mai il testo', () => {
    for (const max of [1, 5, 12, 40, 60]) {
      expect(tagliaAParolaIntera('Pavimento radiante e centrale termica', max).length)
        .toBeLessThanOrEqual(max);
    }
  });
});

describe('testoPerFiltroOr', () => {
  it('toglie la virgola, che spezzerebbe il filtro in quattro pezzi', () => {
    expect(testoPerFiltroOr('Rossi, via Verdi')).toBe('Rossi via Verdi');
  });

  it('toglie anche parentesi, virgolette, barra rovescia e jolly', () => {
    expect(testoPerFiltroOr('bagno (piano 1)')).toBe('bagno piano 1');
    expect(testoPerFiltroOr('ro"ssi')).toBe('ro ssi');
    expect(testoPerFiltroOr('a\\b')).toBe('a b');
    expect(testoPerFiltroOr('*')).toBe('');
  });

  it('non tocca accenti e apostrofi, che in una ricerca servono', () => {
    expect(testoPerFiltroOr("dell'orto città")).toBe("dell'orto città");
  });

  it('regge il vuoto e il niente', () => {
    expect(testoPerFiltroOr('')).toBe('');
    expect(testoPerFiltroOr(null)).toBe('');
    expect(testoPerFiltroOr(undefined)).toBe('');
  });
});
