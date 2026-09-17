import { describe, it, expect } from 'vitest';

import {
  asciiPulito,
  codicePagheValido,
  dataCompatta,
  formattaOreEssePaghe,
  generaDatiMese,
  record10,
  record12,
  record14,
  validaTracciato,
  type DipendentePaghe,
  type EventoPaghe,
} from './paghe-essepaghe';
import {
  REGOLE_DEFAULT,
  eventiDaAssenza,
  eventiDaGiornata,
  estremiDelMese,
  festivoItaliano,
  giorniDelPeriodo,
  limitaAlMese,
  regoleConfigurate,
  tipoGiorno,
  traduciMese,
} from './paghe-mappatura';
import { causaleEssePaghe } from './paghe-causali';

const BENEDETTI: DipendentePaghe = {
  id: 'ben',
  codicePaghe: '00003',
  cognome: 'Benedetti',
  nome: 'Nicola',
};
const VALBUSA: DipendentePaghe = {
  id: 'val',
  codicePaghe: '00009',
  cognome: 'Valbusa',
  nome: 'Stefano',
};

const OPZIONI = { periodo: '2026-06', codiceDitta: '100145' };

function evento(p: Partial<EventoPaghe> & Pick<EventoPaghe, 'dipendenteId' | 'causale' | 'dal'>): EventoPaghe {
  return { al: p.dal, ore: 0, ...p } as EventoPaghe;
}

describe('formato dei campi', () => {
  it('le ore sono in centesimi, non in minuti', () => {
    expect(formattaOreEssePaghe(8)).toBe('008,00');
    expect(formattaOreEssePaghe(1.5)).toBe('001,50');
    expect(formattaOreEssePaghe(0.5)).toBe('000,50');
    expect(formattaOreEssePaghe(0.25)).toBe('000,25');
    expect(formattaOreEssePaghe(0)).toBe('000,00');
  });

  it('rifiuta ore impossibili invece di scriverle storte', () => {
    expect(() => formattaOreEssePaghe(-1)).toThrow('non valide');
    expect(() => formattaOreEssePaghe(1000)).toThrow('fuori scala');
  });

  it('toglie gli accenti: il file e' + "' dichiarato ASCII", () => {
    expect(asciiPulito('Niccolò Paglietta')).toBe('Niccolo Paglietta');
    expect(asciiPulito('Dal Gal  Nicola')).toBe('Dal Gal Nicola');
  });

  it('la data va compatta, senza trattini', () => {
    expect(dataCompatta('2026-06-08')).toBe('20260608');
    expect(() => dataCompatta('8 giugno')).toThrow('non valida');
  });
});

describe('posizioni dei campi nel record', () => {
  it('il codice ditta e' + "' alfanumerico: a sinistra, non riempito di zeri", () => {
    const riga = record10(1, '100145', BENEDETTI);
    expect(riga.slice(10, 17)).toBe('100145 ');
    expect(riga.slice(18, 24)).toBe('000003');
    expect(riga.slice(25, 41)).toBe('BENEDETTI NICOLA');
    expect(riga).toHaveLength(76);
  });

  it('il record 14 porta giorno, causale e ore nelle posizioni del manuale', () => {
    const riga = record14(2, evento({ dipendenteId: 'ben', causale: 'S0', dal: '2026-06-15', ore: 1 }));
    expect(riga.slice(0, 2)).toBe('14');
    expect(riga.slice(3, 9)).toBe('000002');
    expect(riga.slice(10, 12)).toBe('15');
    expect(riga.slice(13, 17)).toBe('S0  ');
    expect(riga.slice(18, 24)).toBe('001,00');
    expect(riga).toHaveLength(47);
  });

  it('il record 12 porta le due date e il PUC dove li aspetta il programma paghe', () => {
    const riga = record12(
      8,
      evento({
        dipendenteId: 'val',
        causale: 'ML',
        dal: '2026-06-08',
        al: '2026-06-12',
        tipoInfo: 'P',
        infoAggiuntiva: '234567890',
      }),
    );
    expect(riga.slice(10, 14)).toBe('ML  ');
    expect(riga.slice(15, 23)).toBe('20260608');
    expect(riga.slice(24, 32)).toBe('20260612');
    expect(riga.slice(33, 39)).toBe('000,00');
    expect(riga.slice(55, 56)).toBe('P');
    expect(riga.slice(57, 66)).toBe('234567890');
    expect(riga).toHaveLength(96);
  });

  it('un nome lunghissimo viene tagliato, non sfonda il record', () => {
    const riga = record10(1, '100145', {
      ...BENEDETTI,
      cognome: 'Cognomelunghissimodavveroesagerato',
      nome: 'Nomeugualmenteinterminabileequalcosa',
    });
    expect(riga).toHaveLength(76);
  });
});

