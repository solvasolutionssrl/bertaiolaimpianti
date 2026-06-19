import { describe, it, expect } from 'vitest';
import {
  risolviRegoleEffettive,
  calcolaCostoGiornata,
  aggregaCosti,
  festivitaItaliane,
  calcolaPasqua,
  eFestivo,
  eWeekend,
  type RegolaOre,
  type RegolaAmbito,
  type RigaCosto,
} from './kantiere-costi';

function regola(p: Partial<RegolaOre> & Pick<RegolaOre, 'id' | 'tipo'>): RegolaOre {
  return {
    nome: p.tipo,
    attiva: true,
    params: {},
    maggiorazione_pct: 0,
    priorita: 100,
    ...p,
  };
}

describe('risolviRegoleEffettive', () => {
  it('regola senza ambiti = tenant-wide, vale per tutti', () => {
    const regole = [regola({ id: 'r1', tipo: 'maggiorazione_straordinario', maggiorazione_pct: 25 })];
    const eff = risolviRegoleEffettive(regole, [], { dipendenteId: 'D1', cantiereId: 'C1' });
    expect(eff.get('maggiorazione_straordinario')?.id).toBe('r1');
  });

  it('ignora le regole non attive', () => {
    const regole = [regola({ id: 'r1', tipo: 'festivo', attiva: false })];
    const eff = risolviRegoleEffettive(regole, [], { dipendenteId: 'D1' });
    expect(eff.has('festivo')).toBe(false);
  });

  it('scope dipendente vince su scope tenant per lo stesso tipo', () => {
    const regole = [
      regola({ id: 'rt', tipo: 'maggiorazione_straordinario', maggiorazione_pct: 25 }),
      regola({ id: 'rd', tipo: 'maggiorazione_straordinario', maggiorazione_pct: 40 }),
    ];
    const ambiti: RegolaAmbito[] = [
      { regola_id: 'rt', tipo_target: 'tenant', target_id: null },
      { regola_id: 'rd', tipo_target: 'dipendente', target_id: 'D1' },
    ];
    const eff = risolviRegoleEffettive(regole, ambiti, { dipendenteId: 'D1' });
    expect(eff.get('maggiorazione_straordinario')?.id).toBe('rd');
  });

  it('scope cantiere vince su tenant ma perde su dipendente', () => {
    const regole = [
      regola({ id: 'rt', tipo: 'weekend' }),
      regola({ id: 'rc', tipo: 'weekend' }),
      regola({ id: 'rd', tipo: 'weekend' }),
    ];
    const ambiti: RegolaAmbito[] = [
      { regola_id: 'rt', tipo_target: 'tenant', target_id: null },
      { regola_id: 'rc', tipo_target: 'cantiere', target_id: 'C1' },
      { regola_id: 'rd', tipo_target: 'dipendente', target_id: 'D1' },
    ];
    expect(
      risolviRegoleEffettive(regole, ambiti, { cantiereId: 'C1' }).get('weekend')?.id,
    ).toBe('rc');
    expect(
      risolviRegoleEffettive(regole, ambiti, { dipendenteId: 'D1', cantiereId: 'C1' }).get('weekend')?.id,
    ).toBe('rd');
  });

  it("scarta ambiti non pertinenti (regola per un altro dipendente)", () => {
    const regole = [regola({ id: 'rd', tipo: 'festivo' })];
    const ambiti: RegolaAmbito[] = [{ regola_id: 'rd', tipo_target: 'dipendente', target_id: 'ALTRO' }];
    const eff = risolviRegoleEffettive(regole, ambiti, { dipendenteId: 'D1' });
    expect(eff.has('festivo')).toBe(false);
  });

  it('a parità di scope vince la priorità più alta', () => {
    const regole = [
      regola({ id: 'a', tipo: 'viaggio' as never, maggiorazione_pct: 10, priorita: 100 }),
      regola({ id: 'b', tipo: 'viaggio' as never, maggiorazione_pct: 99, priorita: 200 }),
    ];
    const eff = risolviRegoleEffettive(regole as RegolaOre[], [], {});
    expect(eff.get('viaggio' as never)?.id).toBe('b');
  });
});

