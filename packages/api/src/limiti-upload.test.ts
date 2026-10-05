import { describe, it, expect } from 'vitest';

import {
  LIMITI_UPLOAD_FALLBACK,
  MINIMI_UPLOAD,
  TETTI_UPLOAD,
  limitiParzialiDaConfig,
  risolviLimitiUpload,
  validaLimitiUpload,
  applicaLimitiAConfig,
  sogliaAvvisoNumero,
  sogliaAvvisoVideoMb,
} from './limiti-upload';

describe('limitiParzialiDaConfig', () => {
  it('tiene solo i numeri sensati', () => {
    expect(
      limitiParzialiDaConfig({
        maxFile: 80,
        maxFotoMb: 30,
        maxVideoMb: 'tanti',
        maxDocMb: null,
      }),
    ).toEqual({ maxFile: 80, maxFotoMb: 30 });
  });

  it('scarta zero, negativi, non finiti e chiavi sconosciute', () => {
    expect(
      limitiParzialiDaConfig({
        maxFile: 0,
        maxFotoMb: -5,
        maxVideoMb: Number.POSITIVE_INFINITY,
        maxDocMb: Number.NaN,
        colore: 'rosso',
      }),
    ).toEqual({});
  });

  it('tronca i decimali', () => {
    expect(limitiParzialiDaConfig({ maxFile: 42.9 })).toEqual({ maxFile: 42 });
  });

  it('sopporta un jsonb che non e un oggetto', () => {
    for (const raw of [null, undefined, 'niente', 7, [], [1, 2]]) {
      expect(limitiParzialiDaConfig(raw)).toEqual({});
    }
  });
});

describe('risolviLimitiUpload', () => {
  it('senza sorgenti usa il fallback', () => {
    expect(risolviLimitiUpload(null, null)).toEqual(LIMITI_UPLOAD_FALLBACK);
  });

  it('il globale vince sul fallback', () => {
    const r = risolviLimitiUpload({ maxFile: 70 }, null);
    expect(r.maxFile).toBe(70);
    expect(r.maxFotoMb).toBe(LIMITI_UPLOAD_FALLBACK.maxFotoMb);
  });

  it('il tenant vince sul globale, campo per campo', () => {
    const r = risolviLimitiUpload(
      { maxFile: 70, maxFotoMb: 30 },
      { maxFile: 12 },
    );
    expect(r.maxFile).toBe(12);
    // Chiave assente nel tenant: eredita il globale, non azzera.
    expect(r.maxFotoMb).toBe(30);
  });

  it('taglia ai tetti di piattaforma', () => {
    const r = risolviLimitiUpload(null, {
      maxFile: 100_000,
      maxFotoMb: 99_999,
      maxVideoMb: 99_999,
      maxDocMb: 99_999,
    });
    expect(r).toEqual(TETTI_UPLOAD);
  });

  it('taglia ai minimi', () => {
    // 0 e negativi non passano nemmeno il filtro: resta il fallback.
    expect(risolviLimitiUpload(null, { maxFile: -3 }).maxFile).toBe(
      LIMITI_UPLOAD_FALLBACK.maxFile,
    );
    // Un minimo esplicito valido resta.
    expect(risolviLimitiUpload(null, { maxFile: 1 }).maxFile).toBe(MINIMI_UPLOAD.maxFile);
  });

  it('e stabile: stessi ingressi, stessa uscita', () => {
    const a = risolviLimitiUpload({ maxFile: 60 }, { maxVideoMb: 800 });
    const b = risolviLimitiUpload({ maxFile: 60 }, { maxVideoMb: 800 });
    expect(a).toEqual(b);
  });
});

