import { describe, expect, it } from 'vitest';

import type { EventoTimbro } from './timbri-sequenza';
import { statoGiornataTimbro, type TimbraturaAttribuita } from './timbro-giornata';
import { minutiDaTimbrature } from './kantiere-quote';

/**
 * La matrice delle bocche (24/10/2026): come si apre, come si fa pausa, come
 * si chiude, e cosa deve dire il registro. Ogni caso e' una riga della tabella
 * in `Logiche_Integrazione_Timbro.md` («Matrice delle bocche»).
 *
 * Vocabolario: `badge(h)` = tocco al terminale senza direzione; `app(h, tipo)`
 * = presenza dichiarata dall'app/PC nel registro (ingresso o uscita);
 * `timb(...)` = una timbratura attribuita a un cantiere (QR, app, PC, ufficio).
 * Lo specchio della fine turno nel registro (`specchiaChiusuraNelRegistro`) si
 * rappresenta con un `app(h, 'uscita')` orologio telefono.
 */
const T = (h: number, m = 0) => Date.UTC(2026, 9, 24, h, m);
const badge = (id: string, ms: number): EventoTimbro => ({ id, ms, tipo: null, orologio: 'fisso' });
const app = (id: string, ms: number, tipo: 'ingresso' | 'uscita'): EventoTimbro => ({ id, ms, tipo, orologio: 'telefono' });
const timb = (id: string, tipo: 'ingresso' | 'uscita', ms: number, cantiereId = 'A', pausa = false, sottocantiereId: string | null = null): TimbraturaAttribuita => ({
  id,
  tipo,
  ms,
  pausa,
  cantiereId,
  ...(sottocantiereId ? { sottocantiereId } : {}),
});

describe('apertura e chiusura con la stessa bocca', () => {
  it('1. badge in / badge out: scatola da ripartire, intervallo unico', () => {
    const g = statoGiornataTimbro({ eventi: [badge('a', T(8)), badge('b', T(17))], timbrature: [] });
    expect(g.stato).toBe('da_ripartire');
    expect(g.scatola?.intervalli).toEqual([{ inizioMs: T(8), fineMs: T(17) }]);
    expect(g.scatola?.nettoMin).toBe(540);
    expect(g.scatola?.inizioFisico).toBe(true);
  });

  it('2. badge con pausa timbrata: due intervalli, la pausa resta dove e\' stata timbrata', () => {
    const g = statoGiornataTimbro({ eventi: [badge('a', T(8)), badge('b', T(12, 30)), badge('c', T(13, 30)), badge('d', T(17))], timbrature: [] });
    expect(g.stato).toBe('da_ripartire');
    expect(g.scatola?.intervalli).toHaveLength(2);
    expect(g.scatola?.pausaTimbrataMin).toBe(60);
    expect(g.scatola?.nettoMin).toBe(480);
  });

  it('3. solo app (QR o inizia turno): il registro non c\'entra, le ore vengono dalle timbrature', () => {
    const g = statoGiornataTimbro({ eventi: [], timbrature: [timb('i', 'ingresso', T(8)), timb('u', 'uscita', T(17))] });
    expect(g.stato).toBe('nessun_timbro');
    const m = minutiDaTimbrature(
      [
        { id: 'i', tipo: 'ingresso', ms: T(8), chiave: 'cantiere:A' },
        { id: 'u', tipo: 'uscita', ms: T(17), chiave: 'cantiere:A' },
      ],
      [],
    );
    expect(m.get('cantiere:A')?.minutiLavoro).toBe(540);
  });

  it('4. presenza in sede dall\'app o dal PC, chiusa dall\'app: come il badge', () => {
    const g = statoGiornataTimbro({ eventi: [app('a', T(8), 'ingresso'), app('b', T(17), 'uscita')], timbrature: [] });
    expect(g.stato).toBe('da_ripartire');
    expect(g.scatola?.nettoMin).toBe(540);
  });

  it('5. solo un badge: presenza aperta, si aspetta', () => {
    const g = statoGiornataTimbro({ eventi: [badge('a', T(8))], timbrature: [] });
    expect(g.stato).toBe('presenza_aperta');
  });
});

