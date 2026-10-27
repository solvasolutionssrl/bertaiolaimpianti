import { describe, expect, it } from 'vitest';

import {
  FINESTRA_DOPPIONE_MIN,
  risolviSequenza,
  type EventoTimbro,
} from './timbri-sequenza';

const T = (h: number, m = 0) => Date.UTC(2026, 9, 21, h, m) ;

/** Un tocco al terminale: orologio fisso, direzione da dedurre. */
const tocco = (id: string, ms: number): EventoTimbro => ({
  id,
  ms,
  tipo: null,
  orologio: 'fisso',
});

/** Un'azione dall'app: direzione dichiarata, orologio del telefono. */
const app = (
  id: string,
  ms: number,
  tipo: 'ingresso' | 'uscita',
): EventoTimbro => ({ id, ms, tipo, orologio: 'telefono' });

const tipi = (r: ReturnType<typeof risolviSequenza>) => r.timbri.map((t) => t.tipo);

describe('timbri-sequenza — la giornata normale', () => {
  it('quattro tocchi diventano dentro, fuori, dentro, fuori', () => {
    const r = risolviSequenza([
      tocco('a', T(8, 27)),
      tocco('b', T(12, 30)),
      tocco('c', T(13, 15)),
      tocco('d', T(18)),
    ]);
    expect(tipi(r)).toEqual(['ingresso', 'uscita', 'ingresso', 'uscita']);
    expect(r.aperta).toBe(false);
    expect(r.incoerente).toBe(false);
    expect(r.scartati).toEqual([]);
  });

  it('⭐ tutte le direzioni dedotte sono marcate come tali', () => {
    const r = risolviSequenza([tocco('a', T(8)), tocco('b', T(17))]);
    expect(r.timbri.every((t) => t.dedotto)).toBe(true);
  });

  it('un solo tocco lascia la giornata aperta', () => {
    const r = risolviSequenza([tocco('a', T(8, 27))]);
    expect(tipi(r)).toEqual(['ingresso']);
    expect(r.aperta).toBe(true);
  });

  it('⚠️ chi esce e non timbra lascia la giornata aperta, e non si indovina', () => {
    const r = risolviSequenza([
      tocco('a', T(8)),
      tocco('b', T(12)),
      tocco('c', T(13)),
    ]);
    expect(tipi(r)).toEqual(['ingresso', 'uscita', 'ingresso']);
    expect(r.aperta).toBe(true);
  });

  it('nessun evento: giornata vuota e chiusa', () => {
    const r = risolviSequenza([]);
    expect(r.timbri).toEqual([]);
    expect(r.aperta).toBe(false);
  });
});

describe('timbri-sequenza — le due bocche', () => {
  it('⭐ apre dall’app e chiude al terminale: l’uscita si deduce', () => {
    const r = risolviSequenza([app('a', T(8, 27), 'ingresso'), tocco('b', T(18))]);
    expect(tipi(r)).toEqual(['ingresso', 'uscita']);
    expect(r.timbri[0]?.dedotto).toBe(false);
    expect(r.timbri[1]?.dedotto).toBe(true);
    expect(r.aperta).toBe(false);
  });

  it('⭐ apre al terminale e chiude dall’app: l’ingresso si deduce', () => {
    const r = risolviSequenza([tocco('a', T(8)), app('b', T(17), 'uscita')]);
    expect(tipi(r)).toEqual(['ingresso', 'uscita']);
    expect(r.incoerente).toBe(false);
  });

  it('una dichiarazione che contraddice la sequenza non si sovrascrive, si segnala', () => {
    // Due ingressi dichiarati a ore di distanza: il secondo e' un fatto
    // misurato e lo si rispetta, ma la giornata non torna.
    const r = risolviSequenza([
      app('a', T(8), 'ingresso'),
      app('b', T(14), 'ingresso'),
    ]);
    expect(tipi(r)).toEqual(['ingresso', 'ingresso']);
    expect(r.incoerente).toBe(true);
    expect(r.aperta).toBe(true);
  });
});