describe('validaLimitiUpload', () => {
  it('accetta numeri in range e li normalizza', () => {
    const r = validaLimitiUpload({ maxFile: '60', maxFotoMb: 30 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.valori).toEqual({ maxFile: 60, maxFotoMb: 30 });
  });

  it('il campo vuoto significa "eredita": esce come null', () => {
    const r = validaLimitiUpload({ maxFile: '', maxFotoMb: null, maxVideoMb: '   ' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.valori).toEqual({ maxFile: null, maxFotoMb: null, maxVideoMb: null });
  });

  it('rifiuta i fuori range dicendo quale e perche', () => {
    const r = validaLimitiUpload({ maxFile: 100_000 });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errori).toHaveLength(1);
      expect(r.errori[0]).toContain('500');
    }
  });

  it('rifiuta cio che non e un numero', () => {
    const r = validaLimitiUpload({ maxVideoMb: 'molti' });
    expect(r.ok).toBe(false);
  });

  it('rifiuta i decimali invece di arrotondarli di nascosto', () => {
    const r = validaLimitiUpload({ maxFotoMb: 12.5 });
    expect(r.ok).toBe(false);
  });

  it('raccoglie tutti gli errori, non solo il primo', () => {
    const r = validaLimitiUpload({ maxFile: 0, maxVideoMb: 99_999 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errori).toHaveLength(2);
  });

  it('ignora le chiavi che non sono limiti', () => {
    const r = validaLimitiUpload({ tenantId: 'abc', maxFile: 50 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.valori).toEqual({ maxFile: 50 });
  });
});

describe('applicaLimitiAConfig', () => {
  it('scrive i numeri e lascia stare il resto', () => {
    expect(applicaLimitiAConfig({ maxFile: 50, maxFotoMb: 25 }, { maxFile: 80 })).toEqual({
      maxFile: 80,
      maxFotoMb: 25,
    });
  });

  it('un null RIMUOVE la chiave: il campo torna a ereditare', () => {
    expect(applicaLimitiAConfig({ maxFile: 80, maxFotoMb: 25 }, { maxFile: null })).toEqual({
      maxFotoMb: 25,
    });
  });

  it('parte da zero se il precedente e spazzatura', () => {
    expect(applicaLimitiAConfig('rotto', { maxFile: 50 })).toEqual({ maxFile: 50 });
  });

  it('non tocca una chiave che il form non ha mandato', () => {
    // Una pagina piu vecchia che non conosce maxDocMb non deve cancellarlo.
    expect(applicaLimitiAConfig({ maxDocMb: 120 }, { maxFile: 50 })).toEqual({
      maxDocMb: 120,
      maxFile: 50,
    });
  });

  it('svuotare tutto lascia un oggetto vuoto, non dei null', () => {
    const r = applicaLimitiAConfig(
      { maxFile: 80, maxFotoMb: 30 },
      { maxFile: null, maxFotoMb: null, maxVideoMb: null, maxDocMb: null },
    );
    expect(r).toEqual({});
  });
});

describe('soglie di avviso', () => {
  it('coi valori di sempre danno i numeri di sempre', () => {
    // 50 file -> avviso a 40; video da 500 MB -> "grande" sopra i 200.
    expect(sogliaAvvisoNumero(50)).toBe(40);
    expect(sogliaAvvisoVideoMb(500)).toBe(200);
  });

  it('non scendono mai a zero', () => {
    // Col limite a 1 la soglia a 0 avrebbe mostrato "quasi al limite" con
    // ZERO file selezionati, e "video grande (>0 MB)" su qualunque video.
    expect(sogliaAvvisoNumero(1)).toBe(1);
    expect(sogliaAvvisoVideoMb(1)).toBe(1);
    expect(sogliaAvvisoVideoMb(2)).toBe(1);
  });

  it('restano sotto il limite che annunciano', () => {
    for (const n of [1, 2, 3, 5, 10, 50, 500]) {
      expect(sogliaAvvisoNumero(n)).toBeLessThanOrEqual(n);
      expect(sogliaAvvisoVideoMb(n)).toBeLessThanOrEqual(n);
    }
  });

  it('sopportano un ingresso assurdo', () => {
    expect(sogliaAvvisoNumero(0)).toBe(1);
    expect(sogliaAvvisoNumero(-5)).toBe(1);
    expect(sogliaAvvisoVideoMb(Number.NaN)).toBe(1);
  });
});

describe('applicaLimitiAConfig: convivenza con chiavi non nostre', () => {
  it('NON cancella una chiave che non e un limite', () => {
    // Il docblock promette di non toccare cio che non e stato modificato.
    // Partendo dal parziale filtrato, qualunque altra chiave del jsonb
    // sparirebbe al primo salvataggio: `upload_config` non si chiama
    // `limiti_upload`, qualcuno ci mettera qualcosa accanto.
    expect(
      applicaLimitiAConfig({ colore: 'rosso', maxFile: 50 }, { maxFile: 80 }),
    ).toEqual({ colore: 'rosso', maxFile: 80 });
  });

  it('non tocca un valore storto che nessuno ha modificato', () => {
    expect(applicaLimitiAConfig({ maxFotoMb: 12.5 }, { maxFile: 50 })).toEqual({
      maxFotoMb: 12.5,
      maxFile: 50,
    });
  });
});

describe('limitiParzialiDaConfig: numeri scritti come stringa', () => {
  it('accetta un numero arrivato come stringa dal jsonb', () => {
    // In lettura si e tolleranti: `{"maxFile": "80"}` scritto da SQL veniva
    // ignorato in silenzio e il pannello mostrava il campo vuoto.
    expect(limitiParzialiDaConfig({ maxFile: '80', maxFotoMb: ' 30 ' })).toEqual({
      maxFile: 80,
      maxFotoMb: 30,
    });
  });

  it('una stringa che non e un numero resta scartata', () => {
    expect(limitiParzialiDaConfig({ maxFile: 'tanti', maxFotoMb: '' })).toEqual({});
  });
});
