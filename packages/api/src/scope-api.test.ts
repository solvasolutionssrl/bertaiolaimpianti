import { describe, expect, it } from 'vitest';

import {
  SCOPE_API,
  SCOPE_EMETTIBILI,
  profiloDipendenti,
  richiedeModuloIntegrazione,
  scopeValido,
  soddisfa,
  vocePerScope,
} from './scope-api';

describe('scope-api — il catalogo', () => {
  it('ha etichetta e descrizione su ogni voce: il pannello le mostra', () => {
    for (const v of SCOPE_API) {
      expect(v.etichetta.trim().length).toBeGreaterThan(0);
      expect(v.descrizione.trim().length).toBeGreaterThan(0);
    }
  });

  it('non ha doppioni', () => {
    expect(new Set(SCOPE_EMETTIBILI).size).toBe(SCOPE_EMETTIBILI.length);
  });

  it('solo «upload» agisce per conto di una persona', () => {
    const conPersona = SCOPE_API.filter((v) => v.vuolePersona).map((v) => v.scope);
    expect(conPersona).toEqual(['upload']);
  });

  it('riconosce solo gli scope del catalogo', () => {
    expect(scopeValido('leggi:dipendenti')).toBe(true);
    expect(scopeValido('amministratore')).toBe(false);
    expect(scopeValido('')).toBe(false);
    expect(vocePerScope('inventato')).toBeNull();
  });
});

describe('scope-api — chi concede cosa', () => {
  it('«integrazione» NON concede «upload»: chi sincronizza non carica foto', () => {
    expect(soddisfa(['integrazione'], 'upload')).toBe(false);
  });

  it('«upload» NON concede la lettura del personale', () => {
    expect(soddisfa(['upload'], 'leggi:dipendenti')).toBe(false);
    expect(soddisfa(['upload'], 'integrazione')).toBe(false);
  });

  it('«integrazione» concede la lettura del personale, costi compresi', () => {
    expect(soddisfa(['integrazione'], 'leggi:dipendenti')).toBe(true);
    expect(soddisfa(['integrazione'], 'leggi:dipendenti:costi')).toBe(true);
  });

  it('chi può leggere i costi può leggere anche senza', () => {
    expect(soddisfa(['leggi:dipendenti:costi'], 'leggi:dipendenti')).toBe(true);
  });

  it('⭐ INVARIANTE: la sola lettura NON apre i costi', () => {
    expect(soddisfa(['leggi:dipendenti'], 'leggi:dipendenti:costi')).toBe(false);
  });

  it('⭐ la gerarchia non si deduce dal prefisso del nome', () => {
    // Uno scope inventato che COMINCIA come uno vero non deve concedere niente:
    // è la trappola che una gerarchia scritta con startsWith aprirebbe.
    expect(soddisfa(['leggi:dipendenti:inventato'], 'leggi:dipendenti')).toBe(false);
    expect(soddisfa(['leggi'], 'leggi:dipendenti')).toBe(false);
  });

  it('un token senza scope non ottiene niente', () => {
    expect(soddisfa([], 'leggi:dipendenti')).toBe(false);
    expect(soddisfa([], 'upload')).toBe(false);
  });
});

describe('scope-api — il profilo dell’anagrafica', () => {
  it('⭐ INVARIANTE: con la sola lettura il profilo non è mai completo', () => {
    expect(profiloDipendenti(['leggi:dipendenti'])).toBe('base');
  });

  it('con i costi e con il gestionale il profilo è completo', () => {
    expect(profiloDipendenti(['leggi:dipendenti:costi'])).toBe('completo');
    expect(profiloDipendenti(['integrazione'])).toBe('completo');
  });

  it('chi non può leggere il personale non ha nessun profilo', () => {
    expect(profiloDipendenti(['upload'])).toBe('nessuno');
    expect(profiloDipendenti([])).toBe('nessuno');
    expect(profiloDipendenti(['inventato'])).toBe('nessuno');
  });

  it('più scope insieme: vince il più largo', () => {
    expect(profiloDipendenti(['leggi:dipendenti', 'leggi:dipendenti:costi'])).toBe(
      'completo',
    );
  });
});

describe('scope-api — il modulo Integrazione', () => {
  it('⭐ un token del gestionale lo pretende: spegnere il modulo deve fermarlo', () => {
    expect(richiedeModuloIntegrazione(['integrazione'])).toBe(true);
  });

  it('un token di sola lettura non lo pretende', () => {
    expect(richiedeModuloIntegrazione(['leggi:dipendenti'])).toBe(false);
    expect(richiedeModuloIntegrazione(['leggi:dipendenti:costi'])).toBe(false);
    expect(richiedeModuloIntegrazione(['upload'])).toBe(false);
  });

  it('se un token ha entrambi, il modulo resta obbligatorio', () => {
    expect(richiedeModuloIntegrazione(['leggi:dipendenti', 'integrazione'])).toBe(true);
  });
});