describe('timbri-sequenza — i doppioni', () => {
  it('due tocchi a trenta secondi sono lo stesso gesto', () => {
    const r = risolviSequenza([tocco('a', T(18)), tocco('b', T(18) + 30_000)]);
    expect(r.timbri).toHaveLength(1);
    expect(r.scartati).toEqual([{ id: 'b', motivo: 'doppione', vinceId: 'a' }]);
  });

  it('⭐ fra i due vince l’orologio fisso, non il telefono', () => {
    const r = risolviSequenza([
      app('telefono', T(18), 'uscita'),
      tocco('terminale', T(18) + 40_000),
    ]);
    expect(r.timbri).toHaveLength(1);
    expect(r.timbri[0]?.id).toBe('terminale');
    expect(r.scartati[0]?.id).toBe('telefono');
  });

  it('a parità di orologio resta la direzione dichiarata', () => {
    const a: EventoTimbro = { id: 'dedurre', ms: T(18), tipo: null, orologio: 'fisso' };
    const b: EventoTimbro = {
      id: 'dichiarato',
      ms: T(18) + 20_000,
      tipo: 'uscita',
      orologio: 'fisso',
    };
    const r = risolviSequenza([a, b]);
    expect(r.timbri).toHaveLength(1);
    expect(r.timbri[0]?.id).toBe('dichiarato');
    expect(r.timbri[0]?.dedotto).toBe(false);
  });

  it('⚠️ INVARIANTE: due direzioni dichiarate e OPPOSTE non si fondono mai', () => {
    // Fonderle cancellerebbe un fatto misurato. Meglio una giornata che non
    // torna e lo dice.
    const r = risolviSequenza([
      app('uscita', T(18), 'uscita'),
      app('ingresso', T(18) + 10_000, 'ingresso'),
    ]);
    expect(r.timbri).toHaveLength(2);
    expect(r.scartati).toEqual([]);
  });

  it('oltre la finestra sono due gesti distinti', () => {
    const oltre = T(18) + (FINESTRA_DOPPIONE_MIN * 60_000 + 1000);
    const r = risolviSequenza([tocco('a', T(18)), tocco('b', oltre)]);
    expect(r.timbri).toHaveLength(2);
    expect(tipi(r)).toEqual(['ingresso', 'uscita']);
  });

  it('⚠️ il predefinito è UN minuto: 91 secondi sono due gesti (caso vero del 22/10)', () => {
    const r = risolviSequenza([tocco('a', T(10) + 26 * 60_000 + 12_000), tocco('b', T(10) + 27 * 60_000 + 43_000)]);
    expect(FINESTRA_DOPPIONE_MIN).toBe(1);
    expect(r.timbri).toHaveLength(2);
    expect(r.scartati).toEqual([]);
    // Dentro il minuto resta un doppione.
    expect(risolviSequenza([tocco('a', T(10)), tocco('b', T(10) + 59_000)]).timbri).toHaveLength(1);
  });

  it('la finestra si può stringere o allargare', () => {
    const eventi = [tocco('a', T(18)), tocco('b', T(18) + 90_000)];
    expect(risolviSequenza(eventi, { finestraDoppioneMin: 1 }).timbri).toHaveLength(2);
    expect(risolviSequenza(eventi, { finestraDoppioneMin: 5 }).timbri).toHaveLength(1);
  });

  it('tre tocchi a raffica collassano in uno', () => {
    const r = risolviSequenza([
      tocco('a', T(18)),
      tocco('b', T(18) + 20_000),
      tocco('c', T(18) + 40_000),
    ]);
    expect(r.timbri).toHaveLength(1);
    expect(r.scartati).toHaveLength(2);
  });
});

describe('timbri-sequenza — l’ordine e il ricalcolo', () => {
  it('⭐ l’ordine di arrivo non conta: si ricalcola dall’istante', () => {
    const giusto = [tocco('a', T(8)), tocco('b', T(12)), tocco('c', T(18))];
    const alRovescio = [giusto[2]!, giusto[0]!, giusto[1]!];
    expect(tipi(risolviSequenza(alRovescio))).toEqual(tipi(risolviSequenza(giusto)));
  });

  it('⭐ un evento arrivato in ritardo IN MEZZO ribalta ciò che viene dopo', () => {
    // E' il motivo per cui la giornata si ricalcola invece di appendere: senza,
    // il tocco di mezzogiorno resterebbe un'uscita e quello delle 18 un ingresso.
    const senza = risolviSequenza([tocco('a', T(8)), tocco('c', T(18))]);
    expect(tipi(senza)).toEqual(['ingresso', 'uscita']);
    const con = risolviSequenza([tocco('a', T(8)), tocco('b', T(12)), tocco('c', T(18))]);
    expect(tipi(con)).toEqual(['ingresso', 'uscita', 'ingresso']);
    expect(con.aperta).toBe(true);
  });

  it('⭐ INVARIANTE: a parità di istante sopravvive sempre lo stesso, in qualunque ordine', () => {
    // Due eventi allo STESSO millisecondo sono lo stesso gesto anche a finestra
    // zero, e va bene così. Quello che conta è che la giornata non cambi fra
    // due ricalcoli: a parità di tutto il resto si tiene il primo in ordine di
    // id, che è un criterio stabile e non dipende da come sono arrivati.
    const zeta: EventoTimbro = { id: 'zeta', ms: T(9), tipo: null, orologio: 'fisso' };
    const alfa: EventoTimbro = { id: 'alfa', ms: T(9), tipo: null, orologio: 'fisso' };

    const uno = risolviSequenza([zeta, alfa], { finestraDoppioneMin: 0 });
    const due = risolviSequenza([alfa, zeta], { finestraDoppioneMin: 0 });

    expect(uno.timbri.map((t) => t.id)).toEqual(['alfa']);
    expect(due.timbri.map((t) => t.id)).toEqual(uno.timbri.map((t) => t.id));
    expect(uno.scartati).toEqual(due.scartati);
  });

  it('⚠️ due istanti distinti a finestra zero restano due gesti', () => {
    const r = risolviSequenza(
      [tocco('a', T(9)), tocco('b', T(9) + 1)],
      { finestraDoppioneMin: 0 },
    );
    expect(r.timbri).toHaveLength(2);
  });
});

