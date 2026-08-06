import { describe, it, expect } from 'vitest';

import {
  categoriaSpesaCanonica,
  operazioneDaSpesa,
  operazioneDaViaggio,
  operazioniDaRigaRapportino,
  risolviCommessa,
  soloData,
  type RigaRapportinoDominio,
  type SpesaDominio,
  type ViaggioDominio,
} from './integrazione-mappa';

const RIF = { commessa: '26087', cliente: '70796', dipendente: '4' };

describe('risolviCommessa', () => {
  it('mondo Kantiere: legge cantiere_id e punta alla tabella cantieri', () => {
    expect(risolviCommessa({ cantiere_id: 'c-1', commessa_id: null }, 'kantiere')).toEqual(
      { entita: 'cantiere', id: 'c-1', daFallback: false },
    );
  });

  it('mondo Kommessa: legge commessa_id e punta alla tabella commesse', () => {
    expect(risolviCommessa({ cantiere_id: null, commessa_id: 'm-1' }, 'kommessa')).toEqual(
      { entita: 'commessa', id: 'm-1', daFallback: false },
    );
  });

  it('ripiega sull\'altra colonna segnalandolo, invece di perdere la riga', () => {
    expect(risolviCommessa({ cantiere_id: null, commessa_id: 'm-1' }, 'kantiere')).toEqual(
      { entita: 'commessa', id: 'm-1', daFallback: true },
    );
    expect(risolviCommessa({ cantiere_id: 'c-1', commessa_id: null }, 'kommessa')).toEqual(
      { entita: 'cantiere', id: 'c-1', daFallback: true },
    );
  });

  it('mondo full: preferisce il cantiere, perche\' e\' li\' che vivono le ore', () => {
    expect(risolviCommessa({ cantiere_id: 'c-1', commessa_id: 'm-1' }, 'full')).toEqual({
      entita: 'cantiere',
      id: 'c-1',
      daFallback: false,
    });
  });

  it('con entrambe valorizzate non sceglie mai a caso', () => {
    expect(risolviCommessa({ cantiere_id: 'c-1', commessa_id: 'm-1' }, 'kommessa')).toEqual(
      { entita: 'commessa', id: 'm-1', daFallback: false },
    );
  });

  it('nessuna delle due → null, la riga non si accoda', () => {
    expect(risolviCommessa({ cantiere_id: null, commessa_id: null }, 'kantiere')).toBeNull();
    expect(risolviCommessa({}, 'kantiere')).toBeNull();
  });

  it('la stringa vuota non e\' un id', () => {
    expect(risolviCommessa({ cantiere_id: '  ', commessa_id: null }, 'kantiere')).toBeNull();
  });
});

describe('categoriaSpesaCanonica', () => {
  it('accorpa hotel su albergo e bar sui pasti', () => {
    expect(categoriaSpesaCanonica('hotel')).toBe('albergo');
    expect(categoriaSpesaCanonica('bar')).toBe('ristorante');
    expect(categoriaSpesaCanonica('ristorante')).toBe('ristorante');
    expect(categoriaSpesaCanonica('carburante')).toBe('carburante');
  });

  it('tutto cio\' che non conosce finisce in altro, senza esplodere', () => {
    expect(categoriaSpesaCanonica('varie')).toBe('altro');
    expect(categoriaSpesaCanonica(null)).toBe('altro');
    expect(categoriaSpesaCanonica('qualcosa-di-nuovo')).toBe('altro');
  });
});

describe('soloData', () => {
  it('taglia la parte oraria', () => {
    expect(soloData('2026-08-03T14:22:10.000Z')).toBe('2026-08-03');
  });
});

describe('operazioneDaSpesa', () => {
  const base: SpesaDominio = {
    id: 'sp-1',
    categoria: 'ristorante',
    ragione_sociale: 'Ristorante La Borsa',
    importo_totale: '45.00',
    numero_persone: 2,
    data_scontrino: '2026-08-03T12:30:00.000Z',
    created_at: '2026-08-04T09:00:00.000Z',
    stato: 'confermata',
  };

  it('costruisce il payload con descrizione autoesplicativa', () => {
    const op = operazioneDaSpesa(base, RIF, {
      persona: 'Rossi Mario',
      commessa: 'Fincantieri Monfalcone',
    });
    expect(op).not.toBeNull();
    expect(op!.payload).toMatchObject({
      tipo: 'spesa',
      data: '2026-08-03',
      categoria: 'ristorante',
      importoEur: 45,
    });
    expect(op!.payload.descrizione).toBe(
      'Pasto 03/08/2026 · Ristorante La Borsa · Rossi Mario · 2 pers. · Fincantieri Monfalcone',
    );
    expect(op!.idempotencyKey).toBe('spesa:spese:sp-1');
  });

  it('NON accoda una spesa in bozza: sul gestionale non si potrebbe correggere', () => {
    expect(operazioneDaSpesa({ ...base, stato: 'bozza' }, RIF, {})).toBeNull();
  });

  it('scarta importi non validi', () => {
    expect(operazioneDaSpesa({ ...base, importo_totale: 0 }, RIF, {})).toBeNull();
    expect(operazioneDaSpesa({ ...base, importo_totale: -10 }, RIF, {})).toBeNull();
  });

  it('ripiega su created_at se manca la data dello scontrino', () => {
    const op = operazioneDaSpesa({ ...base, data_scontrino: null }, RIF, {});
    expect(op!.payload.data).toBe('2026-08-04');
  });
});