describe('file completo', () => {
  // Il fac-simile giudicato formalmente corretto dal consulente: due casi
  // reali, Benedetti con quattro straordinari e un permesso, Valbusa con una
  // settimana di malattia. Se questo test cambia, e' cambiato il tracciato.
  it('riproduce il file gia' + "' approvato dal consulente", () => {
    const eventi: EventoPaghe[] = [
      evento({ dipendenteId: 'ben', causale: 'S0', dal: '2026-06-15', ore: 1 }),
      evento({ dipendenteId: 'ben', causale: 'S0', dal: '2026-06-16', ore: 0.5 }),
      evento({ dipendenteId: 'ben', causale: 'S0', dal: '2026-06-17', ore: 1 }),
      evento({ dipendenteId: 'ben', causale: 'S0', dal: '2026-06-18', ore: 0.5 }),
      evento({ dipendenteId: 'ben', causale: 'PR', dal: '2026-06-19', ore: 1.5 }),
      evento({ dipendenteId: 'val', causale: 'ML', dal: '2026-06-08', al: '2026-06-12' }),
    ];
    const esito = generaDatiMese([BENEDETTI, VALBUSA], eventi, OPZIONI);

    const atteso =
      [
        '00 000000 DATI MESE       202606 EssePaghe       Kommessa'.padEnd(87),
        '10 000001 100145  000003 BENEDETTI NICOLA'.padEnd(76),
        '14 000002 15 S0   001,00'.padEnd(47),
        '14 000003 16 S0   000,50'.padEnd(47),
        '14 000004 17 S0   001,00'.padEnd(47),
        '14 000005 18 S0   000,50'.padEnd(47),
        '14 000006 19 PR   001,50'.padEnd(47),
        '10 000007 100145  000009 VALBUSA STEFANO'.padEnd(76),
        '12 000008 ML   20260608 20260612 000,00'.padEnd(96),
      ].join('\r\n') + '\r\n';

    expect(esito.testo).toBe(atteso);
    expect(esito.totali).toEqual({
      dipendenti: 2,
      eventi: 6,
      record12: 1,
      record14: 5,
      scartati: 0,
    });
    expect(validaTracciato(esito.testo)).toEqual([]);
  });

  it('chi non ha variazioni non compare: una giornata normale non si comunica', () => {
    const esito = generaDatiMese(
      [BENEDETTI, VALBUSA],
      [evento({ dipendenteId: 'ben', causale: 'FE', dal: '2026-06-02', ore: 8 })],
      OPZIONI,
    );
    expect(esito.totali.dipendenti).toBe(1);
    expect(esito.righe.filter((r) => r.tipo === '10')).toHaveLength(1);
    expect(esito.testo).toContain('BENEDETTI NICOLA');
    expect(esito.testo).not.toContain('VALBUSA');
  });

  it('ordina per codice paghe, come li legge lo Studio', () => {
    const esito = generaDatiMese(
      [VALBUSA, BENEDETTI],
      [
        evento({ dipendenteId: 'val', causale: 'FE', dal: '2026-06-02', ore: 8 }),
        evento({ dipendenteId: 'ben', causale: 'FE', dal: '2026-06-02', ore: 8 }),
      ],
      OPZIONI,
    );
    const nomi = esito.righe.filter((r) => r.tipo === '10').map((r) => r.testo.slice(25, 40).trim());
    expect(nomi).toEqual(['BENEDETTI NICOL', 'VALBUSA STEFANO']);
  });

  it('ogni riga ha la sua spiegazione in italiano per l' + "'anteprima", () => {
    const esito = generaDatiMese(
      [BENEDETTI],
      [evento({ dipendenteId: 'ben', causale: 'PR', dal: '2026-06-19', ore: 1.5 })],
      OPZIONI,
    );
    expect(esito.righe.at(-1)?.glossa).toBe(
      'Benedetti Nicola: Permessi r.o.l/p.a.r. il 19/06 1,50 ore',
    );
  });
});

