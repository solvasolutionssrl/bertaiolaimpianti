import { describe, expect, it } from 'vitest';

import {
  STATI_CANTIERE_VIVI,
  STATI_COMMESSA_SU_MOBILE,
  cantiereImputabile,
  commessaImputabile,
  commessaSoloLettura,
  commessaVisibileSuMobile,
  motivoCantiereChiuso,
} from './stato-lavoro';

/** Gli stati di una commessa su cui si lavora ancora. */
const IN_LAVORAZIONE = ['bozza', 'aperta', 'in_corso', 'collaudo'] as const;

describe('cantieri', () => {
  it('un cantiere chiuso non accetta piu\' registrazioni', () => {
    expect(cantiereImputabile('chiuso')).toBe(false);
  });

  it('attivo e sospeso restano imputabili', () => {
    expect(cantiereImputabile('attivo')).toBe(true);
    // Sospeso e' una pausa, non una fine: le ore di chi ci lavora comunque
    // devono poter entrare.
    expect(cantiereImputabile('sospeso')).toBe(true);
  });

  it('uno stato sconosciuto o mancante conta come vivo', () => {
    // Meglio un\'ora di troppo che rifiutarne una vera per un dato sporco.
    expect(cantiereImputabile(null)).toBe(true);
    expect(cantiereImputabile(undefined)).toBe(true);
    expect(cantiereImputabile('')).toBe(true);
    expect(cantiereImputabile('boh')).toBe(true);
  });

  it('la whitelist degli elenchi contiene esattamente i vivi', () => {
    expect([...STATI_CANTIERE_VIVI]).toEqual(['attivo', 'sospeso']);
    for (const s of STATI_CANTIERE_VIVI) expect(cantiereImputabile(s)).toBe(true);
  });
});

describe('commesse', () => {
  it('completata e archiviata contano come chiuse', () => {
    // Non e' un divieto: sono le due su cui l'app chiede conferma prima di
    // aggiungere. Il server non rifiuta (le foto arrivano anche dalle API).
    expect(commessaImputabile('completata')).toBe(false);
    expect(commessaImputabile('archiviata')).toBe(false);
  });

  it('gli stati di lavorazione restano imputabili', () => {
    for (const s of IN_LAVORAZIONE) expect(commessaImputabile(s)).toBe(true);
  });

  it('la differenza fra completata e archiviata sta nel telefono', () => {
    // Completata: il lavoro e' finito ma si guarda ancora, anche da fuori.
    expect(commessaVisibileSuMobile('completata')).toBe(true);
    // Archiviata: tolta di mezzo apposta.
    expect(commessaVisibileSuMobile('archiviata')).toBe(false);
  });

  it('una commessa viva si vede sempre da telefono', () => {
    for (const s of IN_LAVORAZIONE) expect(commessaVisibileSuMobile(s)).toBe(true);
  });

  it('sola lettura e\' l\'esatto contrario di imputabile', () => {
    for (const s of [...IN_LAVORAZIONE, 'completata', 'archiviata', null]) {
      expect(commessaSoloLettura(s)).toBe(!commessaImputabile(s));
    }
  });

  it('uno stato sconosciuto conta come vivo, come per i cantieri', () => {
    expect(commessaImputabile(null)).toBe(true);
    expect(commessaImputabile('boh')).toBe(true);
    expect(commessaVisibileSuMobile(null)).toBe(true);
  });

  it('la lista per gli elenchi mobile e\' la regola applicata, non un elenco a mano', () => {
    // Il filtro delle pagine mobile e' lato query: serve una lista. Questa
    // pero' si deriva dalla funzione, cosi' i due modi di dire la stessa
    // regola non possono divergere.
    expect([...STATI_COMMESSA_SU_MOBILE]).toEqual([
      'bozza',
      'aperta',
      'in_corso',
      'collaudo',
      'completata',
    ]);
    for (const s of STATI_COMMESSA_SU_MOBILE) {
      expect(commessaVisibileSuMobile(s)).toBe(true);
    }
    expect(STATI_COMMESSA_SU_MOBILE).not.toContain('archiviata');
  });
});

describe('messaggi', () => {
  it('il motivo del cantiere nomina il cantiere quando lo sappiamo', () => {
    expect(motivoCantiereChiuso('Fincantieri')).toContain('Fincantieri');
    expect(motivoCantiereChiuso(null)).toContain('chiuso');
  });
});
