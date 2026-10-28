import { describe, expect, it } from 'vitest';
import { estremiGiornata, pausaImplicita, type TimbraturaGiornata } from './riallocazione-giornata';

const t = (tipo: 'ingresso' | 'uscita', ora: string, pausa = false, modalita: string | null = 'app'): TimbraturaGiornata => ({
  tipo,
  pausa,
  ts: `2026-10-26T${ora}:00.000Z`,
  modalita,
});

describe('estremi di una giornata da riallocare', () => {
  it('inizio e fine sono il primo ingresso e l\'ultima uscita di lavoro', () => {
    const e = estremiGiornata([t('ingresso', '07:00'), t('uscita', '11:00'), t('ingresso', '11:30'), t('uscita', '16:00')]);
    expect(e.ok && [e.inizioMs, e.fineMs]).toEqual([Date.parse('2026-10-26T07:00:00Z'), Date.parse('2026-10-26T16:00:00Z')]);
    // Il buco fra due cantieri e' strada, non pausa: resta dentro la presenza.
    expect(e.ok && e.intervalli.length).toBe(1);
  });

  it('una pausa timbrata resta fuori dagli intervalli e non si cambia', () => {
    const e = estremiGiornata([
      t('ingresso', '07:00'),
      t('uscita', '12:00', true, 'app'),
      t('ingresso', '12:45', true, 'app'),
      t('uscita', '16:00'),
    ]);
    expect(e.ok && e.pausaTimbrataMin).toBe(45);
    expect(e.ok && e.pausaDichiarataMin).toBe(0);
    expect(e.ok && e.intervalli.map((i) => (i.fineMs - i.inizioMs) / 60_000)).toEqual([300, 195]);
  });

  it('una pausa dichiarata si conta a parte e la presenza resta intera', () => {
    const e = estremiGiornata([
      t('ingresso', '07:00', false, 'giornata_dichiarata'),
      t('uscita', '11:45', true, 'giornata_dichiarata'),
      t('ingresso', '12:15', true, 'giornata_dichiarata'),
      t('uscita', '16:00', false, 'giornata_dichiarata'),
    ]);
    expect(e.ok && e.pausaDichiarataMin).toBe(30);
    expect(e.ok && e.pausaTimbrataMin).toBe(0);
    expect(e.ok && e.intervalli.map((i) => (i.fineMs - i.inizioMs) / 60_000)).toEqual([540]);
  });

  it('una pausa aggiunta dopo con «pausa_dichiarata» si puo\' cambiare', () => {
    const e = estremiGiornata([t('ingresso', '07:00'), t('uscita', '11:30', true, 'pausa_dichiarata'), t('ingresso', '12:00', true, 'pausa_dichiarata'), t('uscita', '16:00')]);
    expect(e.ok && e.pausaDichiarataMin).toBe(30);
  });

  it('le righe vecchie senza modalita: manuale e\' dichiarata, qr e\' timbrata', () => {
    const vecchia = (origine: string) =>
      estremiGiornata([
        t('ingresso', '07:00', false, null),
        { ...t('uscita', '12:00', true, null), origine },
        { ...t('ingresso', '12:30', true, null), origine },
        t('uscita', '16:00', false, null),
      ]);
    const m = vecchia('manuale');
    const q = vecchia('qr');
    expect(m.ok && [m.pausaDichiarataMin, m.pausaTimbrataMin]).toEqual([30, 0]);
    expect(q.ok && [q.pausaDichiarataMin, q.pausaTimbrataMin]).toEqual([0, 30]);
  });

  it('una giornata senza uscita non si rialloca', () => {
    expect(estremiGiornata([t('ingresso', '07:00')])).toEqual({ ok: false, error: 'GIORNATA_NON_CHIUSA' });
  });
});

describe('pausa non segnata', () => {
  const giornata = [t('ingresso', '07:00'), t('uscita', '11:00'), t('ingresso', '12:00'), t('uscita', '16:00')];
  it('un\'ora di buco con mezz\'ora di strada: mezz\'ora di pausa', () => {
    expect(pausaImplicita(giornata, 30)).toBe(30);
  });
  it('tutto il buco e\' strada: nessuna pausa', () => {
    expect(pausaImplicita(giornata, 60)).toBe(0);
  });
  it('un cantiere solo, nessun buco: nessuna pausa', () => {
    expect(pausaImplicita([t('ingresso', '07:00'), t('uscita', '16:00')], 0)).toBe(0);
  });
});
