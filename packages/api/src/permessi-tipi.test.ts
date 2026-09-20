import { describe, expect, it } from 'vitest';

import {
  PERMESSO_TIPI,
  numeroAttestatoObbligatorio,
  serveGiustificativo,
} from './permessi-tipi';

/**
 * La regola di «quando serve un documento» e' l'unica cosa che decide se
 * l'ufficio viene fermato mentre registra un'assenza vera. Vale la pena
 * fissarla qui, perche' il modo naturale di sbagliarla e' scriverla come
 * `tipo === 'malattia'` sparso nelle pagine.
 */

describe('serveGiustificativo', () => {
  it('lo chiede dove lo dice il catalogo, non dove lo diciamo noi', () => {
    expect(serveGiustificativo('malattia')).toBe(true);
    expect(serveGiustificativo('infortunio')).toBe(true);
    expect(serveGiustificativo('visita_medica')).toBe(true);
    expect(serveGiustificativo('permesso_104')).toBe(true);
    expect(serveGiustificativo('lutto')).toBe(true);
  });

  it('non lo chiede per ferie, ROL ed ex-festivita', () => {
    expect(serveGiustificativo('ferie')).toBe(false);
    expect(serveGiustificativo('rol')).toBe(false);
    expect(serveGiustificativo('par_ex_festivita')).toBe(false);
  });

  it('un tipo creato dall azienda decide da se', () => {
    const custom = [
      { codice: 'custom_sindacale', richiedeGiustificativo: true },
      { codice: 'custom_recupero', richiedeGiustificativo: false },
    ];
    expect(serveGiustificativo('custom_sindacale', custom)).toBe(true);
    expect(serveGiustificativo('custom_recupero', custom)).toBe(false);
  });

  it('senza la config del cliente non si inventa un obbligo', () => {
    // La stessa assenza vista da una pagina che non ha caricato i tipi custom
    // non deve diventare improvvisamente "da giustificare".
    expect(serveGiustificativo('custom_sindacale')).toBe(false);
  });

  it('un tipo mai visto non blocca niente', () => {
    // Meglio non chiedere un documento che non esiste, che rifiutare
    // un'assenza vera per un dato che non conosciamo.
    expect(serveGiustificativo('tipo_di_un_altro_pianeta')).toBe(false);
  });
});

describe('numeroAttestatoObbligatorio', () => {
  it('solo la malattia vuole il numero: e il PUC che serve al consulente', () => {
    expect(numeroAttestatoObbligatorio('malattia')).toBe(true);
    expect(numeroAttestatoObbligatorio('infortunio')).toBe(false);
    expect(numeroAttestatoObbligatorio('visita_medica')).toBe(false);
    expect(numeroAttestatoObbligatorio('ferie')).toBe(false);
  });

  it('dove il numero e obbligatorio, il documento e per forza richiesto', () => {
    // Invariante: chiedere il numero di un attestato che non esiste sarebbe
    // incoerente. Se un domani l'obbligo si allarga a un altro tipo, questo
    // test fa rumore finche' anche il catalogo non viene allineato.
    for (const t of PERMESSO_TIPI) {
      if (numeroAttestatoObbligatorio(t.codice)) {
        expect(serveGiustificativo(t.codice)).toBe(true);
      }
    }
  });
});
