import { describe, expect, it } from 'vitest';

import {
  filtraOpzioni,
  normalizzaTesto,
  opzioneCorrisponde,
  primoIndiceUtile,
  prossimoIndice,
  raggruppaOpzioni,
  tokenDiRicerca,
  type OpzioneScelta,
} from './scelta-opzioni';

const SQUADRA: OpzioneScelta[] = [
  { valore: 'u1', etichetta: 'Mauro Bertaiola', dettaglio: 'Ufficio', gruppo: 'Ufficio' },
  { valore: 'u2', etichetta: 'Elena Rossi', dettaglio: 'Ufficio', gruppo: 'Ufficio' },
  { valore: 't1', etichetta: 'Marco Rinaldi', dettaglio: 'Tecnico', gruppo: 'Tecnici' },
  { valore: 't2', etichetta: 'Gianmarco Fabbri', dettaglio: 'Tecnico', gruppo: 'Tecnici' },
  { valore: 't3', etichetta: 'Nicolò Pozzi', dettaglio: 'Tecnico', gruppo: 'Tecnici' },
];

describe('normalizzaTesto', () => {
  it('toglie gli accenti', () => {
    expect(normalizzaTesto('Nicolò')).toBe('nicolo');
    expect(normalizzaTesto('PERÙ')).toBe('peru');
  });

  it('compatta gli spazi e taglia i bordi', () => {
    expect(normalizzaTesto('  Mario   Rossi  ')).toBe('mario rossi');
  });
});

describe('tokenDiRicerca', () => {
  it('non trova parole in una query vuota o di soli spazi', () => {
    expect(tokenDiRicerca('')).toEqual([]);
    expect(tokenDiRicerca('   ')).toEqual([]);
  });

  it('spezza su qualunque quantità di spazi', () => {
    expect(tokenDiRicerca('mario   rossi')).toEqual(['mario', 'rossi']);
  });
});

describe('opzioneCorrisponde', () => {
  it('con query vuota accetta tutto', () => {
    expect(opzioneCorrisponde(SQUADRA[0]!, '')).toBe(true);
  });

  it('pretende TUTTE le parole, non una qualsiasi', () => {
    expect(opzioneCorrisponde(SQUADRA[2]!, 'marco rinaldi')).toBe(true);
    expect(opzioneCorrisponde(SQUADRA[2]!, 'marco rossi')).toBe(false);
  });

  it('trova parole che stanno in campi diversi', () => {
    // «rinaldi» è nell'etichetta, «tecnico» nel dettaglio.
    expect(opzioneCorrisponde(SQUADRA[2]!, 'rinaldi tecnico')).toBe(true);
  });

  it('trova il nome accentato scrivendolo senza accento', () => {
    expect(opzioneCorrisponde(SQUADRA[4]!, 'nicolo')).toBe(true);
  });

  it('e anche viceversa, scrivendolo con l’accento', () => {
    expect(opzioneCorrisponde(SQUADRA[4]!, 'Nicolò')).toBe(true);
  });

  it('cerca anche nel testo nascosto, che non si vede nella riga', () => {
    const o: OpzioneScelta = {
      valore: 'x',
      etichetta: 'Mauro Bertaiola',
      cerca: 'mauro@bertaiola.it BER-007',
    };
    expect(opzioneCorrisponde(o, 'ber-007')).toBe(true);
    expect(opzioneCorrisponde(o, 'bertaiola.it')).toBe(true);
  });
});

describe('filtraOpzioni', () => {
  it('con query vuota restituisce l’elenco identico e nello stesso ordine', () => {
    expect(filtraOpzioni(SQUADRA, '')).toEqual(SQUADRA);
    expect(filtraOpzioni(SQUADRA, '   ')).toEqual(SQUADRA);
  });

  it('non tocca l’elenco di partenza', () => {
    const copia = [...SQUADRA];
    filtraOpzioni(SQUADRA, 'mar');
    expect(SQUADRA).toEqual(copia);
  });

  it('mette davanti chi COMINCIA con quello che si è digitato', () => {
    // «Gianmarco» contiene «marco», ma chi scrive «marco» cerca Marco.
    const out = filtraOpzioni(SQUADRA, 'marco');
    expect(out.map((o) => o.valore)).toEqual(['t1', 't2']);
  });

  it('promuove anche il match su una parola successiva del nome', () => {
    const out = filtraOpzioni(SQUADRA, 'ros');
    expect(out[0]!.valore).toBe('u2');
  });

  it('a parità di punteggio conserva l’ordine di partenza', () => {
    const out = filtraOpzioni(SQUADRA, 'tecnico');
    expect(out.map((o) => o.valore)).toEqual(['t1', 't2', 't3']);
  });

  it('restituisce vuoto quando non c’è niente', () => {
    expect(filtraOpzioni(SQUADRA, 'zzz')).toEqual([]);
  });
});

describe('raggruppaOpzioni', () => {
  it('conserva l’ordine di prima apparizione dei gruppi, non l’alfabetico', () => {
    const g = raggruppaOpzioni(SQUADRA);
    expect(g.map((x) => x.gruppo)).toEqual(['Ufficio', 'Tecnici']);
  });

  it('tiene insieme le voci di ogni gruppo', () => {
    const g = raggruppaOpzioni(SQUADRA);
    expect(g[1]!.opzioni.map((o) => o.valore)).toEqual(['t1', 't2', 't3']);
  });

  it('mette in fondo, in un blocco senza nome, chi non ha gruppo', () => {
    const g = raggruppaOpzioni([
      { valore: 'a', etichetta: 'A', gruppo: 'G' },
      { valore: 'b', etichetta: 'B' },
    ]);
    expect(g.map((x) => x.gruppo)).toEqual(['G', null]);
    expect(g[1]!.opzioni.map((o) => o.valore)).toEqual(['b']);
  });

  it('su un elenco vuoto non inventa gruppi', () => {
    expect(raggruppaOpzioni([])).toEqual([]);
  });
});

describe('navigazione con le frecce', () => {
  const conBuchi: OpzioneScelta[] = [
    { valore: 'a', etichetta: 'A', disabilitata: true },
    { valore: 'b', etichetta: 'B' },
    { valore: 'c', etichetta: 'C', disabilitata: true },
    { valore: 'd', etichetta: 'D' },
  ];

  it('parte dalla prima voce scegliibile, saltando le spente', () => {
    expect(primoIndiceUtile(conBuchi)).toBe(1);
  });

  it('scavalca le voci spente invece di fermarcisi sopra', () => {
    expect(prossimoIndice(conBuchi, 1, 1)).toBe(3);
  });

  it('torna indietro saltando allo stesso modo', () => {
    expect(prossimoIndice(conBuchi, 3, -1)).toBe(1);
  });

  it('arrivato in fondo resta in fondo, non riparte dall’alto', () => {
    expect(prossimoIndice(conBuchi, 3, 1)).toBe(3);
  });

  it('in cima resta in cima', () => {
    expect(prossimoIndice(conBuchi, 1, -1)).toBe(1);
  });

  it('su un elenco tutto spento non seleziona niente', () => {
    const spente: OpzioneScelta[] = [
      { valore: 'a', etichetta: 'A', disabilitata: true },
    ];
    expect(primoIndiceUtile(spente)).toBe(-1);
    expect(prossimoIndice(spente, -1, 1)).toBe(-1);
  });

  it('su un elenco vuoto non seleziona niente', () => {
    expect(primoIndiceUtile([])).toBe(-1);
  });
});
