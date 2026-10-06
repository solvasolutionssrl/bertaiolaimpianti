import { describe, expect, it } from 'vitest';

import {
  PRIORITA,
  PRIORITA_DEFAULT,
  PRIORITA_DISMESSE,
  PRIORITA_IN_ORDINE,
  PRIORITA_META,
  confrontaPriorita,
  ePrioritaViva,
  etichettaPriorita,
  metaPriorita,
  normalizzaPriorita,
  parolaPriorita,
  pesoPriorita,
  type Priorita,
} from './priorita';

describe('la scala', () => {
  it('ha tre livelli, dall’urgente al normale', () => {
    expect(PRIORITA).toEqual(['urgente', 'alta', 'bassa']);
  });

  it('parte da «3 - Bassa» quando nessuno sceglie', () => {
    expect(PRIORITA_DEFAULT).toBe('bassa');
  });

  it('numera da 1 a 3 senza buchi né doppioni', () => {
    const numeri = PRIORITA.map((p) => PRIORITA_META[p].numero);
    expect(numeri).toEqual([1, 2, 3]);
  });

  it('scrive il numero dentro l’etichetta', () => {
    expect(etichettaPriorita('urgente')).toBe('1 - Urgente');
    expect(etichettaPriorita('alta')).toBe('2 - Alta');
    expect(etichettaPriorita('bassa')).toBe('3 - Bassa');
  });

  it('tiene la forma corta per i punti stretti', () => {
    expect(parolaPriorita('urgente')).toBe('Urgente');
    expect(parolaPriorita('bassa')).toBe('Bassa');
  });

  it('non lascia nessun livello senza icona e senza pastiglia', () => {
    for (const p of PRIORITA) {
      const m = PRIORITA_META[p];
      expect(m.icona).toBeTruthy();
      expect(m.chip.length).toBeGreaterThan(0);
      expect(m.punto.length).toBeGreaterThan(0);
    }
  });

  it('spegne il livello 3: nessun colore acceso sulla condizione normale', () => {
    // È la regola di lettura della board: l'occhio deve cadere su 1 e 2.
    expect(PRIORITA_META.bassa.chip).toContain('muted');
    expect(PRIORITA_META.bassa.anello).toBe('');
  });
});

describe('normalizzaPriorita — la traduzione del vecchio', () => {
  it('traduce «media» in «bassa»: era il default, cioè l’assenza di scelta', () => {
    expect(normalizzaPriorita('media')).toBe('bassa');
  });

  it('dichiara «media» fra i valori dismessi', () => {
    expect(PRIORITA_DISMESSE).toContain('media');
  });

  it('lascia intatti i tre livelli vivi', () => {
    expect(normalizzaPriorita('urgente')).toBe('urgente');
    expect(normalizzaPriorita('alta')).toBe('alta');
    expect(normalizzaPriorita('bassa')).toBe('bassa');
  });

  it('non si lascia fermare da spazi e maiuscole', () => {
    expect(normalizzaPriorita('  URGENTE ')).toBe('urgente');
    expect(normalizzaPriorita('Alta')).toBe('alta');
  });

  it('non solleva mai, qualunque cosa arrivi dal database', () => {
    for (const sporco of [null, undefined, '', 42, {}, [], true, 'critica']) {
      expect(() => normalizzaPriorita(sporco)).not.toThrow();
      expect(PRIORITA).toContain(normalizzaPriorita(sporco));
    }
  });

  it('manda l’ignoto sul livello che non grida, non su quello che grida', () => {
    // Un valore sconosciuto non deve mai apparire come urgente: sarebbe un
    // falso allarme in cima alla lista di qualcuno.
    expect(normalizzaPriorita('boh')).toBe('bassa');
  });
});

describe('ePrioritaViva', () => {
  it('riconosce solo i tre livelli, senza normalizzare', () => {
    expect(ePrioritaViva('urgente')).toBe(true);
    expect(ePrioritaViva('media')).toBe(false);
    expect(ePrioritaViva(null)).toBe(false);
  });
});

describe('ordinamento', () => {
  it('pesa 1 l’urgente e 3 la bassa', () => {
    expect(pesoPriorita('urgente')).toBe(1);
    expect(pesoPriorita('alta')).toBe(2);
    expect(pesoPriorita('bassa')).toBe(3);
  });

  it('dà a «media» lo stesso peso di «bassa»', () => {
    expect(pesoPriorita('media')).toBe(pesoPriorita('bassa'));
  });

  it('mette le urgenti davanti', () => {
    const righe = ['bassa', 'urgente', 'media', 'alta'];
    expect([...righe].sort(confrontaPriorita)).toEqual([
      'urgente',
      'alta',
      'bassa',
      'media',
    ]);
  });

  it('non decide nulla a parità, lasciando il campo al criterio successivo', () => {
    expect(confrontaPriorita('alta', 'alta')).toBe(0);
    // È ciò che permette `.sort((a,b) => confrontaPriorita(...) || perScadenza(...))`
    expect(confrontaPriorita('media', 'bassa')).toBe(0);
  });

  it('è un ordinamento stabile sui pari merito', () => {
    const righe: Array<{ p: Priorita; id: number }> = [
      { p: 'alta', id: 1 },
      { p: 'urgente', id: 2 },
      { p: 'alta', id: 3 },
    ];
    const ordinate = [...righe].sort((a, b) => confrontaPriorita(a.p, b.p));
    expect(ordinate.map((r) => r.id)).toEqual([2, 1, 3]);
  });
});

describe('PRIORITA_IN_ORDINE — quello che si mostra nei selettori', () => {
  it('elenca i tre livelli dall’urgente al normale', () => {
    expect(PRIORITA_IN_ORDINE.map((m) => m.valore)).toEqual([
      'urgente',
      'alta',
      'bassa',
    ]);
  });

  it('porta con sé etichetta, numero e icona già pronti', () => {
    expect(PRIORITA_IN_ORDINE[0]).toMatchObject({
      numero: 1,
      etichetta: '1 - Urgente',
      icona: 'Flame',
    });
  });
});

describe('metaPriorita', () => {
  it('regge anche un valore sporco e torna una riga completa', () => {
    const m = metaPriorita(undefined);
    expect(m.valore).toBe('bassa');
    expect(m.etichetta).toBe('3 - Bassa');
  });
});