describe('si apre con una bocca e si chiude con un\'altra', () => {
  it('6. app apre il turno, il badge della sera lo chiude: da chiudere, primo cantiere obbligato', () => {
    const g = statoGiornataTimbro({ eventi: [badge('b', T(17))], timbrature: [timb('i', 'ingresso', T(8))] });
    expect(g.stato).toBe('da_chiudere');
    expect(g.scatola?.ingressoEsistente?.id).toBe('i');
    expect(g.scatola?.nettoMin).toBe(540);
  });

  it('7. badge in sede, poi turno dall\'app in cantiere chiuso dall\'app (specchio nel registro): resta da ripartire solo la parte in sede', () => {
    const g = statoGiornataTimbro({
      eventi: [badge('a', T(8)), app('s', T(17), 'uscita')],
      timbrature: [timb('i', 'ingresso', T(9)), timb('u', 'uscita', T(17))],
    });
    expect(g.stato).toBe('da_ripartire');
    expect(g.scatola?.intervalli).toEqual([{ inizioMs: T(8), fineMs: T(9) }]);
    expect(g.scatola?.nettoMin).toBe(60);
  });

  it('8. badge in sede, QR in cantiere, QR fuori, badge fuori: le due code sono la scatola', () => {
    const g = statoGiornataTimbro({
      eventi: [badge('a', T(8)), badge('b', T(17, 30))],
      timbrature: [timb('i', 'ingresso', T(9)), timb('u', 'uscita', T(17))],
    });
    expect(g.stato).toBe('da_ripartire');
    expect(g.scatola?.intervalli).toEqual([
      { inizioMs: T(8), fineMs: T(9) },
      { inizioMs: T(17), fineMs: T(17, 30) },
    ]);
    expect(g.scatola?.nettoMin).toBe(90);
  });

  it('9. badge con pausa timbrata e turno dell\'app nel pomeriggio, chiuso dall\'app: la mattina e\' la scatola', () => {
    const g = statoGiornataTimbro({
      eventi: [badge('a', T(8)), badge('b', T(12, 30)), badge('c', T(13, 30)), app('s', T(18), 'uscita')],
      timbrature: [timb('i', 'ingresso', T(14)), timb('u', 'uscita', T(18))],
    });
    expect(g.stato).toBe('da_ripartire');
    expect(g.scatola?.nettoMin).toBe(270 + 30);
  });

  it('10. turno dell\'app chiuso la mattina, poi badge in sede il pomeriggio: la presenza del pomeriggio e\' una scatola, non un\'uscita', () => {
    const g = statoGiornataTimbro({
      eventi: [badge('a', T(13)), badge('b', T(17))],
      timbrature: [timb('i', 'ingresso', T(8)), timb('u', 'uscita', T(12))],
    });
    expect(g.stato).toBe('da_ripartire');
    expect(g.scatola?.intervalli).toEqual([{ inizioMs: T(13), fineMs: T(17) }]);
  });

  it('11. app apre alle 9, badge alle 18 e turno gia\' ripartito: il badge resta un\'uscita e la giornata e\' coperta', () => {
    const g = statoGiornataTimbro({
      eventi: [badge('b', T(18))],
      timbrature: [timb('i', 'ingresso', T(9)), timb('u', 'uscita', T(18))],
    });
    expect(g.stato).toBe('coperta');
  });

  it('12. cambio cantiere dal vivo (uscita A e ingresso B nello stesso minuto) dentro una presenza a badge', () => {
    const g = statoGiornataTimbro({
      eventi: [badge('a', T(8)), badge('b', T(17))],
      timbrature: [
        timb('i', 'ingresso', T(8)),
        timb('ua', 'uscita', T(12), 'A'),
        timb('ib', 'ingresso', T(12), 'B'),
        timb('ub', 'uscita', T(17), 'B'),
      ],
    });
    expect(g.stato).toBe('coperta');
  });

  it('13. pausa dichiarata a fine turno (coppia pausa) dentro badge in/out: la pausa non e\' un innesto', () => {
    const g = statoGiornataTimbro({
      eventi: [badge('a', T(8)), badge('b', T(17))],
      timbrature: [
        timb('i', 'ingresso', T(8)),
        timb('p1', 'uscita', T(12), 'A', true),
        timb('p2', 'ingresso', T(12, 30), 'A', true),
        timb('u', 'uscita', T(17)),
      ],
    });
    expect(g.stato).toBe('coperta');
  });

  it('14. badge mancante la sera e turno chiuso dall\'app: la presenza resta aperta e va verificata', () => {
    const g = statoGiornataTimbro({
      eventi: [badge('a', T(8))],
      timbrature: [timb('i', 'ingresso', T(9)), timb('u', 'uscita', T(17))],
    });
    expect(g.stato).toBe('da_verificare');
  });

  it('15. turno chiuso dall\'app e poi presenza nuova aperta dall\'app in sede: si aspetta, non e\' un badge mancante', () => {
    const g = statoGiornataTimbro({
      eventi: [app('s', T(17, 30), 'ingresso')],
      timbrature: [timb('i', 'ingresso', T(9)), timb('u', 'uscita', T(17))],
    });
    expect(g.stato).toBe('presenza_aperta');
  });
});

describe('le fasi nelle bocche', () => {
  it('16. ingresso con fase e uscita che la eredita: un solo segmento per fase', () => {
    const m = minutiDaTimbrature(
      [
        { id: 'i', tipo: 'ingresso', ms: T(8), chiave: 'cantiere:A/f1' },
        { id: 'p1', tipo: 'uscita', ms: T(12), chiave: 'cantiere:A/f1' },
        { id: 'p2', tipo: 'ingresso', ms: T(12, 30), chiave: 'cantiere:A/f1' },
        { id: 'u', tipo: 'uscita', ms: T(17), chiave: 'cantiere:A/f1' },
      ],
      [],
    );
    expect([...m.keys()]).toEqual(['cantiere:A/f1']);
    expect(m.get('cantiere:A/f1')?.minutiLavoro).toBe(510);
  });

  it('17. ⚠️ se l\'uscita NON eredita la fase, il segmento non si chiude e le ore spariscono (e\' il motivo dell\'eredita\' nello scrittore)', () => {
    const m = minutiDaTimbrature(
      [
        { id: 'i', tipo: 'ingresso', ms: T(8), chiave: 'cantiere:A/f1' },
        { id: 'u', tipo: 'uscita', ms: T(17), chiave: 'cantiere:A' },
      ],
      [],
    );
    expect(m.get('cantiere:A/f1')).toBeUndefined();
    expect(m.get('cantiere:A')).toBeUndefined();
  });
});
