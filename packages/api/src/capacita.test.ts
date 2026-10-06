import { describe, expect, it } from 'vitest';

import {
  CAPACITA,
  CAPACITA_META,
  eCapacita,
  haCapacita,
  leggiCapacita,
  puoAprireLavori,
  scriviCapacita,
} from './capacita';

describe('leggiCapacita', () => {
  it('legge i booleani accesi', () => {
    expect([...leggiCapacita({ capo_squadra: true })]).toEqual(['capo_squadra']);
  });

  it('ignora i valori che non sono true secco', () => {
    for (const v of ['true', 1, 'si', {}, [], 'yes']) {
      expect(leggiCapacita({ capo_squadra: v }).size).toBe(0);
    }
  });

  it('non solleva su niente di quello che può arrivare dal database', () => {
    for (const v of [null, undefined, '', 'stringa', 42, [], [1, 2], true]) {
      expect(() => leggiCapacita(v)).not.toThrow();
      expect(leggiCapacita(v).size).toBe(0);
    }
  });

  it('ignora le chiavi del vecchio sistema di permessi', () => {
    const vecchio = {
      commesse: 'full',
      clienti: 'full',
      ticket: 'full',
      turni: 'approve',
      documenti: 'full',
      utenti: 'full',
      statistiche: 'export',
    };
    // Il vecchio pannello prometteva «completo su tutto»: non diventa capo squadra.
    expect(leggiCapacita(vecchio).size).toBe(0);
  });
});

describe('haCapacita', () => {
  it('amministratore e ufficio ce l’hanno per mestiere', () => {
    expect(haCapacita({ role: 'admin' }, 'capo_squadra')).toBe(true);
    expect(haCapacita({ role: 'office' }, 'capo_squadra')).toBe(true);
  });

  it('non si può togliere a un amministratore da qui', () => {
    // Per togliere qualcosa a un amministratore si cambia il ruolo: è un gesto
    // visibile. Un override silenzioso sarebbe una trappola.
    expect(haCapacita({ role: 'admin', permissions: { capo_squadra: false } }, 'capo_squadra')).toBe(true);
  });

  it('un tecnico la ha solo se gliela danno', () => {
    expect(haCapacita({ role: 'tecnico' }, 'capo_squadra')).toBe(false);
    expect(haCapacita({ role: 'tecnico', permissions: null }, 'capo_squadra')).toBe(false);
    expect(haCapacita({ role: 'tecnico', permissions: { capo_squadra: true } }, 'capo_squadra')).toBe(true);
  });

  it('un cliente non la ha mai, nemmeno se glielo scrivono in colonna', () => {
    expect(haCapacita({ role: 'cliente', permissions: { capo_squadra: true } }, 'capo_squadra')).toBe(false);
  });

  it('un ruolo sconosciuto parte da zero', () => {
    expect(haCapacita({ role: 'chissa' }, 'capo_squadra')).toBe(false);
    expect(haCapacita({ role: 'chissa', permissions: { capo_squadra: true } }, 'capo_squadra')).toBe(true);
  });

  it('puoAprireLavori è la stessa domanda', () => {
    for (const u of [
      { role: 'admin' },
      { role: 'office' },
      { role: 'tecnico' },
      { role: 'tecnico', permissions: { capo_squadra: true } },
      { role: 'cliente', permissions: { capo_squadra: true } },
    ]) {
      expect(puoAprireLavori(u)).toBe(haCapacita(u, 'capo_squadra'));
    }
  });
});

describe('scriviCapacita', () => {
  it('accende', () => {
    expect(scriviCapacita(null, 'capo_squadra', true)).toEqual({ capo_squadra: true });
  });

  it('spegne e torna null, non un oggetto vuoto', () => {
    expect(scriviCapacita({ capo_squadra: true }, 'capo_squadra', false)).toBeNull();
  });

  it('spegnere ciò che era già spento resta null', () => {
    expect(scriviCapacita(null, 'capo_squadra', false)).toBeNull();
  });

  it('non si porta dietro le chiavi del vecchio sistema', () => {
    const out = scriviCapacita({ commesse: 'full', turni: 'approve' }, 'capo_squadra', true);
    expect(out).toEqual({ capo_squadra: true });
    expect(out).not.toHaveProperty('commesse');
  });

  it('andata e ritorno: quello che scrive è quello che si rilegge', () => {
    const scritto = scriviCapacita(null, 'capo_squadra', true);
    expect(leggiCapacita(scritto).has('capo_squadra')).toBe(true);
    const spento = scriviCapacita(scritto, 'capo_squadra', false);
    expect(leggiCapacita(spento).has('capo_squadra')).toBe(false);
  });
});

describe('eCapacita', () => {
  it('riconosce solo i nomi veri', () => {
    expect(eCapacita('capo_squadra')).toBe(true);
    expect(eCapacita('capo')).toBe(false);
    expect(eCapacita('')).toBe(false);
    expect(eCapacita(null)).toBe(false);
    expect(eCapacita(42)).toBe(false);
  });
});

describe('il registro è completo', () => {
  it('ogni capacità ha un testo, e dice cosa sblocca e cosa succede senza', () => {
    for (const c of CAPACITA) {
      const m = CAPACITA_META[c];
      expect(m.etichetta.length).toBeGreaterThan(2);
      expect(m.descrizione.length).toBeGreaterThan(20);
      expect(m.sblocca.length).toBeGreaterThan(0);
      // Il messaggio a chi non è abilitato deve dire a chi rivolgersi: un «non
      // autorizzato» lascia la persona ferma senza sapere cosa fare.
      expect(m.messaggioNegato).toMatch(/capo squadra/i);
    }
  });
});
