import { describe, it, expect } from 'vitest';

import {
  MAX_DESCRIZIONE,
  chiaveIdempotenza,
  componiDescrizione,
  dataIt,
  descrizioneOre,
  descrizioneSpesa,
  descrizioneViaggio,
  oreHMM,
  riferimentiMancanti,
  validaPayload,
  type PayloadOperazione,
} from './integrazione';

describe('dataIt', () => {
  it('converte in formato italiano', () => {
    expect(dataIt('2026-08-03')).toBe('03/08/2026');
  });

  it('lascia intatto cio\' che non riconosce', () => {
    expect(dataIt('boh')).toBe('boh');
  });
});

describe('oreHMM', () => {
  it('formatta i minuti come H:MM', () => {
    expect(oreHMM(450)).toBe('7:30');
    expect(oreHMM(60)).toBe('1:00');
    expect(oreHMM(5)).toBe('0:05');
  });

  it('non produce mai negativi', () => {
    expect(oreHMM(-10)).toBe('0:00');
  });
});

describe('componiDescrizione', () => {
  it('salta i segmenti vuoti senza lasciare separatori penzolanti', () => {
    expect(componiDescrizione(['A', null, '', undefined, '  ', 'B'])).toBe('A · B');
  });

  it('tronca oltre il tetto e segnala il taglio', () => {
    const out = componiDescrizione([('x'.repeat(300))]);
    expect(out.length).toBe(MAX_DESCRIZIONE);
    expect(out.endsWith('…')).toBe(true);
  });

  it('non tronca quando sta nel limite', () => {
    expect(componiDescrizione(['breve'])).toBe('breve');
  });
});

describe('descrizioneOre', () => {
  it('mette causale e durata in testa', () => {
    expect(
      descrizioneOre({
        causale: 'straordinario',
        durataMin: 90,
        persona: 'Rossi Mario',
        commessa: 'Fincantieri Monfalcone',
      }),
    ).toBe('Straordinario · 1:30 · Rossi Mario · Fincantieri Monfalcone');
  });

  it('regge l\'assenza dei campi opzionali', () => {
    expect(descrizioneOre({ causale: 'ordinario', durataMin: 480 })).toBe(
      'Ordinario · 8:00',
    );
  });
});

describe('descrizioneViaggio', () => {
  it('compone tratta, persona e ruolo', () => {
    expect(
      descrizioneViaggio({
        data: '2026-08-03',
        km: 50,
        ruolo: 'autista',
        persona: 'Rossi Mario',
        partenza: 'Sede Verona',
        arrivo: 'Fincantieri Monfalcone',
      }),
    ).toBe(
      'Viaggio 03/08/2026 · Rossi Mario (autista) · Sede Verona → Fincantieri Monfalcone · 50 km',
    );
  });

  it('mostra il ruolo anche senza nome — e\' l\'informazione che vale', () => {
    const out = descrizioneViaggio({ data: '2026-08-03', km: 12, ruolo: 'passeggero' });
    expect(out).toContain('(passeggero)');
    expect(out).toContain('12 km');
  });

  it('con una sola estremita\' nota non stampa la freccia', () => {
    const out = descrizioneViaggio({
      data: '2026-08-03',
      km: 30,
      ruolo: 'autista',
      arrivo: 'Cantiere Trieste',
    });
    expect(out).toContain('Cantiere Trieste');
    expect(out).not.toContain('→');
  });
});

describe('descrizioneSpesa', () => {
  it('compone fornitore, persona e cantiere', () => {
    expect(
      descrizioneSpesa({
        data: '2026-08-03',
        categoria: 'ristorante',
        fornitore: 'Ristorante La Borsa',
        persona: 'Rossi Mario',
        numPersone: 2,
        commessa: 'Fincantieri Monfalcone',
      }),
    ).toBe(
      'Pasto 03/08/2026 · Ristorante La Borsa · Rossi Mario · 2 pers. · Fincantieri Monfalcone',
    );
  });

  it('tace il numero di persone quando e\' una sola', () => {
    const out = descrizioneSpesa({
      data: '2026-08-03',
      categoria: 'albergo',
      fornitore: 'Hotel Centrale',
      numPersone: 1,
    });
    expect(out).toBe('Pernottamento 03/08/2026 · Hotel Centrale');
  });
});