describe('controlli prima di consegnare il file', () => {
  it('senza codice paghe il dipendente resta fuori, e si dice perche', () => {
    const esito = generaDatiMese(
      [{ ...BENEDETTI, codicePaghe: null }],
      [evento({ dipendenteId: 'ben', causale: 'FE', dal: '2026-06-02', ore: 8 })],
      OPZIONI,
    );
    expect(esito.totali.dipendenti).toBe(0);
    expect(esito.totali.scartati).toBe(1);
    expect(esito.avvisi[0]).toMatchObject({ gravita: 'blocco' });
    expect(esito.avvisi[0]!.messaggio).toContain('non ha il codice paghe');
  });

  it('senza codice ditta non si genera niente', () => {
    const esito = generaDatiMese([BENEDETTI], [], { ...OPZIONI, codiceDitta: '  ' });
    expect(esito.testo).toBe('');
    expect(esito.avvisi[0]?.messaggio).toContain('codice ditta');
  });

  it('la malattia senza PUC esce lo stesso, ma con un avviso', () => {
    const esito = generaDatiMese(
      [VALBUSA],
      [evento({ dipendenteId: 'val', causale: 'ML', dal: '2026-06-08', al: '2026-06-12' })],
      OPZIONI,
    );
    expect(esito.totali.record12).toBe(1);
    const avviso = esito.avvisi.find((a) => a.messaggio.includes('PUC'));
    expect(avviso?.gravita).toBe('attenzione');
  });

  it('scarta la causale che non esiste nella tabella dello Studio', () => {
    const esito = generaDatiMese(
      [BENEDETTI],
      [evento({ dipendenteId: 'ben', causale: 'ZQ', dal: '2026-06-02', ore: 8 })],
      OPZIONI,
    );
    expect(esito.totali.eventi).toBe(0);
    expect(esito.avvisi[0]!.messaggio).toContain('non esiste');
  });

  it('scarta un evento fuori dal mese esportato', () => {
    const esito = generaDatiMese(
      [BENEDETTI],
      [evento({ dipendenteId: 'ben', causale: 'FE', dal: '2026-07-02', ore: 8 })],
      OPZIONI,
    );
    expect(esito.totali.scartati).toBe(1);
    expect(esito.avvisi[0]!.messaggio).toContain('esce dal mese');
  });

  it('un evento giornaliero senza ore e' + "' un errore: le ore sono obbligatorie", () => {
    const esito = generaDatiMese(
      [BENEDETTI],
      [evento({ dipendenteId: 'ben', causale: 'FE', dal: '2026-06-02', ore: 0 })],
      OPZIONI,
    );
    expect(esito.totali.scartati).toBe(1);
    expect(esito.avvisi[0]!.messaggio).toContain('ore sono obbligatorie');
  });

  it('la malattia non si puo' + "' spalmare giorno per giorno", () => {
    const esito = generaDatiMese(
      [VALBUSA],
      [evento({ dipendenteId: 'val', causale: 'ML', dal: '2026-06-08', ore: 8, record: '14' })],
      OPZIONI,
    );
    expect(esito.totali.scartati).toBe(1);
    expect(esito.avvisi[0]!.messaggio).toContain('come periodo');
  });

  it('riconosce una riga di lunghezza sbagliata o con caratteri non ASCII', () => {
    expect(validaTracciato('14 000002 15 S0   001,00\r\n')[0]?.messaggio).toContain('lunghezza');
    expect(validaTracciato('99 000002\r\n')[0]?.messaggio).toContain('non previsto');
    expect(validaTracciato('')).toEqual([]);
  });
});

