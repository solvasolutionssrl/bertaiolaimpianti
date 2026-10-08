import { describe, expect, it } from 'vitest';

import {
  descriviAssegnazione,
  etichettaNonAssegnato,
  etichettaTecnici,
} from './assegnazione';

describe('etichette', () => {
  it('il tecnico e singolare solo quando e uno', () => {
    expect(etichettaTecnici(1)).toBe('Tecnico assegnato');
    expect(etichettaTecnici(2)).toBe('Tecnici assegnati');
    expect(etichettaTecnici(0)).toBe('Tecnici assegnati');
  });

  it('una richiesta non e assegnata, un task non e assegnato', () => {
    expect(etichettaNonAssegnato('richiesta')).toBe('Non assegnata');
    expect(etichettaNonAssegnato('task')).toBe('Non assegnato');
  });
});

describe('descriviAssegnazione: la riga vuota non si scrive', () => {
  it('con la sola squadra non compare nessun «Responsabile: Nessuno»', () => {
    // E il caso che ha fatto nascere la domanda: girata a un tecnico e basta.
    const righe = descriviAssegnazione({ responsabile: null, tecnici: ['TecnicoDEMO'] });
    expect(righe).toHaveLength(1);
    expect(righe[0]?.etichetta).toBe('Tecnico assegnato');
    expect(righe[0]?.valore).toBe('TecnicoDEMO');
    expect(JSON.stringify(righe)).not.toMatch(/Nessuno/);
  });

  it('con il solo responsabile non compare una riga di tecnici vuota', () => {
    const righe = descriviAssegnazione({ responsabile: 'Erica', tecnici: [] });
    expect(righe).toHaveLength(1);
    expect(righe[0]?.etichetta).toBe('Responsabile');
  });

  it('con tutti e due si legge la catena, nell ordine', () => {
    const righe = descriviAssegnazione({
      responsabile: 'Cristian',
      tecnici: ['Luca', 'Thomas'],
    });
    expect(righe.map((r) => r.etichetta)).toEqual(['Responsabile', 'Tecnici assegnati']);
    expect(righe[1]?.valore).toBe('Luca, Thomas');
  });

  it('con nessuno si dice una volta sola, e si sa che e vuoto', () => {
    const righe = descriviAssegnazione({ responsabile: null, tecnici: [] });
    expect(righe).toHaveLength(1);
    expect(righe[0]?.valore).toBe('Non assegnata');
    expect(righe[0]?.vuoto).toBe(true);
  });

  it('nomi fatti di spazi contano come assenti', () => {
    const righe = descriviAssegnazione({ responsabile: '  ', tecnici: ['', ' '] });
    expect(righe).toHaveLength(1);
    expect(righe[0]?.vuoto).toBe(true);
  });

  it('un task vuoto dice «Assegnato a: Non assegnato»', () => {
    const righe = descriviAssegnazione({ responsabile: null, tecnici: [] }, 'task');
    expect(righe[0]?.etichetta).toBe('Assegnato a');
    expect(righe[0]?.valore).toBe('Non assegnato');
  });
});
