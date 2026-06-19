import { describe, it, expect } from 'vitest';
import { aggregaOre, giornateIncomplete, type RigaAgg, type TimbraturaGiorno } from './kantiere-report';

describe('aggregaOre', () => {
  const righe: RigaAgg[] = [
    { chiaveDipendente: 'D1', chiaveCommessa: 'C1', ore_ordinarie: 5, ore_straordinarie: 1, ore_viaggio: 0.5 },
    { chiaveDipendente: 'D1', chiaveCommessa: 'C2', ore_ordinarie: 3, ore_straordinarie: 0, ore_viaggio: 0 },
    { chiaveDipendente: 'D2', chiaveCommessa: 'C1', ore_ordinarie: 8, ore_straordinarie: 2, ore_viaggio: 1 },
  ];
  it('aggrega per dipendente', () => {
    const m = aggregaOre(righe, 'dipendente');
    expect(m.get('D1')).toEqual({ ordinarie: 8, straordinarie: 1, viaggio: 0.5, totale: 9.5 });
    expect(m.get('D2')).toEqual({ ordinarie: 8, straordinarie: 2, viaggio: 1, totale: 11 });
  });
  it('aggrega per commessa', () => {
    const m = aggregaOre(righe, 'commessa');
    expect(m.get('C1')).toEqual({ ordinarie: 13, straordinarie: 3, viaggio: 1.5, totale: 17.5 });
    expect(m.get('C2')).toEqual({ ordinarie: 3, straordinarie: 0, viaggio: 0, totale: 3 });
  });
  it('vuoto → mappa vuota', () => {
    expect(aggregaOre([], 'dipendente').size).toBe(0);
  });
});

describe('giornateIncomplete', () => {
  it('coppie pari → nessuna anomalia', () => {
    const t: TimbraturaGiorno[] = [
      { dipendente_id: 'D1', commessa_id: 'C1', giorno: '2026-06-22', tipo: 'ingresso' },
      { dipendente_id: 'D1', commessa_id: 'C1', giorno: '2026-06-22', tipo: 'uscita' },
    ];
    expect(giornateIncomplete(t)).toEqual([]);
  });
  it('dispari → anomalia', () => {
    const t: TimbraturaGiorno[] = [
      { dipendente_id: 'D1', commessa_id: 'C1', giorno: '2026-06-22', tipo: 'ingresso' },
      { dipendente_id: 'D1', commessa_id: 'C1', giorno: '2026-06-22', tipo: 'uscita' },
      { dipendente_id: 'D1', commessa_id: 'C1', giorno: '2026-06-22', tipo: 'ingresso' },
    ];
    expect(giornateIncomplete(t)).toEqual([{ dipendente_id: 'D1', commessa_id: 'C1', giorno: '2026-06-22' }]);
  });
  it('separa per giorno/commessa', () => {
    const t: TimbraturaGiorno[] = [
      { dipendente_id: 'D1', commessa_id: 'C1', giorno: '2026-06-22', tipo: 'ingresso' },
      { dipendente_id: 'D1', commessa_id: 'C2', giorno: '2026-06-22', tipo: 'ingresso' },
      { dipendente_id: 'D1', commessa_id: 'C2', giorno: '2026-06-22', tipo: 'uscita' },
    ];
    // C1 dispari (1 ingresso, 0 uscite), C2 pari
    expect(giornateIncomplete(t)).toEqual([{ dipendente_id: 'D1', commessa_id: 'C1', giorno: '2026-06-22' }]);
  });
});
