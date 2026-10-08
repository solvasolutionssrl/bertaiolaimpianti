import { describe, expect, it } from 'vitest';

import {
  aCamelCase,
  anteprimaNomeCartella,
  componiNomeCartella,
  segmentoCliente,
  segmentoDescrizione,
  MAX_SEGMENTO,
} from './nome-cartella';

describe('aCamelCase — da frase umana a segmento di cartella', () => {
  it('attacca le parole alzando le iniziali', () => {
    expect(aCamelCase('Impianti meccanici casa legno')).toBe('ImpiantiMeccaniciCasaLegno');
    expect(aCamelCase('sostituzione caldaia')).toBe('SostituzioneCaldaia');
  });

  it('non rovina chi scrive gia in CamelCase', () => {
    // Il caso di tutte le commesse nate prima della separazione: il valore
    // passa di qui identico, non appiattito in «Impiantimeccanici».
    expect(aCamelCase('ImpiantiMeccaniciCasaLegno')).toBe('ImpiantiMeccaniciCasaLegno');
  });

  it('lascia stare le parole che hanno gia una maiuscola dentro', () => {
    expect(aCamelCase('fotovoltaico 6 kW')).toBe('Fotovoltaico6kW');
    expect(aCamelCase('impianto PDC')).toBe('ImpiantoPDC');
  });

  it('toglie accenti e punteggiatura', () => {
    expect(aCamelCase('città giardino')).toBe('CittaGiardino');
    expect(aCamelCase('bagno (piano 1°)')).toBe('BagnoPiano1');
    expect(aCamelCase('caldaia + due bagni')).toBe('CaldaiaDueBagni');
  });

  it('taglia a parola intera, non a meta di una parola', () => {
    const frase = 'Sostituzione caldaia e rifacimento impianto bagno piano primo';
    const fuori = aCamelCase(frase);
    expect(fuori.length).toBeLessThanOrEqual(MAX_SEGMENTO);
    // «Bagno» non ci sta: si ferma prima. Il vecchio taglio a 40 caratteri
    // avrebbe lasciato «…ImpiantoBagn», che su Nextcloud resta per sempre.
    expect(fuori).toBe('SostituzioneCaldaiaERifacimentoImpianto');
    expect(fuori.endsWith('Bagn')).toBe(false);
  });

  it('taglia la prima parola solo se da sola sfonda il limite', () => {
    const lunga = 'Supercalifragilistichespiralidosoestremamentelungo';
    expect(aCamelCase(lunga)).toHaveLength(MAX_SEGMENTO);
  });

  it('senza niente da scrivere torna vuoto, non uno spazio', () => {
    expect(aCamelCase('')).toBe('');
    expect(aCamelCase('   ')).toBe('');
    expect(aCamelCase('***')).toBe('');
    expect(aCamelCase('qualcosa', 0)).toBe('');
  });
});

describe('segmentoDescrizione — non torna mai vuoto', () => {
  it('usa la descrizione quando c e', () => {
    expect(segmentoDescrizione('Impianti meccanici casa legno')).toBe(
      'ImpiantiMeccaniciCasaLegno',
    );
  });

  it('ripiega su «Commessa» invece di lasciare due underscore di fila', () => {
    expect(segmentoDescrizione('')).toBe('Commessa');
    expect(segmentoDescrizione(null)).toBe('Commessa');
    expect(segmentoDescrizione(undefined)).toBe('Commessa');
    expect(segmentoDescrizione('...')).toBe('Commessa');
  });
});

describe('segmentoCliente — si toglie, non si riscrive', () => {
  it('attacca le parole senza alzare nessuna iniziale', () => {
    expect(segmentoCliente('Mario Rossi')).toBe('MarioRossi');
    expect(segmentoCliente('Edilizia Tre S.r.l.')).toBe('EdiliziaTreSrl');
  });

  it('non trasforma «di» in «Di»: non e un nome che qualcuno ha scelto', () => {
    expect(segmentoCliente('Comune di Castagnole')).toBe('ComunediCastagnole');
  });

  it('ripiega su «Cliente» quando non c e niente', () => {
    expect(segmentoCliente('')).toBe('Cliente');
    expect(segmentoCliente(null)).toBe('Cliente');
  });
});

describe('componiNomeCartella — il formato canonico', () => {
  it('e codice, cliente, lavoro — e nessuna data', () => {
    const nome = componiNomeCartella({
      codice: 'BER-1026-007',
      cliente: 'Rubner Haus',
      descrizione: 'Impianti meccanici casa legno',
    });
    expect(nome).toBe('BER-1026-007_RubnerHaus_ImpiantiMeccaniciCasaLegno');
    expect(nome).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });

  it('regge una commessa senza cliente e senza descrizione', () => {
    expect(componiNomeCartella({ codice: 'BER-1026-008', cliente: '', descrizione: '' })).toBe(
      'BER-1026-008_Cliente_Commessa',
    );
  });
});

describe('anteprimaNomeCartella — cio che si vede prima di salvare', () => {
  it('dichiara che il codice non c e ancora invece di inventarne uno', () => {
    expect(
      anteprimaNomeCartella({ cliente: 'Rubner Haus', descrizione: 'Impianti meccanici' }),
    ).toBe('01_Richieste/<codice>_RubnerHaus_ImpiantiMeccanici/');
  });

  it('usa il codice vero quando chi chiama ce l ha', () => {
    expect(
      anteprimaNomeCartella({
        codice: 'BER-1026-007',
        cliente: 'Rubner Haus',
        descrizione: 'Impianti meccanici',
      }),
    ).toBe('01_Richieste/BER-1026-007_RubnerHaus_ImpiantiMeccanici/');
  });

  it('combacia con cio che il server scrivera davvero', () => {
    const pezzi = { cliente: 'Mario Rossi', descrizione: 'sistemazione bagno' };
    const anteprima = anteprimaNomeCartella({ ...pezzi, codice: 'BER-1026-009' });
    const vero = componiNomeCartella({ ...pezzi, codice: 'BER-1026-009' });
    expect(anteprima).toBe(`01_Richieste/${vero}/`);
  });
});