describe('calendario', () => {
  it('distingue feriale, sabato e festivo', () => {
    expect(tipoGiorno('2026-06-15')).toBe('feriale');
    expect(tipoGiorno('2026-06-13')).toBe('sabato');
    expect(tipoGiorno('2026-06-14')).toBe('festivo');
    expect(tipoGiorno('2026-06-02')).toBe('festivo');
  });

  it('conosce la Pasquetta, che cambia ogni anno', () => {
    expect(festivoItaliano('2026-04-06')).toBe(true);
    expect(festivoItaliano('2026-04-07')).toBe(false);
  });

  it('sa dove comincia e finisce il mese', () => {
    expect(estremiDelMese('2026-02')).toEqual({ dal: '2026-02-01', al: '2026-02-28' });
    expect(estremiDelMese('2024-02')).toEqual({ dal: '2024-02-01', al: '2024-02-29' });
  });

  it('taglia un periodo a cavallo di due mesi', () => {
    expect(limitaAlMese('2026-05-28', '2026-06-03', '2026-06')).toEqual({
      dal: '2026-06-01',
      al: '2026-06-03',
    });
    expect(limitaAlMese('2026-05-01', '2026-05-10', '2026-06')).toBeNull();
  });
});

describe('dalla giornata Kommessa alla causale', () => {
  it('una giornata senza variazioni non produce niente', () => {
    expect(
      eventiDaGiornata({
        dipendenteId: 'ben',
        data: '2026-06-15',
        minutiStraordinari: 0,
        minutiViaggioEccedente: 0,
      }),
    ).toEqual([]);
  });

  it('due ore oltre l' + "'orario diventano un solo S0 da 002,00", () => {
    const eventi = eventiDaGiornata({
      dipendenteId: 'ben',
      data: '2026-06-15',
      minutiStraordinari: 120,
      minutiViaggioEccedente: 0,
    });
    expect(eventi).toHaveLength(1);
    expect(eventi[0]).toMatchObject({ causale: 'S0', ore: 2, record: '14' });
  });

  it('lo straordinario di sabato e quello di festivo hanno voci diverse', () => {
    const sabato = eventiDaGiornata({
      dipendenteId: 'ben',
      data: '2026-06-13',
      minutiStraordinari: 300,
      minutiViaggioEccedente: 0,
    });
    const festivo = eventiDaGiornata({
      dipendenteId: 'ben',
      data: '2026-06-02',
      minutiStraordinari: 60,
      minutiViaggioEccedente: 0,
    });
    expect(sabato[0]).toMatchObject({ causale: 'S9', ore: 5 });
    expect(festivo[0]).toMatchObject({ causale: 'S7', ore: 1 });
  });

  it('le ore di viaggio oltre l' + "'orario diventano V1", () => {
    const eventi = eventiDaGiornata({
      dipendenteId: 'ben',
      data: '2026-06-15',
      minutiStraordinari: 60,
      minutiViaggioEccedente: 90,
    });
    expect(eventi.map((e) => [e.causale, e.ore])).toEqual([
      ['S0', 1],
      ['V1', 1.5],
    ]);
  });

  it('con l' + "'arrotondamento acceso i minuti dispari si appoggiano al quarto d'ora", () => {
    const regole = regoleConfigurate({ arrotondamentoMinuti: 15 });
    const eventi = eventiDaGiornata(
      {
        dipendenteId: 'ben',
        data: '2026-06-15',
        minutiStraordinari: 68,
        minutiViaggioEccedente: 0,
      },
      regole,
    );
    expect(eventi[0]!.ore).toBe(1.25);
  });
});