describe('calcolaCostoGiornata', () => {
  const regole = risolviRegoleEffettive(
    [
      regola({ id: 's', tipo: 'maggiorazione_straordinario', maggiorazione_pct: 25 }),
      regola({ id: 'v', tipo: 'maggiorazione_viaggio', maggiorazione_pct: 15 }),
      regola({ id: 'w', tipo: 'weekend', maggiorazione_pct: 50 }),
      regola({ id: 'f', tipo: 'festivo', maggiorazione_pct: 50 }),
    ],
    [],
    {},
  );

  it('solo ordinarie → ore pesate = ore, costo = ore×tariffa', () => {
    const r = calcolaCostoGiornata({
      chiaveDipendente: 'D',
      chiaveCommessa: 'C',
      ore_ordinarie: 8,
      ore_straordinarie: 0,
      ore_viaggio: 0,
      costoOrario: 20,
      regole,
    });
    expect(r.ore_pesate).toBe(8);
    expect(r.costo_totale).toBe(160);
  });

  it('applica la maggiorazione straordinario alle ore pesate e al costo', () => {
    const r = calcolaCostoGiornata({
      chiaveDipendente: 'D',
      chiaveCommessa: 'C',
      ore_ordinarie: 8,
      ore_straordinarie: 2,
      ore_viaggio: 0,
      costoOrario: 20,
      regole,
    });
    // 8 + 2×1.25 = 10.5 ore pesate
    expect(r.ore_pesate).toBe(10.5);
    expect(r.costo_totale).toBe(210);
  });

  it('viaggio +15%, weekend +50%, festivo +50% si sommano', () => {
    const r = calcolaCostoGiornata({
      chiaveDipendente: 'D',
      chiaveCommessa: 'C',
      ore_ordinarie: 0,
      ore_straordinarie: 0,
      ore_viaggio: 2,
      ore_weekend: 4,
      ore_festivo: 1,
      costoOrario: 10,
      regole,
    });
    // 2×1.15 + 4×1.5 + 1×1.5 = 2.3 + 6 + 1.5 = 9.8
    expect(r.ore_pesate).toBe(9.8);
    expect(r.costo_totale).toBe(98);
  });

  it('costo orario null → costo_totale null, ore pesate comunque calcolate', () => {
    const r = calcolaCostoGiornata({
      chiaveDipendente: 'D',
      chiaveCommessa: 'C',
      ore_ordinarie: 8,
      ore_straordinarie: 2,
      ore_viaggio: 0,
      costoOrario: null,
      regole,
    });
    expect(r.costo_totale).toBeNull();
    expect(r.ore_pesate).toBe(10.5);
  });

  it('nessuna regola → moltiplicatori a 1 (nessuna maggiorazione)', () => {
    const r = calcolaCostoGiornata({
      chiaveDipendente: 'D',
      chiaveCommessa: 'C',
      ore_ordinarie: 4,
      ore_straordinarie: 4,
      ore_viaggio: 2,
      costoOrario: 10,
      regole: new Map(),
    });
    expect(r.ore_pesate).toBe(10);
    expect(r.costo_totale).toBe(100);
  });
});

describe('aggregaCosti', () => {
  const righe: RigaCosto[] = [
    {
      chiaveDipendente: 'Mario',
      chiaveCommessa: 'C1',
      ore_ordinarie: 8,
      ore_straordinarie: 0,
      ore_viaggio: 0,
      ore_weekend: 0,
      ore_festivo: 0,
      ore_pesate: 8,
      costo_totale: 160,
    },
    {
      chiaveDipendente: 'Mario',
      chiaveCommessa: 'C2',
      ore_ordinarie: 2,
      ore_straordinarie: 2,
      ore_viaggio: 0,
      ore_weekend: 0,
      ore_festivo: 0,
      ore_pesate: 4.5,
      costo_totale: 90,
    },
    {
      chiaveDipendente: 'Luigi',
      chiaveCommessa: 'C1',
      ore_ordinarie: 8,
      ore_straordinarie: 0,
      ore_viaggio: 0,
      ore_weekend: 0,
      ore_festivo: 0,
      ore_pesate: 8,
      costo_totale: null,
    },
  ];

  it('aggrega per dipendente sommando ore e costi', () => {
    const agg = aggregaCosti(righe, 'dipendente');
    expect(agg.get('Mario')).toMatchObject({ ore_pesate: 12.5, costo_totale: 250, ore_ordinarie: 10 });
  });

  it('aggrega per commessa', () => {
    const agg = aggregaCosti(righe, 'commessa');
    expect(agg.get('C1')?.ore_pesate).toBe(16);
  });

  it('gruppo senza alcun costo → costo_totale null', () => {
    const agg = aggregaCosti(righe, 'dipendente');
    expect(agg.get('Luigi')?.costo_totale).toBeNull();
  });

  it('riga senza costo non azzera il costo del gruppo', () => {
    const mix: RigaCosto[] = [
      { ...righe[0]!, chiaveDipendente: 'X', costo_totale: 100 },
      { ...righe[2]!, chiaveDipendente: 'X', costo_totale: null },
    ];
    expect(aggregaCosti(mix, 'dipendente').get('X')?.costo_totale).toBe(100);
  });
});

describe('festivitaItaliane / Pasqua', () => {
  it('Pasqua 2026 = 5 aprile', () => {
    expect(calcolaPasqua(2026)).toEqual({ mese: 4, giorno: 5 });
  });
  it('Pasqua 2025 = 20 aprile', () => {
    expect(calcolaPasqua(2025)).toEqual({ mese: 4, giorno: 20 });
  });
  it('Pasqua 2024 = 31 marzo', () => {
    expect(calcolaPasqua(2024)).toEqual({ mese: 3, giorno: 31 });
  });

  it('include le fisse nazionali', () => {
    const f = festivitaItaliane(2026);
    for (const d of ['2026-01-01', '2026-01-06', '2026-04-25', '2026-05-01', '2026-06-02', '2026-08-15', '2026-11-01', '2026-12-08', '2026-12-25', '2026-12-26']) {
      expect(f.has(d)).toBe(true);
    }
  });

  it('include Pasqua e Pasquetta 2026', () => {
    const f = festivitaItaliane(2026);
    expect(f.has('2026-04-05')).toBe(true); // Pasqua
    expect(f.has('2026-04-06')).toBe(true); // Pasquetta
  });

  it('eFestivo riconosce Natale e nega un feriale qualunque', () => {
    expect(eFestivo('2026-12-25')).toBe(true);
    expect(eFestivo('2026-07-15')).toBe(false);
  });
});

describe('eWeekend', () => {
  it('sabato e domenica → true', () => {
    expect(eWeekend('2026-06-20')).toBe(true); // sabato
    expect(eWeekend('2026-06-21')).toBe(true); // domenica
  });
  it('giorni feriali → false', () => {
    expect(eWeekend('2026-06-19')).toBe(false); // venerdì
    expect(eWeekend('2026-06-22')).toBe(false); // lunedì
  });
});
