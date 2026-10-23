import { describe, expect, it } from 'vitest';
import {
  NESSUN_ARROTONDAMENTO,
  arrotondaEventi,
  arrotondaMs,
  arrotondaMsAlPasso,
  arrotondaTimbrature,
  arrotondaTs,
  regolaVale,
} from './arrotondamento-timbri';

const R5 = { passoMin: 5, dal: null };
const ms = (iso: string) => Date.parse(iso);

describe('arrotondaMsAlPasso', () => {
  it('al piu\' vicino: 12:32:29 → 12:30, 12:32:31 → 12:35', () => {
    expect(new Date(arrotondaMsAlPasso(ms('2026-10-23T12:32:29Z'), 5)).toISOString()).toBe('2026-10-23T12:30:00.000Z');
    expect(new Date(arrotondaMsAlPasso(ms('2026-10-23T12:32:31Z'), 5)).toISOString()).toBe('2026-10-23T12:35:00.000Z');
  });
  it('a meta\' esatta va in su (Math.round)', () => {
    expect(new Date(arrotondaMsAlPasso(ms('2026-10-23T12:32:30Z'), 5)).toISOString()).toBe('2026-10-23T12:35:00.000Z');
  });
  it('passo 0 o negativo: invariato', () => {
    const m = ms('2026-10-23T12:32:29Z');
    expect(arrotondaMsAlPasso(m, 0)).toBe(m);
    expect(arrotondaMsAlPasso(m, -5)).toBe(m);
  });
  it('un istante non valido resta non valido', () => {
    expect(Number.isNaN(arrotondaMsAlPasso(Number.NaN, 5))).toBe(true);
  });
});

describe('la regola e la data di partenza', () => {
  it('senza data vale da sempre', () => {
    expect(regolaVale(ms('2020-01-01T08:02:00Z'), R5)).toBe(true);
  });
  it('⭐ il passato non si tocca: prima di `dal` si calcola al minuto', () => {
    const regola = { passoMin: 5, dal: '2026-10-23' };
    // 22/10 alle 23:30 italiane (21:30Z) e' ancora il 22: esatto.
    expect(arrotondaTs('2026-10-22T21:32:00Z', regola)).toBe('2026-10-22T21:32:00Z');
    // 23/10 alle 00:30 italiane (22:30Z del 22) e' gia' il 23: arrotondato.
    expect(arrotondaTs('2026-10-22T22:32:00Z', regola)).toBe('2026-10-22T22:30:00.000Z');
  });
  it('passo 0 = nessun arrotondamento, qualunque sia la data', () => {
    expect(arrotondaTs('2026-10-23T08:02:00Z', NESSUN_ARROTONDAMENTO)).toBe('2026-10-23T08:02:00Z');
    expect(regolaVale(ms('2026-10-23T08:02:00Z'), { passoMin: 0, dal: '2020-01-01' })).toBe(false);
  });
  it('arrotondaMs rispetta la regola', () => {
    expect(arrotondaMs(ms('2026-10-23T08:02:00Z'), R5)).toBe(ms('2026-10-23T08:00:00Z'));
  });
});

describe('copie delle righe', () => {
  it('arrotondaTimbrature non tocca le righe originali e mantiene gli altri campi', () => {
    const righe = [
      { id: 'a', tipo: 'ingresso', ts: '2026-10-23T06:02:10Z' },
      { id: 'b', tipo: 'uscita', ts: '2026-10-23T15:03:40Z' },
    ];
    const out = arrotondaTimbrature(righe, R5);
    expect(out.map((r) => r.ts)).toEqual(['2026-10-23T06:00:00.000Z', '2026-10-23T15:05:00.000Z']);
    expect(out.map((r) => r.id)).toEqual(['a', 'b']);
    expect(righe[0]!.ts).toBe('2026-10-23T06:02:10Z');
  });
  it('arrotondaEventi lavora sui ms del registro', () => {
    const out = arrotondaEventi([{ id: 'x', ms: ms('2026-10-23T06:02:10Z') }], R5);
    expect(out[0]!.ms).toBe(ms('2026-10-23T06:00:00Z'));
  });
  it('⚠️ due timbri nello stesso slot danno un intervallo da zero, non negativo', () => {
    const [a, b] = arrotondaTimbrature(
      [{ ts: '2026-10-23T12:32:31Z' }, { ts: '2026-10-23T12:33:29Z' }],
      R5,
    );
    expect(Date.parse(b!.ts) - Date.parse(a!.ts)).toBe(0);
  });
  it('con passo 0 restituisce una copia identica', () => {
    const righe = [{ ts: '2026-10-23T06:02:10Z' }];
    const out = arrotondaTimbrature(righe, NESSUN_ARROTONDAMENTO);
    expect(out).toEqual(righe);
    expect(out).not.toBe(righe);
  });
});

describe('⚠️ a parita\' di minuto arrotondato conta l\'ordine vero', async () => {
  const { risolviSequenza } = await import('./timbri-sequenza');
  const { presenzaDaEventi } = await import('./timbro-giornata');
  it('pausa, ripresa e fine nello stesso slot: la presenza risulta CHIUSA', () => {
    const base = Date.parse('2026-10-23T10:10:00Z');
    // Esatti: 07:00 in, 10:08:10 pausa, 10:10:30 ripresa, 10:12:20 fine: gesti a
    // piu' di un minuto l'uno dall'altro (non doppioni), che ai 5 minuti cadono
    // tutti e tre su 10:10.
    const esatti = [
      { id: 'in', ms: Date.parse('2026-10-23T07:00:00Z'), tipo: null, orologio: 'fisso' as const },
      { id: 'pausa', ms: base - 110_000, tipo: null, orologio: 'fisso' as const },
      { id: 'ripresa', ms: base + 30_000, tipo: null, orologio: 'fisso' as const },
      { id: 'fine', ms: base + 140_000, tipo: null, orologio: 'fisso' as const },
    ];
    const arrotondati = arrotondaEventi(esatti, R5).map((e, i) => ({ ...e, ordine: esatti[i]!.ms }));
    const r = risolviSequenza(arrotondati);
    expect(r.timbri.map((t) => `${t.id}:${t.tipo}`)).toEqual(['in:ingresso', 'pausa:uscita', 'ripresa:ingresso', 'fine:uscita']);
    const p = presenzaDaEventi(arrotondati);
    expect(p.aperta).toBe(false);
    expect(p.minutiNetti).toBe(190);
  });
});