describe('dalle assenze Kommessa alla causale', () => {
  const opzioni = { periodo: '2026-06', oreGiornataIntera: 8 };

  it('cinque giorni di malattia sono un periodo solo, non cinque righe', () => {
    const esito = eventiDaAssenza(
      {
        dipendenteId: 'val',
        tipo: 'malattia',
        dal: '2026-06-08',
        al: '2026-06-12',
        tuttoIlGiorno: true,
        certificato: { tipoInfo: 'P', numero: '234567890' },
      },
      REGOLE_DEFAULT,
      opzioni,
    );
    expect(esito.eventi).toHaveLength(1);
    expect(esito.eventi[0]).toMatchObject({
      causale: 'ML',
      record: '12',
      dal: '2026-06-08',
      al: '2026-06-12',
      ore: 0,
      tipoInfo: 'P',
      infoAggiuntiva: '234567890',
    });
  });

  it('una settimana di ferie diventa una riga per giorno lavorativo', () => {
    const esito = eventiDaAssenza(
      {
        dipendenteId: 'ben',
        tipo: 'ferie',
        dal: '2026-06-15',
        al: '2026-06-21',
        tuttoIlGiorno: true,
      },
      REGOLE_DEFAULT,
      opzioni,
    );
    // Dal lunedi' al venerdi': sabato e domenica restano fuori.
    expect(esito.eventi).toHaveLength(5);
    expect(esito.eventi.every((e) => e.causale === 'FE' && e.ore === 8)).toBe(true);
    expect(esito.eventi.at(-1)?.dal).toBe('2026-06-19');
  });

  it('un permesso a ore porta le sue ore, non la giornata', () => {
    const esito = eventiDaAssenza(
      {
        dipendenteId: 'ben',
        tipo: 'rol',
        dal: '2026-06-19',
        al: '2026-06-19',
        tuttoIlGiorno: false,
        oreParziali: 1.5,
      },
      REGOLE_DEFAULT,
      opzioni,
    );
    expect(esito.eventi[0]).toMatchObject({ causale: 'PR', ore: 1.5, record: '14' });
  });

  it('il permesso 104 cambia voce se e' + "' a ore invece che a giornate", () => {
    const giorno = eventiDaAssenza(
      { dipendenteId: 'ben', tipo: 'permesso_104', dal: '2026-06-15', al: '2026-06-15', tuttoIlGiorno: true },
      REGOLE_DEFAULT,
      opzioni,
    );
    const ore = eventiDaAssenza(
      {
        dipendenteId: 'ben',
        tipo: 'permesso_104',
        dal: '2026-06-15',
        al: '2026-06-15',
        tuttoIlGiorno: false,
        oreParziali: 2,
      },
      REGOLE_DEFAULT,
      opzioni,
    );
    expect(giorno.eventi[0]?.causale).toBe('B7');
    expect(ore.eventi[0]?.causale).toBe('B1');
  });

  it('un tipo senza causale decisa non inventa niente, lo segnala', () => {
    const esito = eventiDaAssenza(
      {
        dipendenteId: 'ben',
        tipo: 'congedo_parentale',
        dal: '2026-06-15',
        al: '2026-06-16',
        tuttoIlGiorno: true,
      },
      REGOLE_DEFAULT,
      opzioni,
    );
    expect(esito.eventi).toEqual([]);
    expect(esito.causaliDaDecidere).toEqual(['congedo_parentale']);
  });

  it('una scelta salvata per il cliente vince su quella di partenza', () => {
    const regole = regoleConfigurate({ assenze: { congedo_parentale: 'MF' } });
    const esito = eventiDaAssenza(
      {
        dipendenteId: 'ben',
        tipo: 'congedo_parentale',
        dal: '2026-06-15',
        al: '2026-06-16',
        tuttoIlGiorno: true,
      },
      regole,
      opzioni,
    );
    expect(esito.eventi[0]?.causale).toBe('MF');
    expect(esito.causaliDaDecidere).toEqual([]);
    // Le altre corrispondenze restano quelle di sempre.
    expect(regole.assenze.ferie).toBe('FE');
  });

  it('un periodo che sconfina nel mese dopo viene tagliato', () => {
    const esito = eventiDaAssenza(
      { dipendenteId: 'val', tipo: 'malattia', dal: '2026-06-29', al: '2026-07-03', tuttoIlGiorno: true },
      REGOLE_DEFAULT,
      opzioni,
    );
    expect(esito.eventi[0]).toMatchObject({ dal: '2026-06-29', al: '2026-06-30' });
  });
});