describe('chiaveIdempotenza', () => {
  it('e\' stabile per la stessa riga di origine', () => {
    const a = chiaveIdempotenza('spesa', 'spese', 'abc-123');
    const b = chiaveIdempotenza('spesa', 'spese', 'abc-123');
    expect(a).toBe(b);
  });

  it('distingue tabelle di origine diverse con lo stesso id', () => {
    expect(chiaveIdempotenza('km', 'timbratura_viaggio', 'x')).not.toBe(
      chiaveIdempotenza('km', 'spese', 'x'),
    );
  });

  it('distingue le causali nate dalla stessa riga di rapportino', () => {
    const ord = chiaveIdempotenza('ore', 'rapportino_righe', 'r1', 'ordinario');
    const stra = chiaveIdempotenza('ore', 'rapportino_righe', 'r1', 'straordinario');
    const via = chiaveIdempotenza('ore', 'rapportino_righe', 'r1', 'viaggio');
    expect(new Set([ord, stra, via]).size).toBe(3);
  });

  it('senza variante resta la chiave semplice', () => {
    expect(chiaveIdempotenza('spesa', 'spese', 'abc')).toBe('spesa:spese:abc');
  });
});

describe('riferimentiMancanti', () => {
  const ore: PayloadOperazione = {
    tipo: 'ore',
    data: '2026-08-03',
    durataMin: 480,
    causale: 'ordinario',
    descrizione: 'x',
    rif: { dipendente: '4', commessa: '26087' },
  };

  it('vuoto quando c\'e\' tutto', () => {
    expect(riferimentiMancanti(ore)).toEqual([]);
  });

  it('segnala il dipendente non collegato', () => {
    expect(riferimentiMancanti({ ...ore, rif: { commessa: '26087' } })).toEqual([
      'dipendente',
    ]);
  });

  it('tratta la stringa vuota come mancante, non come valore', () => {
    expect(
      riferimentiMancanti({ ...ore, rif: { dipendente: '', commessa: '26087' } }),
    ).toEqual(['dipendente']);
  });

  it('per le spese basta la commessa: il cliente non e\' un requisito universale', () => {
    const spesa: PayloadOperazione = {
      tipo: 'spesa',
      data: '2026-08-03',
      categoria: 'ristorante',
      importoEur: 45,
      descrizione: 'x',
      rif: {},
    };
    expect(riferimentiMancanti(spesa)).toEqual(['commessa']);
  });

  it('il gestionale puo\' aggiungere requisiti propri (es. il cliente sui documenti)', () => {
    const spesa: PayloadOperazione = {
      tipo: 'spesa',
      data: '2026-08-03',
      categoria: 'ristorante',
      importoEur: 45,
      descrizione: 'x',
      rif: { commessa: '26087' },
    };
    expect(riferimentiMancanti(spesa)).toEqual([]);
    expect(riferimentiMancanti(spesa, { spesa: ['cliente'] })).toEqual(['cliente']);
  });

  it('non duplica un requisito gia\' minimo', () => {
    const ore2: PayloadOperazione = { ...ore, rif: {} };
    expect(riferimentiMancanti(ore2, { ore: ['commessa'] }).sort()).toEqual([
      'commessa',
      'dipendente',
    ]);
  });
});

describe('validaPayload', () => {
  const base: PayloadOperazione = {
    tipo: 'spesa',
    data: '2026-08-03',
    categoria: 'ristorante',
    importoEur: 45,
    descrizione: 'Pasto',
    rif: { commessa: '26087', cliente: '70796' },
  };

  it('accetta un payload completo', () => {
    expect(validaPayload(base)).toEqual([]);
  });

  it('rifiuta un timestamp al posto della data secca', () => {
    const err = validaPayload({ ...base, data: '2026-08-03T10:00:00Z' });
    expect(err.some((e) => e.includes('YYYY-MM-DD'))).toBe(true);
  });

  it('rifiuta importo zero o negativo', () => {
    expect(validaPayload({ ...base, importoEur: 0 }).length).toBeGreaterThan(0);
    expect(validaPayload({ ...base, importoEur: -5 }).length).toBeGreaterThan(0);
  });

  it('rifiuta durata nulla sulle ore', () => {
    const err = validaPayload({
      tipo: 'ore',
      data: '2026-08-03',
      durataMin: 0,
      causale: 'ordinario',
      descrizione: 'x',
      rif: { dipendente: '4', commessa: '26087' },
    });
    expect(err.some((e) => e.includes('durata'))).toBe(true);
  });

  it('riporta le anagrafiche non collegate', () => {
    const err = validaPayload({ ...base, rif: {} });
    expect(err.some((e) => e.includes('anagrafiche non collegate'))).toBe(true);
  });
});
