import { describe, it, expect } from 'vitest';

import {
  categoriaSpesaCanonica,
  risolviCommessa,
} from './integrazione-mappa';

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