describe('mese intero', () => {
  it('mette insieme giornate e assenze e raccoglie le causali da decidere', () => {
    const esito = traduciMese(
      {
        giornate: [
          { dipendenteId: 'ben', data: '2026-06-15', minutiStraordinari: 60, minutiViaggioEccedente: 0 },
          { dipendenteId: 'ben', data: '2026-05-31', minutiStraordinari: 60, minutiViaggioEccedente: 0 },
        ],
        assenze: [
          { dipendenteId: 'val', tipo: 'malattia', dal: '2026-06-08', al: '2026-06-12', tuttoIlGiorno: true },
          { dipendenteId: 'ben', tipo: 'visita_medica', dal: '2026-06-18', al: '2026-06-18', tuttoIlGiorno: false, oreParziali: 2 },
        ],
      },
      REGOLE_DEFAULT,
      { periodo: '2026-06', oreGiornataIntera: 8 },
    );
    // La giornata di maggio resta fuori dal mese esportato.
    expect(esito.eventi).toHaveLength(2);
    expect(esito.causaliDaDecidere).toEqual(['visita_medica']);
  });

  it('il dizionario sa dove va ogni causale', () => {
    expect(causaleEssePaghe('ML')).toMatchObject({ record: '12', obbligatorioRecord12: true });
    expect(causaleEssePaghe('FE')).toMatchObject({ record: '14' });
    expect(causaleEssePaghe('L0')).toMatchObject({ famiglia: 'straordinario', record: '14' });
    expect(causaleEssePaghe('zz')).toMatchObject({ codice: 'ZZ' });
    expect(causaleEssePaghe('inesistente')).toBeUndefined();
  });
});

describe('giorni contati bene', () => {
  it('i mesi lunghi, corti e bisestili finiscono dove devono', () => {
    expect(estremiDelMese('2026-01').al).toBe('2026-01-31');
    expect(estremiDelMese('2026-04').al).toBe('2026-04-30');
    expect(estremiDelMese('2026-12').al).toBe('2026-12-31');
    expect(estremiDelMese('2028-02').al).toBe('2028-02-29');
  });

  it('il cambio dell' + "'ora non fa sparire ne' raddoppiare un giorno", () => {
    // Ultima domenica di marzo e di ottobre 2026: le date sono trattate in UTC
    // proprio per non dipendere dal fuso di chi guarda.
    expect(giorniDelPeriodo('2026-03-28', '2026-03-30')).toEqual([
      '2026-03-28',
      '2026-03-29',
      '2026-03-30',
    ]);
    expect(giorniDelPeriodo('2026-10-24', '2026-10-26')).toEqual([
      '2026-10-24',
      '2026-10-25',
      '2026-10-26',
    ]);
  });

  it('un periodo di un giorno solo resta un giorno', () => {
    expect(giorniDelPeriodo('2026-06-15', '2026-06-15')).toEqual(['2026-06-15']);
  });

  it('un' + "'assenza a cavallo di capodanno si taglia sull'anno giusto", () => {
    expect(limitaAlMese('2025-12-28', '2026-01-05', '2026-01')).toEqual({
      dal: '2026-01-01',
      al: '2026-01-05',
    });
    expect(limitaAlMese('2025-12-28', '2026-01-05', '2025-12')).toEqual({
      dal: '2025-12-28',
      al: '2025-12-31',
    });
  });

  it('le ferie che sconfinano nel mese dopo si fermano al 30', () => {
    const esito = eventiDaAssenza(
      { dipendenteId: 'ben', tipo: 'ferie', dal: '2026-06-29', al: '2026-07-03', tuttoIlGiorno: true },
      REGOLE_DEFAULT,
      { periodo: '2026-06', oreGiornataIntera: 8 },
    );
    expect(esito.eventi.map((e) => e.dal)).toEqual(['2026-06-29', '2026-06-30']);
  });
});

