import { describe, expect, it } from 'vitest';
import { componiCatenaGiornata, estremiViaggio, pausePranzo, type ViaggioCatena } from './giornata-catena';

const T = (hhmm: string) => `2026-10-23T${hhmm}:00.000Z`;

/** La giornata vera del 23/10: badge, due cantieri con fase, pausa, tre tratte. */
const timbrature = [
  { tipo: 'ingresso', ts: T('07:40'), commessaTitolo: 'Fincantieri Monfalcone › 25098.01', origine: 'qr' },
  { tipo: 'uscita', ts: T('12:30'), pausa: true, origine: 'qr' },
  { tipo: 'ingresso', ts: T('13:00'), commessaTitolo: 'Fincantieri Monfalcone › 25098.01', origine: 'qr' },
  { tipo: 'uscita', ts: T('14:15'), origine: 'qr' },
  { tipo: 'ingresso', ts: T('14:40'), commessaTitolo: 'Elettra Trieste › 25151.2', origine: 'cronometro' },
  { tipo: 'uscita', ts: T('17:10'), origine: 'cronometro' },
];
const viaggi: ViaggioCatena[] = [
  { id: 'a', direzione: 'andata', sede: 'Sede', cantiere: 'Fincantieri Monfalcone', km: 42, minuti: 35, autista: true },
  { id: 't', direzione: 'andata', sede: 'Sede', cantiere: 'Elettra Trieste', km: 28, minuti: 25, autista: true, daCantiere: 'Fincantieri Monfalcone' },
  { id: 'r', direzione: 'ritorno', sede: 'Sede', cantiere: 'Elettra Trieste', km: 31, minuti: 30, autista: false },
];
const passaggi = [
  { id: 'b1', ts: T('07:05'), tipo: 'ingresso' as const },
  { id: 'b2', ts: T('17:45'), tipo: 'uscita' as const },
];

