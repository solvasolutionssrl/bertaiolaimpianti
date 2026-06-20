import { describe, it, expect } from 'vitest';
import {
  risolviRegoleEffettive,
  calcolaCostoGiornata,
  aggregaCosti,
  festivitaItaliane,
  calcolaPasqua,
  eFestivo,
  eWeekend,
  giornoSettimanaISO,
  risolviMaggiorazione,
  calcolaCostoGiornataCond,
  type RegolaOre,
  type RegolaAmbito,
  type RigaCosto,
  type RegolaCond,
} from './kantiere-costi';

function rc(p: Partial<RegolaCond> & Pick<RegolaCond, 'id' | 'maggiorazione_pct'>): RegolaCond {
  return {
    nome: p.nome ?? p.id,
    attiva: p.attiva ?? true,
    priorita: p.priorita ?? 100,
    giorni_settimana: p.giorni_settimana ?? null,
    ora_da: p.ora_da ?? null,
    ora_a: p.ora_a ?? null,
    festivo_match: p.festivo_match ?? 'qualsiasi',
    applica_a: p.applica_a ?? 'tutte',
    a_turni: p.a_turni ?? 'qualsiasi',
    params: p.params ?? {},
    ...p,
  };
}

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

describe('giornoSettimanaISO', () => {
  it('lun=1 .. dom=7', () => {
    expect(giornoSettimanaISO('2026-06-22')).toBe(1); // lunedì
    expect(giornoSettimanaISO('2026-06-27')).toBe(6); // sabato
    expect(giornoSettimanaISO('2026-06-28')).toBe(7); // domenica
  });
});

describe('risolviMaggiorazione — regola più specifica vince (no somma)', () => {
  const REGOLE: RegolaCond[] = [
    rc({ id: 'str', applica_a: 'straordinario', maggiorazione_pct: 30, nome: 'Straordinario' }),
    rc({ id: 'fest', festivo_match: 'solo_festivo', maggiorazione_pct: 50, nome: 'Festivo' }),
    rc({ id: 'strfest', applica_a: 'straordinario', festivo_match: 'solo_festivo', maggiorazione_pct: 55, nome: 'Straord. festivo' }),
    rc({ id: 'sab', giorni_settimana: [6], maggiorazione_pct: 50, nome: 'Sabato' }),
  ];
  it('straord in giorno festivo → straordinario festivo (55), non somma', () => {
    expect(risolviMaggiorazione(REGOLE, { giornoSettimana: 3, festivo: true, aTurni: false, tier: 'straordinario' })?.pct).toBe(55);
  });
  it('straord in giorno feriale → straordinario (30)', () => {
    expect(risolviMaggiorazione(REGOLE, { giornoSettimana: 3, festivo: false, aTurni: false, tier: 'straordinario' })?.pct).toBe(30);
  });
  it('ordinario di sabato → regola sabato (50)', () => {
    expect(risolviMaggiorazione(REGOLE, { giornoSettimana: 6, festivo: false, aTurni: false, tier: 'ordinario' })?.pct).toBe(50);
  });
  it('ordinario feriale senza regole applicabili → null', () => {
    expect(risolviMaggiorazione(REGOLE, { giornoSettimana: 2, festivo: false, aTurni: false, tier: 'ordinario' })).toBeNull();
  });
});

describe('a turni: la regola seleziona la tariffa', () => {
  const REGOLE: RegolaCond[] = [
    rc({ id: 'n_no', ora_da: '22:00', ora_a: '06:00', a_turni: 'no', applica_a: 'straordinario', maggiorazione_pct: 50 }),
    rc({ id: 'n_si', ora_da: '22:00', ora_a: '06:00', a_turni: 'si', applica_a: 'straordinario', maggiorazione_pct: 40 }),
  ];
  it('notturno solo se ctx.notturno=true; a turni sceglie 40 vs 50', () => {
    expect(risolviMaggiorazione(REGOLE, { giornoSettimana: 1, festivo: false, aTurni: false, tier: 'straordinario', notturno: true })?.pct).toBe(50);
    expect(risolviMaggiorazione(REGOLE, { giornoSettimana: 1, festivo: false, aTurni: true, tier: 'straordinario', notturno: true })?.pct).toBe(40);
    expect(risolviMaggiorazione(REGOLE, { giornoSettimana: 1, festivo: false, aTurni: false, tier: 'straordinario', notturno: false })).toBeNull();
  });
});

describe('calcolaCostoGiornataCond — split prime2/successive', () => {
  const REGOLE: RegolaCond[] = [
    rc({ id: 'p2', applica_a: 'straordinario', params: { tier: 'prime2' }, maggiorazione_pct: 25 }),
    rc({ id: 'succ', applica_a: 'straordinario', params: { tier: 'successive' }, maggiorazione_pct: 30 }),
  ];
  it('8 ord + 3 straord → prime2 al 25%, 1 successiva al 30%', () => {
    const r = calcolaCostoGiornataCond({
      chiaveDipendente: 'd', chiaveCommessa: 'c',
      ore_ordinarie: 8, ore_straordinarie: 3, ore_viaggio: 0,
      giornoSettimana: 2, festivo: false, aTurni: false,
      pctViaggio: 15, costoOrario: 10, regole: REGOLE,
    });
    // 8 + 2*1.25 + 1*1.30 = 11.8 ; costo = 118
    expect(r.ore_pesate).toBe(11.8);
    expect(r.costo_totale).toBe(118);
  });
});
