/**
 * Il primo fotogramma utile di un video, preso **nel browser**.
 *
 * ## Perché nel browser e non sul server
 *
 * `sharp` non decodifica video, e mettere `ffmpeg` su una funzione serverless
 * vuol dire scaricare da R2 un file che può pesare centinaia di MB per
 * ricavarne un'immagine da 30 KB. Il telefono invece **ha già il file in
 * mano**: lo ha appena ripreso.
 *
 * Il risultato viene caricato come miniatura del video, nello stesso posto
 * dove stanno quelle delle foto, così le gallerie non devono sapere che un
 * video è diverso da una foto.
 *
 * ## Il bug della versione precedente
 *
 * Esisteva già un estrattore, usato solo per l'anteprima locale prima
 * dell'invio e poi buttato. Faceva così:
 *
 * ```
 * video.currentTime = 0.5;
 * video.addEventListener('loadedmetadata'...)   // ← sbagliato
 * ```
 *
 * `currentTime` impostato **prima** che i metadati siano pronti viene
 * ignorato, e `loadeddata` scatta sul fotogramma zero — che in un video
 * ripreso col telefono è quasi sempre nero, perché l'esposizione non si è
 * ancora assestata. Da qui le anteprime nere.
 *
 * L'ordine giusto è: `loadedmetadata` → sposto il tempo → `seeked` → disegno.
 *
 * ## iOS
 *
 * Safari non decodifica un video finché non lo considera «in riproduzione»:
 * serve `muted` e `playsInline`, e conviene chiamare `play()` e fermarlo
 * subito. Se nonostante tutto non arriva niente, si rinuncia: meglio nessuna
 * anteprima che un'attesa infinita.
 */

/** Lato lungo della miniatura. Stesso ordine di grandezza di quelle foto. */
const LATO_MAX = 400;

/** Oltre questo tempo si rinuncia: il video non si lascia leggere. */
const TIMEOUT_MS = 6000;

/**
 * Dove cercare il fotogramma. Mezzo secondo evita il nero iniziale; su un
 * video più corto si va a metà, che è sempre dentro.
 */
function istanteBuono(durata: number): number {
  if (!Number.isFinite(durata) || durata <= 0) return 0;
  return durata < 1 ? durata / 2 : 0.5;
}

export interface Poster {
  blob: Blob;
  larghezza: number;
  altezza: number;
}

/**
 * Prova a estrarre un fotogramma. **Non solleva mai**: se non ci riesce torna
 * `null` e il video resta senza anteprima, che è il comportamento di oggi.
 */
export async function estraiPosterVideo(file: Blob): Promise<Poster | null> {
  if (typeof document === 'undefined') return null;
  if (!file.type.startsWith('video/')) return null;

  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.preload = 'metadata';
  video.muted = true;
  video.playsInline = true;
  // Niente `crossOrigin`: è un blob locale, la canvas non si sporca.
  video.src = url;

  const pulisci = () => {
    video.removeAttribute('src');
    video.load();
    URL.revokeObjectURL(url);
  };

  try {
    const poster = await new Promise<Poster | null>((resolve) => {
      let chiuso = false;
      const finisci = (p: Poster | null) => {
        if (chiuso) return;
        chiuso = true;
        clearTimeout(orologio);
        resolve(p);
      };

      const orologio = setTimeout(() => finisci(null), TIMEOUT_MS);

      const disegna = () => {
        try {
          const w = video.videoWidth;
          const h = video.videoHeight;
          if (!w || !h) return finisci(null);

          const scala = Math.min(1, LATO_MAX / Math.max(w, h));
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(w * scala));
          canvas.height = Math.max(1, Math.round(h * scala));
          const ctx = canvas.getContext('2d');
          if (!ctx) return finisci(null);
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

          canvas.toBlob(
            (blob) => {
              if (!blob || blob.size === 0) return finisci(null);
              finisci({ blob, larghezza: canvas.width, altezza: canvas.height });
            },
            // WebP dove c'è (Safari 14+), altrimenti il browser ripiega da solo
            // su PNG: il tipo vero lo legge il server dal blob, non lo diamo
            // per scontato qui.
            'image/webp',
            0.75,
          );
        } catch {
          finisci(null);
        }
      };

      video.addEventListener('error', () => finisci(null), { once: true });

      video.addEventListener(
        'loadedmetadata',
        () => {
          // ⚠️ L'ORDINE È TUTTO: spostare il tempo PRIMA di qui non ha effetto,
          // ed è il motivo per cui la vecchia anteprima pescava il fotogramma
          // zero, quasi sempre nero.
          video.addEventListener('seeked', disegna, { once: true });
          try {
            video.currentTime = istanteBuono(video.duration);
          } catch {
            // Se il salto non è permesso ci si accontenta di dove siamo.
            disegna();
          }
        },
        { once: true },
      );

      // Su iOS il decodificatore si sveglia solo se il video «sta andando».
      // Si avvia muto e si ferma subito: l'utente non se ne accorge.
      void video.play().then(
        () => video.pause(),
        () => undefined,
      );
    });

    return poster;
  } finally {
    pulisci();
  }
}