describe('componiCatenaGiornata', () => {
  it('mette la giornata vera in un ordine solo, e il viaggio dove va', () => {
    const { eventi, coda } = componiCatenaGiornata({ timbrature, viaggi, passaggi });
    expect(coda).toEqual([]);
    expect(
      eventi.map((e) =>
        e.kind === 'viaggio' ? `viaggio:${e.viaggio.id}` : e.kind === 'passaggio' ? `badge:${e.passaggio.tipo}` : e.kind,
      ),
    ).toEqual([
      'badge:ingresso',
      'viaggio:a',
      'lavoro',
      'pausa',
      'lavoro',
      'viaggio:t',
      'lavoro',
      'viaggio:r',
      'badge:uscita',
    ]);
  });

  it('⚠️ la pausa sta FRA i due segmenti, non dopo entrambi (era il difetto)', () => {
    const { eventi } = componiCatenaGiornata({ timbrature });
    const i = eventi.findIndex((e) => e.kind === 'pausa');
    expect(eventi[i - 1]?.kind).toBe('lavoro');
    expect(eventi[i + 1]?.kind).toBe('lavoro');
    const pausa = eventi[i]!;
    expect(pausa.kind === 'pausa' && pausa.minuti).toBe(30);
  });

  it("l'andata finisce sul primo ingresso, quindi comincia `minuti` prima", () => {
    const { eventi } = componiCatenaGiornata({ timbrature, viaggi: [viaggi[0]!] });
    const v = eventi.find((e) => e.kind === 'viaggio')!;
    expect(v.ts).toBe(T('07:05'));
    expect(v.kind === 'viaggio' && v.ancorato).toBe(true);
  });

  it("il ritorno parte dall'ultima uscita", () => {
    const { eventi } = componiCatenaGiornata({ timbrature, viaggi: [viaggi[2]!] });
    const v = eventi.find((e) => e.kind === 'viaggio')!;
    expect(v.ts).toBe(T('17:10'));
  });

  it('il trasferimento sta nel buco fra il cantiere che lascia e quello su cui arriva', () => {
    const { eventi } = componiCatenaGiornata({ timbrature, viaggi: [viaggi[1]!] });
    const v = eventi.find((e) => e.kind === 'viaggio')!;
    expect(v.ts).toBe(T('14:15'));
  });

  it('⚠️ il luogo è «Cantiere › Fase»: il confronto guarda la radice', () => {
    const solaFase = timbrature.map((t) =>
      t.commessaTitolo ? { ...t, commessaTitolo: `${t.commessaTitolo} (in corso)` } : t,
    );
    const { eventi, coda } = componiCatenaGiornata({ timbrature: solaFase, viaggi: [viaggi[1]!] });
    expect(coda).toEqual([]);
    expect(eventi.find((e) => e.kind === 'viaggio')!.ts).toBe(T('14:15'));
  });

  it('⚠️ una tratta che non si ancora NON si perde: va in coda, dichiarata', () => {
    const orfana: ViaggioCatena = {
      id: 'x', direzione: 'andata', sede: 'Sede', cantiere: 'Cantiere mai timbrato', km: 10, minuti: 12, autista: true,
      daCantiere: 'Un altro mai timbrato',
    };
    const { eventi, coda } = componiCatenaGiornata({ timbrature, viaggi: [orfana] });
    expect(eventi.some((e) => e.kind === 'viaggio')).toBe(false);
    expect(coda).toHaveLength(1);
    expect(coda[0]!.kind === 'viaggio' && coda[0]!.ancorato).toBe(false);
  });

  it('il trasferimento parte da quando LASCIA A, non da quando arriva su B', () => {
    // Buco di 45 minuti per una tratta stimata 25: i due percorsi di
    // ancoraggio divergono (14:15 contro 14:35) e deve vincere il primo.
    // Senza questo caso la mutazione che disattiva l'ancoraggio primario
    // passava: sui dati del 23/10 i due percorsi coincidono per caso.
    const conBuco = [
      { tipo: 'ingresso', ts: T('07:40'), commessaTitolo: 'Fincantieri Monfalcone' },
      { tipo: 'uscita', ts: T('14:15') },
      { tipo: 'ingresso', ts: T('15:00'), commessaTitolo: 'Elettra Trieste' },
      { tipo: 'uscita', ts: T('17:10') },
    ];
    const v = componiCatenaGiornata({ timbrature: conBuco, viaggi: [viaggi[1]!] }).eventi.find(
      (e) => e.kind === 'viaggio',
    )!;
    expect(v.ts).toBe(T('14:15'));
    expect(v.ts).not.toBe(T('14:35'));
  });

  it('se il cantiere di partenza non combacia si ripiega sull arrivo, senza perdere la tratta', () => {
    const senzaA = [
      { tipo: 'ingresso', ts: T('07:40'), commessaTitolo: 'Un cantiere mai nominato' },
      { tipo: 'uscita', ts: T('14:15') },
      { tipo: 'ingresso', ts: T('15:00'), commessaTitolo: 'Elettra Trieste' },
      { tipo: 'uscita', ts: T('17:10') },
    ];
    const { eventi, coda } = componiCatenaGiornata({ timbrature: senzaA, viaggi: [viaggi[1]!] });
    expect(coda).toEqual([]);
    expect(eventi.find((e) => e.kind === 'viaggio')!.ts).toBe(T('14:35'));
  });

  it('senza nessuna timbratura le tratte restano visibili in coda', () => {
    const { eventi, coda } = componiCatenaGiornata({ viaggi });
    expect(eventi).toEqual([]);
    expect(coda).toHaveLength(3);
  });

  it('una giornata ancora aperta non perde il segmento in corso', () => {
    const aperta = [{ tipo: 'ingresso', ts: T('08:00'), commessaTitolo: 'Elettra Trieste' }];
    const { eventi } = componiCatenaGiornata({ timbrature: aperta });
    expect(eventi).toHaveLength(1);
    const l = eventi[0]!;
    expect(l.kind === 'lavoro' && l.fine).toBe(null);
  });

  it('non esplode sul vuoto', () => {
    expect(componiCatenaGiornata({})).toEqual({ eventi: [], coda: [] });
  });
});

describe('estremiViaggio', () => {
  it('nomina gli estremi secondo la direzione, e A → B sul trasferimento', () => {
    expect(estremiViaggio(viaggi[0]!)).toEqual({ da: 'Sede', a: 'Fincantieri Monfalcone' });
    expect(estremiViaggio(viaggi[2]!)).toEqual({ da: 'Elettra Trieste', a: 'Sede' });
    expect(estremiViaggio(viaggi[1]!)).toEqual({ da: 'Fincantieri Monfalcone', a: 'Elettra Trieste' });
  });
});

describe('pausePranzo', () => {
  it('una pausa non chiusa resta aperta invece di sparire', () => {
    const p = pausePranzo([
      { tipo: 'ingresso', ts: T('08:00') },
      { tipo: 'uscita', ts: T('12:30'), pausa: true },
    ]);
    expect(p).toEqual([{ inizio: T('12:30'), fine: null, auto: false }]);
  });

  it('segna la ripresa chiusa in automatico', () => {
    const p = pausePranzo([
      { tipo: 'uscita', ts: T('12:30'), pausa: true },
      { tipo: 'ingresso', ts: T('14:00'), pausa: true, autoChiusa: true },
    ]);
    expect(p[0]!.auto).toBe(true);
  });
});