describe('operazioniDaRigaRapportino', () => {
  const riga: RigaRapportinoDominio = {
    id: 'rr-1',
    cantiere_id: 'c-1',
    ore_ordinarie: 8,
    ore_straordinarie: 1.5,
    ore_viaggio: 0.5,
    note: null,
  };

  it('produce una registrazione per causale, mai sommate', () => {
    const ops = operazioniDaRigaRapportino(riga, '2026-08-03', RIF, {
      persona: 'Rossi Mario',
      commessa: 'Fincantieri Monfalcone',
    });
    expect(ops).toHaveLength(3);
    expect(ops.map((o) => (o.payload as { causale: string }).causale)).toEqual([
      'ordinario',
      'straordinario',
      'viaggio',
    ]);
    expect(ops.map((o) => (o.payload as { durataMin: number }).durataMin)).toEqual([
      480, 90, 30,
    ]);
  });

  it('ogni causale ha una chiave diversa, altrimenti si perderebbero', () => {
    const ops = operazioniDaRigaRapportino(riga, '2026-08-03', RIF, {});
    expect(new Set(ops.map((o) => o.idempotencyKey)).size).toBe(3);
  });

  it('salta le causali a zero', () => {
    const ops = operazioniDaRigaRapportino(
      { ...riga, ore_straordinarie: 0, ore_viaggio: 0 },
      '2026-08-03',
      RIF,
      {},
    );
    expect(ops).toHaveLength(1);
    expect((ops[0]!.payload as { causale: string }).causale).toBe('ordinario');
  });

  it('una riga tutta a zero non genera niente', () => {
    const ops = operazioniDaRigaRapportino(
      { ...riga, ore_ordinarie: 0, ore_straordinarie: 0, ore_viaggio: 0 },
      '2026-08-03',
      RIF,
      {},
    );
    expect(ops).toEqual([]);
  });

  it('regge i numerici che arrivano come stringa da Postgres', () => {
    const ops = operazioniDaRigaRapportino(
      { ...riga, ore_ordinarie: '7.25', ore_straordinarie: '0', ore_viaggio: '0' },
      '2026-08-03',
      RIF,
      {},
    );
    expect((ops[0]!.payload as { durataMin: number }).durataMin).toBe(435);
  });

  it('riporta la nota della riga in coda alla descrizione', () => {
    const ops = operazioniDaRigaRapportino(
      { ...riga, ore_straordinarie: 0, ore_viaggio: 0, note: 'montaggio quadro' },
      '2026-08-03',
      RIF,
      { persona: 'Rossi Mario' },
    );
    expect(ops[0]!.payload.descrizione).toContain('montaggio quadro');
  });
});

describe('operazioneDaViaggio', () => {
  const viaggio: ViaggioDominio = {
    id: 'v-1',
    distanza_km: '50',
    autista: true,
    direzione: 'andata',
    data: '2026-08-03',
    cantiere_id: 'c-1',
  };

  it('accoda i km dell\'autista con la tratta nella descrizione', () => {
    const op = operazioneDaViaggio(viaggio, '2026-08-03', RIF, {
      persona: 'Rossi Mario',
      partenza: 'Sede Verona',
      arrivo: 'Fincantieri Monfalcone',
    });
    expect(op!.payload).toMatchObject({ tipo: 'km', km: 50, ruolo: 'autista' });
    expect(op!.payload.descrizione).toBe(
      'Viaggio 03/08/2026 · Rossi Mario (autista) · Sede Verona → Fincantieri Monfalcone · 50 km',
    );
  });

  it('NON accoda il passeggero: l\'auto non gli e\' costata nulla', () => {
    expect(
      operazioneDaViaggio({ ...viaggio, autista: false }, '2026-08-03', RIF, {}),
    ).toBeNull();
  });

  it('scarta i tragitti senza chilometraggio', () => {
    expect(
      operazioneDaViaggio({ ...viaggio, distanza_km: null }, '2026-08-03', RIF, {}),
    ).toBeNull();
    expect(
      operazioneDaViaggio({ ...viaggio, distanza_km: 0 }, '2026-08-03', RIF, {}),
    ).toBeNull();
  });
});
