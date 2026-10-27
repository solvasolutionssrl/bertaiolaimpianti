import { describe, expect, it } from 'vitest';

import { statoGiornataTimbro, type TimbraturaAttribuita } from './timbro-giornata';
import type { EventoTimbro } from './timbri-sequenza';

/**
 * **Strade simulate.** Giornate generate a caso con le stesse forme che il
 * mondo vero produce — badge al terminale, presenze dichiarate dall'app, lo
 * specchio della chiusura, l'arrotondamento a 5 minuti — per tenere ferme le
 * proprietà che devono valere **sempre**, non solo sui casi che abbiamo visto.
 *
 * ⭐ Nato il 27/10/2026 confrontando la regola nuova con la vecchia su ventimila
 * giornate: trovò ventisei casi in cui lo specchio della chiusura entrava e
 * contraddiceva un'uscita vera. Il confronto con la vecchia è servito una volta
 * e non resta qui; restano le **invarianti**, che non hanno bisogno di un
 * termine di paragone per bocciare una regressione.
 */

const GIORNO = Date.UTC(2026, 9, 26, 0, 0);
const PASSO = 5 * 60_000;
const arrotonda = (ms: number) => Math.round(ms / PASSO) * PASSO;

/** Generatore deterministico: un seme, sempre la stessa sequenza. */
function rng(seme: number) {
  let s = seme >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

interface Caso {
  eventi: EventoTimbro[];
  timbrature: TimbraturaAttribuita[];
}

function generaCaso(r: () => number): Caso {
  const nTocchi = 2 + Math.floor(r() * 5); // 2..6 passaggi
  const esatti: number[] = [];
  let t = GIORNO + (6 * 60 + Math.floor(r() * 180)) * 60_000; // fra le 6 e le 9
  for (let i = 0; i < nTocchi; i++) {
    esatti.push(t);
    t += (10 + Math.floor(r() * 300)) * 60_000; // 10 min .. 5 h dopo
  }

  const eventi: EventoTimbro[] = esatti.map((ms, i) => ({
    id: `b${i}`,
    ms: arrotonda(ms),
    ordine: ms,
    // Qualche passaggio arriva dall'app con la direzione dichiarata.
    tipo: r() < 0.25 ? (i % 2 === 0 ? 'ingresso' : 'uscita') : null,
    orologio: r() < 0.8 ? 'fisso' : 'telefono',
  }));

  // Le ore attribuite: a volte nessuna, a volte la ripartizione dei passaggi.
  const quante = r();
  let timbrature: TimbraturaAttribuita[] = [];
  if (quante > 0.35) {
    const pari = esatti.slice(0, Math.floor(esatti.length / 2) * 2);
    timbrature = pari.map((ms, i) => ({
      id: `t${i}`,
      tipo: i % 2 === 0 ? ('ingresso' as const) : ('uscita' as const),
      ms: arrotonda(ms),
      ordine: arrotonda(ms),
      pausa: i > 0 && i < pari.length - 1,
      cantiereId: 'c1',
    }));
  }

  // Lo specchio della chiusura: un'uscita derivata, vicina all'ultimo passaggio.
  if (r() < 0.3 && timbrature.length > 0) {
    const ultimo = timbrature[timbrature.length - 1]!;
    eventi.push({
      id: 'specchio',
      ms: ultimo.ms,
      ordine: ultimo.ms,
      tipo: 'uscita',
      orologio: 'telefono',
      derivato: true,
    });
  }
  return { eventi, timbrature };
}

describe('strade simulate: le proprietà che valgono sempre', () => {
  it('su 20.000 giornate generate: presenza mai negativa, mai oltre l\u2019arco della giornata', () => {
    const r = rng(20261027);
    let negativa = 0;
    let fuoriArco = 0;
    let daVerificare = 0;
    for (let i = 0; i < 20_000; i++) {
      const caso = generaCaso(r);
      const n = statoGiornataTimbro(caso);
      if (n.stato === 'da_verificare') daVerificare += 1;
      const netti = n.presenza?.minutiNetti ?? 0;
      if (netti < 0) negativa += 1;
      const primo = Math.min(...caso.eventi.map((e) => e.ms));
      const ultimo = Math.max(...caso.eventi.map((e) => e.ms));
      if (netti > Math.round((ultimo - primo) / 60_000)) fuoriArco += 1;
    }
    // eslint-disable-next-line no-console
    console.log(`\n  20.000 giornate simulate · «da verificare»: ${daVerificare}`);
    expect(negativa).toBe(0);
    expect(fuoriArco).toBe(0);
  });

  it('⚠️ la stessa giornata letta due volte dà la stessa risposta', () => {
    // L'ordine in cui gli eventi arrivano non deve cambiare la giornata: un
    // import che riordina due righe non puÃ² spostare le ore di nessuno.
    const r = rng(7);
    for (let i = 0; i < 2000; i++) {
      const caso = generaCaso(r);
      const a = statoGiornataTimbro(caso);
      const b = statoGiornataTimbro({ ...caso, eventi: [...caso.eventi].reverse() });
      expect(b.stato, `ordine d\u2019ingresso diverso al giro ${i}`).toBe(a.stato);
      expect(b.presenza?.minutiNetti ?? null).toBe(a.presenza?.minutiNetti ?? null);
    }
  });
});

describe('\u26a0\ufe0f «da verificare» deve restare raggiungibile', () => {
  const T = (h: number, m = 0) => Date.UTC(2026, 9, 26, h, m);
  it('due ingressi DICHIARATI di fila sono ancora una contraddizione', () => {
    const g = statoGiornataTimbro({
      eventi: [
        { id: 'a', ms: T(8), tipo: 'ingresso', orologio: 'telefono' },
        { id: 'b', ms: T(9), tipo: 'ingresso', orologio: 'telefono' },
        { id: 'c', ms: T(17), tipo: 'uscita', orologio: 'telefono' },
      ],
      timbrature: [],
    });
    expect(g.stato).toBe('da_verificare');
  });

  it('e uno specchio non pu\u00f2 nasconderla', () => {
    const g = statoGiornataTimbro({
      eventi: [
        { id: 'a', ms: T(8), tipo: 'ingresso', orologio: 'telefono' },
        { id: 'b', ms: T(9), tipo: 'ingresso', orologio: 'telefono' },
        { id: 's', ms: T(17), tipo: 'uscita', orologio: 'telefono', derivato: true },
      ],
      timbrature: [],
    });
    expect(g.stato).toBe('da_verificare');
  });
});
