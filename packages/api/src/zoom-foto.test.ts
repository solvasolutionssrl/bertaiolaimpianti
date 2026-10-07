import { describe, expect, it } from 'vitest';

import {
  SCALA_MAX,
  SCALA_MIN,
  ZOOM_A_RIPOSO,
  distanzaFra,
  dopoDoppioTocco,
  limitaScala,
  limitaSpostamento,
  misuraContenuta,
  puntoMedio,
  puoScorrereFraLeFoto,
  spostamentoDopoZoom,
  spostamentoMassimo,
  zoomVersoPunto,
} from './zoom-foto';

const RIQUADRO = { larghezza: 400, altezza: 800 };
// Una foto 4:3 dentro un riquadro stretto: larga 400, alta 300.
const FOTO = { larghezza: 400, altezza: 300 };

describe('limitaScala', () => {
  it('sta fra il minimo e il massimo', () => {
    expect(limitaScala(0.2)).toBe(SCALA_MIN);
    expect(limitaScala(99)).toBe(SCALA_MAX);
    expect(limitaScala(2.5)).toBe(2.5);
  });

  it('un numero che non e un numero rimette la foto com era', () => {
    // Due dita nello stesso punto danno una divisione per zero. La risposta a
    // «non ho capito il gesto» e' tornare a riposo, non restare ingranditi.
    expect(limitaScala(Number.NaN)).toBe(SCALA_MIN);
    expect(limitaScala(Number.POSITIVE_INFINITY)).toBe(SCALA_MIN);
  });
});

describe('spostamentoMassimo: non si trascina cio che si vede tutto', () => {
  it('a riposo non ci si muove', () => {
    const m = spostamentoMassimo(1, RIQUADRO, FOTO);
    expect(m.larghezza).toBe(0);
    expect(m.altezza).toBe(0);
  });

  it('ingrandendo si puo muovere solo di quanto esce dai bordi', () => {
    // A scala 2: larga 800 in un riquadro di 400 → 200 per lato.
    const m = spostamentoMassimo(2, RIQUADRO, FOTO);
    expect(m.larghezza).toBe(200);
    // Alta 600 in un riquadro di 800: ci sta ancora, niente scorrimento.
    expect(m.altezza).toBe(0);
  });

  it('non torna mai un massimo negativo', () => {
    const m = spostamentoMassimo(0.5, RIQUADRO, FOTO);
    expect(m.larghezza).toBeGreaterThanOrEqual(0);
    expect(m.altezza).toBeGreaterThanOrEqual(0);
  });
});

describe('limitaSpostamento: la foto non scappa', () => {
  it('a riposo qualunque trascinamento torna al centro', () => {
    const p = limitaSpostamento({
      spostamento: { x: 500, y: -900 },
      scala: 1,
      contenitore: RIQUADRO,
      immagine: FOTO,
    });
    expect(p).toEqual({ x: 0, y: 0 });
  });

  it('ingrandita si ferma al bordo, non oltre', () => {
    const p = limitaSpostamento({
      spostamento: { x: 5000, y: 5000 },
      scala: 2,
      contenitore: RIQUADRO,
      immagine: FOTO,
    });
    expect(p.x).toBe(200);
    expect(p.y).toBe(0);
  });

  it('dentro i bordi non tocca niente', () => {
    const p = limitaSpostamento({
      spostamento: { x: -50, y: 0 },
      scala: 2,
      contenitore: RIQUADRO,
      immagine: FOTO,
    });
    expect(p.x).toBe(-50);
  });
});

describe('spostamentoDopoZoom: il punto sotto le dita resta fermo', () => {
  it('pizzicando il centro non si sposta niente', () => {
    const p = spostamentoDopoZoom({
      punto: { x: 0, y: 0 },
      spostamento: { x: 0, y: 0 },
      scalaPrima: 1,
      scalaDopo: 2,
    });
    expect(p).toEqual({ x: 0, y: 0 });
  });

  it('pizzicando un punto a lato, quel punto resta dov era', () => {
    const punto = { x: 100, y: 0 };
    const dopo = spostamentoDopoZoom({
      punto,
      spostamento: { x: 0, y: 0 },
      scalaPrima: 1,
      scalaDopo: 2,
    });
    // Verifica diretta: il punto del contenuto che stava sotto `punto` prima
    // deve stare sotto `punto` anche dopo.
    const contenutoPrima = (punto.x - 0) / 1;
    const schermoDopo = contenutoPrima * 2 + dopo.x;
    expect(schermoDopo).toBeCloseTo(punto.x, 6);
  });

  it('vale anche partendo da una foto gia spostata e ingrandita', () => {
    const punto = { x: -73, y: 41 };
    const prima = { x: 25, y: -10 };
    const dopo = spostamentoDopoZoom({
      punto,
      spostamento: prima,
      scalaPrima: 1.7,
      scalaDopo: 3.4,
    });
    const contenuto = { x: (punto.x - prima.x) / 1.7, y: (punto.y - prima.y) / 1.7 };
    expect(contenuto.x * 3.4 + dopo.x).toBeCloseTo(punto.x, 6);
    expect(contenuto.y * 3.4 + dopo.y).toBeCloseTo(punto.y, 6);
  });

  it('una scala di partenza impossibile non produce NaN', () => {
    const p = spostamentoDopoZoom({
      punto: { x: 10, y: 10 },
      spostamento: { x: 1, y: 2 },
      scalaPrima: 0,
      scalaDopo: 2,
    });
    expect(p).toEqual({ x: 1, y: 2 });
  });
});

