import { describe, expect, it } from 'vitest';

import {
  caricaParti,
  eAnnullamento,
  erroreAnnullato,
  type CaricaParte,
  type ParteDaCaricare,
} from './upload-multipart';

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

function parti(n: number): ParteDaCaricare[] {
  return Array.from({ length: n }, (_, i) => ({
    partNumber: i + 1,
    url: `https://r2.example/part/${i + 1}`,
  }));
}

/**
 * Caricatore finto e deterministico.
 * `falliscePart` → quella parte rigetta dopo aver riportato un po' di progresso.
 * `ignoraSignal` → simula un caricatore che NON rispetta l'abort (caso patologico).
 */
function creaCaricatore(opzioni: {
  falliscePart?: number;
  passi?: number;
  ignoraSignal?: boolean;
}) {
  const stato = {
    inVolo: 0,
    maxInVolo: 0,
    avviate: [] as number[],
    /** Progressi emessi DOPO che caricaParti ha già risolto/rigettato. */
    bytesDopoLaFine: 0,
    finito: false,
  };

  const carica: CaricaParte = async (fetta, signal, onBytes) => {
    stato.inVolo += 1;
    stato.maxInVolo = Math.max(stato.maxInVolo, stato.inVolo);
    stato.avviate.push(fetta.partNumber);
    const dimensione = fetta.fine - fetta.inizio;
    const passi = opzioni.passi ?? 3;
    try {
      for (let p = 1; p <= passi; p += 1) {
        await tick();
        if (signal.aborted && !opzioni.ignoraSignal) throw erroreAnnullato();
        if (stato.finito) stato.bytesDopoLaFine += 1;
        onBytes(Math.round((dimensione * p) / passi));
      }
      if (opzioni.falliscePart === fetta.partNumber) {
        throw new Error(`parte ${fetta.partNumber} KO`);
      }
      return `etag-${fetta.partNumber}`;
    } finally {
      stato.inVolo -= 1;
    }
  };

  return { carica, stato };
}

describe('caricaParti — percorso felice', () => {
  it('carica tutte le parti, ritorna gli etag ordinati e un progresso monotono', async () => {
    const { carica, stato } = creaCaricatore({});
    const progressi: number[] = [];

    const risultato = await caricaParti({
      parts: parti(5),
      partSize: 100,
      fileSize: 450, // ultima parte parziale
      concorrenza: 2,
      caricaParte: carica,
      onProgress: (b) => progressi.push(b),
    });

    expect(risultato.map((p) => p.partNumber)).toEqual([1, 2, 3, 4, 5]);
    expect(risultato.map((p) => p.etag)).toEqual([
      'etag-1',
      'etag-2',
      'etag-3',
      'etag-4',
      'etag-5',
    ]);
    // Mai in arretramento.
    for (let i = 1; i < progressi.length; i += 1) {
      expect(progressi[i]!).toBeGreaterThanOrEqual(progressi[i - 1]!);
    }
    expect(progressi.at(-1)).toBe(450);
    expect(stato.maxInVolo).toBeLessThanOrEqual(2);
    expect(stato.inVolo).toBe(0);
  });

  it('rispetta il tetto di concorrenza', async () => {
    const { carica, stato } = creaCaricatore({});
    await caricaParti({
      parts: parti(8),
      partSize: 10,
      fileSize: 80,
      concorrenza: 3,
      caricaParte: carica,
      onProgress: () => {},
    });
    expect(stato.maxInVolo).toBe(3);
  });
});

describe('caricaParti — REPRO del bug "progresso che torna indietro"', () => {
  it('quando una parte fallisce: rigetta, ferma i fratelli e NON lascia worker orfani', async () => {
    const { carica, stato } = creaCaricatore({ falliscePart: 2 });
    const progressi: number[] = [];

    const promessa = caricaParti({
      parts: parti(6),
      partSize: 100,
      fileSize: 600,
      concorrenza: 3,
      caricaParte: carica,
      onProgress: (b) => progressi.push(b),
    });

    await expect(promessa).rejects.toThrow('parte 2 KO');
    stato.finito = true;

    // ⬇️ Il cuore del bug: con `Promise.all` qui restavano worker vivi che
    // continuavano a caricare e a riportare progresso su un tentativo morto.
    expect(stato.inVolo).toBe(0);

    // Nessuna parte NUOVA viene avviata dopo il fallimento.
    const avviateAlFallimento = stato.avviate.length;
    await tick();
    await tick();
    await tick();
    expect(stato.avviate.length).toBe(avviateAlFallimento);
    expect(stato.bytesDopoLaFine).toBe(0);
  });

  it('non emette alcun progresso dopo il fallimento, nemmeno da un caricatore che ignora l\'abort', async () => {
    const { carica, stato } = creaCaricatore({
      falliscePart: 1,
      ignoraSignal: true, // caso patologico: continua a lavorare comunque
    });
    const progressi: number[] = [];
    let finito = false;
    const dopoLaFine: number[] = [];

    const promessa = caricaParti({
      parts: parti(4),
      partSize: 50,
      fileSize: 200,
      concorrenza: 2,
      caricaParte: carica,
      onProgress: (b) => {
        progressi.push(b);
        if (finito) dopoLaFine.push(b);
      },
    });

    await expect(promessa).rejects.toThrow('parte 1 KO');
    finito = true;
    stato.finito = true;

    // Lasciamo girare a vuoto i worker ribelli.
    for (let i = 0; i < 10; i += 1) await tick();

    expect(dopoLaFine).toEqual([]);
  });

  it('il progresso non arretra mai anche se una parte ricomincia da zero', async () => {
    let primoGiro = true;
    const carica: CaricaParte = async (fetta, _signal, onBytes) => {
      const dimensione = fetta.fine - fetta.inizio;
      if (fetta.partNumber === 1 && primoGiro) {
        primoGiro = false;
        onBytes(dimensione); // sale
        await tick();
        onBytes(0); // ...e poi "riparte da zero"
      }
      await tick();
      onBytes(dimensione);
      return `etag-${fetta.partNumber}`;
    };

    const progressi: number[] = [];
    await caricaParti({
      parts: parti(3),
      partSize: 100,
      fileSize: 300,
      concorrenza: 1,
      caricaParte: carica,
      onProgress: (b) => progressi.push(b),
    });

    for (let i = 1; i < progressi.length; i += 1) {
      expect(progressi[i]!).toBeGreaterThanOrEqual(progressi[i - 1]!);
    }
  });
});