describe('timbri-sequenza — l’evento senza ora', () => {
  it('⚠️ non si indovina: si dichiara scartato e non entra nella sequenza', () => {
    const r = risolviSequenza([
      tocco('buono', T(8)),
      { id: 'senzaora', ms: Number.NaN, tipo: null, orologio: 'telefono' },
      tocco('buono2', T(17)),
    ]);
    expect(r.timbri.map((t) => t.id)).toEqual(['buono', 'buono2']);
    expect(r.scartati).toEqual([{ id: 'senzaora', motivo: 'senza_ora' }]);
    expect(r.aperta).toBe(false);
  });

  it('un evento senza ora non sposta la direzione di quelli validi', () => {
    const r = risolviSequenza([
      { id: 'x', ms: Number.POSITIVE_INFINITY, tipo: null, orologio: 'fisso' },
      tocco('a', T(8)),
    ]);
    expect(tipi(r)).toEqual(['ingresso']);
  });
});

describe('⭐⭐ lo specchio della chiusura: un derivato cede davanti ai fatti', () => {
  const T = (h: number, m = 0) => Date.UTC(2026, 9, 26, h, m);
  const badge = (id: string, h: number, m = 0): EventoTimbro => ({ id, ms: T(h, m), tipo: null, orologio: 'fisso' });
  const specchio = (id: string, h: number, m = 0): EventoTimbro => ({
    id, ms: T(h, m), tipo: 'uscita', orologio: 'telefono', derivato: true,
  });

  it('la giornata si chiude da sé: lo specchio si scarta', () => {
    // Il caso vero di FPM: badge di uscita delle **18:03:30** (che l'arrotondamento
    // porta nello slot 18:05) e lo specchio delle 18:05:00. ⚠️ I due istanti
    // esatti distano 90 secondi: il ripescaggio dei doppioni NON li fonde — la
    // sua finestra è di un minuto, e misura gesti. Serve la regola del derivato.
    const esatto = (h: number, m: number, sec: number) => Date.UTC(2026, 9, 26, h, m, sec);
    const s = risolviSequenza([
      badge('b1', 7, 40),
      badge('b2', 12, 35),
      badge('b3', 13, 35),
      { ...badge('b4', 18, 5), ordine: esatto(18, 3, 30) },
      { ...specchio('sp', 18, 5), ordine: esatto(18, 5, 0) },
    ]);
    expect(s.incoerente).toBe(false);
    expect(s.timbri.map((t) => t.id)).toEqual(['b1', 'b2', 'b3', 'b4']);
    expect(s.scartati).toContainEqual({ id: 'sp', motivo: 'specchio_superfluo' });
  });

  it('⭐ senza di lui la giornata resterebbe aperta: lo specchio resta', () => {
    // È il caso per cui è nato: apro col badge, chiudo dall'app.
    const s = risolviSequenza([badge('b1', 8), specchio('sp', 17)]);
    expect(s.aperta).toBe(false);
    expect(s.timbri.map((t) => t.id)).toEqual(['b1', 'sp']);
    expect(s.scartati).toEqual([]);
  });

  it('⚠️ ma non entra se contraddirebbe un fatto misurato', () => {
    // Giornata ancora aperta (tre tocchi), e lo specchio cade subito dopo
    // un'uscita vera: due uscite di fila. Una supposizione non smentisce una
    // misura — si scarta. Trovato su 20.000 giornate simulate.
    const s = risolviSequenza([badge('b1', 8), badge('b2', 12), specchio('sp', 12, 30), badge('b3', 14)]);
    expect(s.incoerente).toBe(false);
    expect(s.scartati).toContainEqual({ id: 'sp', motivo: 'specchio_superfluo' });
    expect(s.aperta).toBe(true);
  });

  it('⚠️ e non può nascondere una contraddizione che c’era già', () => {
    const s = risolviSequenza([
      { id: 'a', ms: T(8), tipo: 'ingresso', orologio: 'telefono' },
      { id: 'b', ms: T(9), tipo: 'ingresso', orologio: 'telefono' },
      specchio('sp', 17),
    ]);
    expect(s.incoerente).toBe(true);
  });

  it('senza derivati non cambia niente: nessuno scarto in più', () => {
    const s = risolviSequenza([badge('b1', 8), badge('b2', 12), badge('b3', 13), badge('b4', 17)]);
    expect(s.scartati).toEqual([]);
    expect(s.timbri).toHaveLength(4);
  });
});
