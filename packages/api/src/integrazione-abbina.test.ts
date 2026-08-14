import { describe, it, expect } from 'vitest';

import {
  duplicati,
  normalizza,
  normalizzaCodice,
  proponiAbbinamenti,
  somiglianza,
  type CandidatoEsterno,
  type CandidatoNostro,
} from './integrazione-abbina';

describe('normalizza', () => {
  it('toglie forma societaria e punteggiatura', () => {
    expect(normalizza('FINCANTIERI S.p.A. - Monfalcone')).toBe('fincantieri monfalcone');
  });

  it('toglie gli accenti', () => {
    expect(normalizza('Città Studi')).toBe('citta studi');
  });

  it('regge il vuoto', () => {
    expect(normalizza(null)).toBe('');
  });
});

describe('normalizzaCodice', () => {
  it('ignora separatori e zeri iniziali', () => {
    expect(normalizzaCodice('FPM-0024')).toBe(normalizzaCodice('fpm0024'));
    expect(normalizzaCodice('00123')).toBe('123');
  });
});

describe('somiglianza', () => {
  it('1 per lo stesso nome scritto diversamente', () => {
    expect(somiglianza('FINCANTIERI S.p.A. Monfalcone', 'Fincantieri - Monfalcone')).toBe(1);
  });

  it('0 fra nomi senza parole in comune', () => {
    expect(somiglianza('Ospedale Verona', 'Scuola Trieste')).toBe(0);
  });

  it('le parole corte non contano (via, di, srl)', () => {
    expect(somiglianza('Via Roma', 'Via Milano')).toBe(0);
  });
});

describe('proponiAbbinamenti', () => {
  const nostri: CandidatoNostro[] = [
    { id: 'n1', codice: 'FPM-0024', nome: 'Fincantieri Monfalcone', cliente: 'Fincantieri' },
    { id: 'n2', codice: null, nome: 'Ospedale Borgo Trento', cliente: 'AULSS 9' },
    { id: 'n3', codice: null, nome: 'Qualcosa di mai visto', cliente: null },
  ];
  const esterni: CandidatoEsterno[] = [
    { externalId: '26087', codice: 'FPM0024', nome: 'FINCANTIERI SPA - MONFALCONE', cliente: 'Fincantieri' },
    { externalId: '26088', codice: null, nome: 'Ospedale Borgo Trento', cliente: 'AULSS 9' },
  ];

  it('il codice uguale vince ed e\' certo', () => {
    const r = proponiAbbinamenti(nostri, esterni);
    const n1 = r.find((x) => x.nostroId === 'n1')!;
    expect(n1.externalId).toBe('26087');
    expect(n1.forza).toBe('certo');
    expect(n1.motivo).toContain('stesso codice');
  });

  it('nome e cliente identici → certo anche senza codice', () => {
    const n2 = proponiAbbinamenti(nostri, esterni).find((x) => x.nostroId === 'n2')!;
    expect(n2.externalId).toBe('26088');
    expect(n2.forza).toBe('certo');
  });

  it('aggancia quando il codice del gestionale E\' il suo identificativo', () => {
    // Caso comune: nessun campo "codice" a parte, l'identificativo e' gia' il numero che l'ufficio
    // ha trascritto nel nostro codice_commessa.
    const nn: CandidatoNostro[] = [
      { id: 'x', codice: '26084', nome: 'Tutt\'altra descrizione', cliente: null },
    ];
    const ee: CandidatoEsterno[] = [
      { externalId: '26084', codice: null, nome: 'SESA SPA - FORNITURA QE', cliente: null },
    ];
    const r = proponiAbbinamenti(nn, ee);
    expect(r[0]!.externalId).toBe('26084');
    expect(r[0]!.forza).toBe('certo');
  });

  it('non aggancia su id diversi solo perche\' entrambi numerici', () => {
    const nn: CandidatoNostro[] = [{ id: 'x', codice: '26084', nome: 'Alfa', cliente: null }];
    const ee: CandidatoEsterno[] = [
      { externalId: '99999', codice: null, nome: 'Beta', cliente: null },
    ];
    expect(proponiAbbinamenti(nn, ee)[0]!.externalId).toBeNull();
  });

  it('chi non somiglia a niente resta scoperto invece di essere inventato', () => {
    const n3 = proponiAbbinamenti(nostri, esterni).find((x) => x.nostroId === 'n3')!;
    expect(n3.externalId).toBeNull();
    expect(n3.forza).toBe('nessuno');
  });

  it('NON assegna lo stesso id esterno a due nostri record', () => {
    const due: CandidatoNostro[] = [
      { id: 'a', codice: null, nome: 'Fincantieri Monfalcone', cliente: 'Fincantieri' },
      { id: 'b', codice: null, nome: 'Fincantieri Monfalcone', cliente: 'Fincantieri' },
    ];
    const uno: CandidatoEsterno[] = [
      { externalId: 'X', codice: null, nome: 'Fincantieri Monfalcone', cliente: 'Fincantieri' },
    ];
    const r = proponiAbbinamenti(due, uno);
    const assegnati = r.filter((x) => x.externalId === 'X');
    expect(assegnati).toHaveLength(1);
    expect(r.find((x) => x.externalId === null)).toBeDefined();
  });

  it('l\'abbinamento certo non viene rubato da uno debole che capita prima', () => {
    const nn: CandidatoNostro[] = [
      { id: 'debole', codice: null, nome: 'Fincantieri deposito', cliente: null },
      { id: 'certo', codice: 'A1', nome: 'Tutt\'altro nome', cliente: null },
    ];
    const ee: CandidatoEsterno[] = [
      { externalId: 'E1', codice: 'A1', nome: 'Fincantieri qualcosa', cliente: null },
    ];
    const r = proponiAbbinamenti(nn, ee);
    expect(r.find((x) => x.nostroId === 'certo')!.externalId).toBe('E1');
    expect(r.find((x) => x.nostroId === 'debole')!.externalId).toBeNull();
  });

  it('chi e\' gia\' mappato non viene riproposto, e il suo id esterno resta occupato', () => {
    const r = proponiAbbinamenti(nostri, esterni, [
      { nostroId: 'n1', externalId: '26087' },
    ]);
    expect(r.find((x) => x.nostroId === 'n1')).toBeUndefined();
    expect(r.every((x) => x.externalId !== '26087')).toBe(true);
  });
});

describe('duplicati', () => {
  it('trova lo stesso id esterno scelto due volte', () => {
    const d = duplicati([
      { nostroId: 'a', externalId: 'X' },
      { nostroId: 'b', externalId: 'X' },
      { nostroId: 'c', externalId: 'Y' },
    ]);
    expect(d).toHaveLength(1);
    expect(d[0]!.externalId).toBe('X');
    expect(d[0]!.nostriId.sort()).toEqual(['a', 'b']);
  });

  it('i non collegati non sono duplicati fra loro', () => {
    expect(
      duplicati([
        { nostroId: 'a', externalId: null },
        { nostroId: 'b', externalId: null },
      ]),
    ).toEqual([]);
  });
});