describe('un mese intero regge il tracciato', () => {
  it('quaranta righe su due persone: lunghezze, progressivi e delimitatori', () => {
    const eventi: EventoPaghe[] = [];
    for (let giorno = 1; giorno <= 20; giorno++) {
      const data = `2026-06-${String(giorno).padStart(2, '0')}`;
      eventi.push(evento({ dipendenteId: 'ben', causale: 'S0', dal: data, ore: 1.25 }));
      eventi.push(evento({ dipendenteId: 'val', causale: 'V1', dal: data, ore: 0.5 }));
    }
    const esito = generaDatiMese([BENEDETTI, VALBUSA], eventi, OPZIONI);

    // Intestazione + due dipendenti + quaranta eventi.
    expect(esito.righe).toHaveLength(43);
    expect(esito.totali).toMatchObject({ dipendenti: 2, eventi: 40, scartati: 0 });
    expect(validaTracciato(esito.testo)).toEqual([]);

    // Il progressivo cresce di uno per riga, partendo da zero sull'intestazione.
    const progressivi = esito.righe.map((r) => Number(r.testo.slice(3, 9)));
    expect(progressivi).toEqual(progressivi.map((_, i) => i));

    // Ogni riga finisce con CR LF, anche l'ultima.
    expect(esito.testo.split('\r\n')).toHaveLength(44);
    expect(esito.testo.endsWith('\r\n')).toBe(true);
  });

  it('i giorni sotto il dieci restano a due cifre', () => {
    const esito = generaDatiMese(
      [BENEDETTI],
      [evento({ dipendenteId: 'ben', causale: 'FE', dal: '2026-06-03', ore: 8 })],
      OPZIONI,
    );
    expect(esito.righe.at(-1)!.testo.slice(10, 12)).toBe('03');
  });

  it('senza eventi resta la sola intestazione', () => {
    const esito = generaDatiMese([BENEDETTI], [], OPZIONI);
    expect(esito.totali.eventi).toBe(0);
    expect(esito.righe).toHaveLength(1);
  });

  it('se tutte le sue righe cadono, il dipendente non resta nel file da solo', () => {
    const esito = generaDatiMese(
      [BENEDETTI],
      [evento({ dipendenteId: 'ben', causale: 'ZQ', dal: '2026-06-02', ore: 8 })],
      OPZIONI,
    );
    expect(esito.righe).toHaveLength(1);
    expect(esito.totali.dipendenti).toBe(0);
  });

  it('un periodo che finisce nel mese dopo viene scartato', () => {
    const esito = generaDatiMese(
      [VALBUSA],
      [evento({ dipendenteId: 'val', causale: 'ML', dal: '2026-06-28', al: '2026-08-15' })],
      OPZIONI,
    );
    expect(esito.totali.scartati).toBe(1);
    expect(esito.avvisi[0]!.messaggio).toContain('esce dal mese');
  });
});

describe('il codice paghe deve entrare nel campo', () => {
  it('riconosce i codici che non ci stanno', () => {
    expect(codicePagheValido('00003')).toBe(true);
    expect(codicePagheValido('123456')).toBe(true);
    expect(codicePagheValido('DIP-001')).toBe(false);
    expect(codicePagheValido('1234567')).toBe(false);
    expect(codicePagheValido(null)).toBe(false);
  });

  // Il codice interno di Kommessa e' testo libero e puo' nascere come
  // "DIP-001": tagliato a sei caratteri darebbe a nove persone la stessa
  // matricola, e nessuno se ne accorgerebbe.
  it('un codice generato in automatico non entra nel file troncato', () => {
    const esito = generaDatiMese(
      [{ ...BENEDETTI, codicePaghe: 'DIP-001' }],
      [evento({ dipendenteId: 'ben', causale: 'FE', dal: '2026-06-02', ore: 8 })],
      OPZIONI,
    );
    expect(esito.totali.dipendenti).toBe(0);
    expect(esito.totali.scartati).toBe(1);
    expect(esito.avvisi[0]!.messaggio).toContain('DIP-001');
    expect(esito.testo).not.toContain('DIP');
  });

  it('il record rifiuta un numerico troppo lungo invece di tagliarlo', () => {
    expect(() =>
      record10(1, '100145', { ...BENEDETTI, codicePaghe: '1234567' }),
    ).toThrow('troppo lungo');
  });
});