describe('caricaParti — RIPRESA di un upload interrotto', () => {
  it('carica solo le parti mancanti, con gli offset giusti nel file', async () => {
    // File da 5 parti: R2 ha già la 1, la 2 e la 4. Restano 3 e 5.
    const fette: Array<{ partNumber: number; inizio: number; fine: number }> = [];
    const carica: CaricaParte = async (fetta, _s, onBytes) => {
      fette.push({
        partNumber: fetta.partNumber,
        inizio: fetta.inizio,
        fine: fetta.fine,
      });
      onBytes(fetta.fine - fetta.inizio);
      return `etag-${fetta.partNumber}`;
    };

    const progressi: number[] = [];
    const risultato = await caricaParti({
      parts: [
        { partNumber: 3, url: 'u3' },
        { partNumber: 5, url: 'u5' },
      ],
      partSize: 100,
      fileSize: 450,
      concorrenza: 2,
      caricaParte: carica,
      onProgress: (b) => progressi.push(b),
      bytesIniziali: 300, // parti 1, 2 e 4 già su R2
    });

    // Gli offset devono venire dal NUMERO di parte, non dalla posizione:
    // parte 3 → 200..300, parte 5 → 400..450 (ultima, parziale).
    expect(fette.find((f) => f.partNumber === 3)).toEqual({
      partNumber: 3,
      inizio: 200,
      fine: 300,
    });
    expect(fette.find((f) => f.partNumber === 5)).toEqual({
      partNumber: 5,
      inizio: 400,
      fine: 450,
    });
    expect(risultato.map((p) => p.partNumber)).toEqual([3, 5]);
    // La barra riparte da quello che c'era già, non da zero.
    expect(progressi[0]).toBeGreaterThanOrEqual(300);
    expect(progressi.at(-1)).toBe(450);
  });

  it('il progresso di una ripresa non parte mai sotto i byte già presenti', async () => {
    const carica: CaricaParte = async (fetta, _s, onBytes) => {
      onBytes(0); // il primo evento di XHR riporta 0
      onBytes(fetta.fine - fetta.inizio);
      return `etag-${fetta.partNumber}`;
    };
    const progressi: number[] = [];
    await caricaParti({
      parts: [{ partNumber: 2, url: 'u2' }],
      partSize: 100,
      fileSize: 200,
      concorrenza: 1,
      caricaParte: carica,
      onProgress: (b) => progressi.push(b),
      bytesIniziali: 100,
    });
    expect(Math.min(...progressi)).toBeGreaterThanOrEqual(100);
  });
});

describe('caricaParti — annullamento esterno', () => {
  it('propaga un AbortError e non lascia nulla in volo', async () => {
    const { carica, stato } = creaCaricatore({ passi: 20 });
    const controller = new AbortController();

    const promessa = caricaParti({
      parts: parti(4),
      partSize: 100,
      fileSize: 400,
      concorrenza: 2,
      caricaParte: carica,
      onProgress: () => {},
      signalEsterno: controller.signal,
    });

    await tick();
    await tick();
    controller.abort();

    await expect(promessa).rejects.toSatisfy(eAnnullamento);
    expect(stato.inVolo).toBe(0);
  });

  it('se il signal è già abortito non avvia nessuna parte', async () => {
    const { carica, stato } = creaCaricatore({});
    const controller = new AbortController();
    controller.abort();

    await expect(
      caricaParti({
        parts: parti(3),
        partSize: 10,
        fileSize: 30,
        concorrenza: 2,
        caricaParte: carica,
        onProgress: () => {},
        signalEsterno: controller.signal,
      }),
    ).rejects.toSatisfy(eAnnullamento);

    expect(stato.avviate).toEqual([]);
  });
});
