import { describe, it, expect } from 'vitest';

import {
  categoriaDaScrivere,
  chiaveCategoria,
  smistaCategorie,
} from './categorie-smistamento';

const NOSTRE = [
  { id: 'q', nome: 'QUADRI' },
  { id: 'm', nome: 'MANUTENZIONE' },
];

describe('chiaveCategoria', () => {
  it('ignora maiuscole e spazi ai bordi', () => {
    expect(chiaveCategoria(' Quadri ')).toBe(chiaveCategoria('QUADRI'));
  });

  it('compatta gli spazi interni', () => {
    expect(chiaveCategoria('CONSUNTIVO   MAN')).toBe('consuntivo man');
  });

  it('NON confonde varianti con punteggiatura: sono cose diverse', () => {
    expect(chiaveCategoria('QUADRI')).not.toBe(chiaveCategoria('QUADRI - CL'));
  });

  it('regge null e vuoto', () => {
    expect(chiaveCategoria(null)).toBe('');
  });
});

describe('smistaCategorie', () => {
  it('aggancia per uguaglianza esatta: non è un’ipotesi, è un’identità', () => {
    const e = smistaCategorie(['quadri', ' MANUTENZIONE '], NOSTRE, []);
    expect(e.daCollegare).toEqual([
      { valoreEsterno: 'quadri', categoriaId: 'q' },
      { valoreEsterno: 'MANUTENZIONE', categoriaId: 'm' },
    ]);
    expect(e.daSmistare).toEqual([]);
  });

  it('un valore mai visto va in coda, NON diventa una categoria', () => {
    const e = smistaCategorie(['FOTOVOLTAICO'], NOSTRE, []);
    expect(e.daSmistare).toEqual(['FOTOVOLTAICO']);
    expect(e.daCollegare).toEqual([]);
  });

  it('chi è già in mappatura non si ri-decide: l’ufficio ha già scelto', () => {
    const e = smistaCategorie(['QUADRI'], NOSTRE, [
      { valoreEsterno: 'quadri', categoriaId: null },
    ]);
    expect(e.giaNoti).toEqual(['QUADRI']);
    expect(e.daCollegare).toEqual([]);
    expect(e.daSmistare).toEqual([]);
  });

  it('non ripete lo stesso valore visto cento volte', () => {
    const e = smistaCategorie(['QUADRI', 'Quadri', 'quadri '], NOSTRE, []);
    expect(e.daCollegare).toHaveLength(1);
  });

  it('salta i vuoti invece di creare una categoria senza nome', () => {
    const e = smistaCategorie(['', '   ', 'NUOVA'], NOSTRE, []);
    expect(e.daSmistare).toEqual(['NUOVA']);
  });

  it('un elenco senza nostre categorie manda tutto in coda, niente esplode', () => {
    const e = smistaCategorie(['A', 'B'], [], []);
    expect(e.daSmistare).toEqual(['A', 'B']);
  });
});

describe('categoriaDaScrivere', () => {
  const mappa = new Map([['consuntivo man', 'Manutenzione a consuntivo']]);

  it('smistato → si scrive il NOSTRO nome, non il loro', () => {
    expect(categoriaDaScrivere('CONSUNTIVO MAN', mappa)).toBe(
      'Manutenzione a consuntivo',
    );
  });

  it('non ancora smistato → si scrive il grezzo, meglio che niente', () => {
    expect(categoriaDaScrivere('SCONOSCIUTA', mappa)).toBe('SCONOSCIUTA');
  });

  it('vuoto resta vuoto', () => {
    expect(categoriaDaScrivere('  ', mappa)).toBeNull();
    expect(categoriaDaScrivere(null, mappa)).toBeNull();
  });
});