describe('attestati e periodi tagliati', () => {
  const opzioni = { periodo: '2026-06', oreGiornataIntera: 8 };

  it('il tipo di numero e' + "' quello dichiarato, non dedotto dalla causale", () => {
    const esito = eventiDaAssenza(
      {
        dipendenteId: 'val',
        tipo: 'malattia',
        dal: '2026-06-08',
        al: '2026-06-12',
        tuttoIlGiorno: true,
        certificato: { tipoInfo: 'M', numero: 'PROT-99' },
      },
      REGOLE_DEFAULT,
      opzioni,
    );
    expect(esito.eventi[0]).toMatchObject({ tipoInfo: 'M', infoAggiuntiva: 'PROT-99' });
  });

  it('senza numero non si dichiara nemmeno il tipo', () => {
    const esito = eventiDaAssenza(
      { dipendenteId: 'val', tipo: 'malattia', dal: '2026-06-08', al: '2026-06-12', tuttoIlGiorno: true },
      REGOLE_DEFAULT,
      opzioni,
    );
    expect(esito.eventi[0]!.tipoInfo).toBeUndefined();
  });

  it('una malattia cominciata il mese prima porta con se' + "' la data vera", () => {
    const esito = eventiDaAssenza(
      { dipendenteId: 'val', tipo: 'malattia', dal: '2026-05-28', al: '2026-06-05', tuttoIlGiorno: true },
      REGOLE_DEFAULT,
      opzioni,
    );
    expect(esito.eventi[0]).toMatchObject({ dal: '2026-06-01', dataRiferimento: '2026-05-28' });
    expect(esito.avvisi[0]!.messaggio).toContain('28/05');
  });

  it('con il numero dell' + "'attestato la data di inizio non serve piu'", () => {
    const esito = eventiDaAssenza(
      {
        dipendenteId: 'val',
        tipo: 'malattia',
        dal: '2026-05-28',
        al: '2026-06-05',
        tuttoIlGiorno: true,
        certificato: { tipoInfo: 'P', numero: '999' },
      },
      REGOLE_DEFAULT,
      opzioni,
    );
    expect(esito.eventi[0]!.dataRiferimento).toBeUndefined();
    expect(esito.avvisi).toHaveLength(1);
  });

  it('un' + "'assenza tutta nel fine settimana lo dice invece di sparire", () => {
    const esito = eventiDaAssenza(
      { dipendenteId: 'ben', tipo: 'ferie', dal: '2026-06-13', al: '2026-06-14', tuttoIlGiorno: true },
      REGOLE_DEFAULT,
      opzioni,
    );
    expect(esito.eventi).toEqual([]);
    expect(esito.avvisi[0]!.messaggio).toContain('sabato, domenica e festivi');
  });

  it('i minuti azzerati dall' + "'arrotondamento vengono segnalati", () => {
    const esito = traduciMese(
      {
        giornate: [
          { dipendenteId: 'ben', data: '2026-06-15', minutiStraordinari: 7, minutiViaggioEccedente: 0 },
        ],
        assenze: [],
      },
      regoleConfigurate({ arrotondamentoMinuti: 15 }),
      opzioni,
    );
    expect(esito.eventi).toEqual([]);
    expect(esito.avvisi[0]!.messaggio).toContain('arrotondamento');
  });
});