describe('zoomVersoPunto: i conti messi insieme', () => {
  it('ingrandisce verso il punto e resta dentro i bordi', () => {
    const s = zoomVersoPunto({
      stato: ZOOM_A_RIPOSO,
      punto: { x: 190, y: 0 },
      scalaRichiesta: 3,
      contenitore: RIQUADRO,
      immagine: FOTO,
    });
    expect(s.scala).toBe(3);
    const max = spostamentoMassimo(3, RIQUADRO, FOTO);
    expect(Math.abs(s.spostamento.x)).toBeLessThanOrEqual(max.larghezza + 1e-9);
    expect(Math.abs(s.spostamento.y)).toBeLessThanOrEqual(max.altezza + 1e-9);
  });

  it('rimpicciolendo sotto il minimo si torna esattamente al centro', () => {
    const s = zoomVersoPunto({
      stato: { scala: 3, spostamento: { x: 120, y: 40 } },
      punto: { x: 0, y: 0 },
      scalaRichiesta: 0.3,
      contenitore: RIQUADRO,
      immagine: FOTO,
    });
    expect(s.scala).toBe(SCALA_MIN);
    expect(s.spostamento).toEqual({ x: 0, y: 0 });
  });
});

describe('dopoDoppioTocco', () => {
  it('da riposo ingrandisce', () => {
    const s = dopoDoppioTocco({
      stato: ZOOM_A_RIPOSO,
      punto: { x: 0, y: 0 },
      contenitore: RIQUADRO,
      immagine: FOTO,
    });
    expect(s.scala).toBeGreaterThan(1);
  });

  it('e la via d uscita da QUALUNQUE ingrandimento, non solo dal suo', () => {
    for (const scala of [1.3, 2.5, 4.2, 6]) {
      const s = dopoDoppioTocco({
        stato: { scala, spostamento: { x: 30, y: 10 } },
        punto: { x: 50, y: 50 },
        contenitore: RIQUADRO,
        immagine: FOTO,
      });
      expect(s).toEqual(ZOOM_A_RIPOSO);
    }
  });
});

describe('misuraContenuta: quanto occupa davvero', () => {
  it('una foto larga si adatta alla larghezza', () => {
    const m = misuraContenuta({ larghezza: 4000, altezza: 3000 }, RIQUADRO);
    expect(m.larghezza).toBe(400);
    expect(m.altezza).toBe(300);
  });

  it('una foto alta si adatta all altezza', () => {
    const m = misuraContenuta({ larghezza: 300, altezza: 4000 }, RIQUADRO);
    expect(m.altezza).toBe(800);
    expect(m.larghezza).toBe(60);
  });

  it('senza misure naturali non si divide per zero', () => {
    expect(misuraContenuta({ larghezza: 0, altezza: 0 }, RIQUADRO)).toEqual(RIQUADRO);
  });
});

describe('puoScorrereFraLeFoto: due gesti uguali, vince lo stato', () => {
  it('a riposo il dito cambia foto', () => {
    expect(puoScorrereFraLeFoto(ZOOM_A_RIPOSO)).toBe(true);
  });

  it('ingrandita il dito sposta la foto, non salta alla prossima', () => {
    expect(puoScorrereFraLeFoto({ scala: 2, spostamento: { x: 0, y: 0 } })).toBe(false);
  });
});

describe('due dita', () => {
  it('distanza e punto medio', () => {
    expect(distanzaFra({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
    expect(puntoMedio({ x: 0, y: 0 }, { x: 10, y: 20 })).toEqual({ x: 5, y: 10 });
  });
});
