'use client';

import { compressImage } from '../office/commesse/nuova/_lib/compress-image';

/**
 * Decide COSA si spedisce, per un file appena scelto dalla galleria.
 *
 * ─── Piena qualità (31/07/2026) ────────────────────────────────────────────
 * Fino a ieri ogni foto veniva ridisegnata su canvas (2048px, JPEG 0.82)
 * **prima** di entrare in coda, una alla volta e sul main thread. Costo: qualche
 * decimo di secondo per foto, in fila. Sommato alla preparazione che fa iOS per
 * conto suo, l'effetto a schermo era: premi "Aggiungi" nel picker, il telefono
 * resta fermo in silenzio, e solo dopo parte l'upload. Chi guarda non ha modo di
 * distinguere il lavoro nostro da quello di iOS: sembra tutto un blocco.
 *
 * Il cliente ha scelto di caricare a **piena qualità** pur di partire subito. È
 * una scelta difendibile: le foto di cantiere sono documentazione, in galleria
 * si vedono comunque le thumb 400px generate sul server
 * (`_lib/thumbnails.ts`), e gli upload ora vanno in background con ripresa —
 * quindi qualche MB in più costa tempo di rete, non attenzione dell'utente.
 *
 * Resta **una sola valvola**: sopra la soglia qui sotto si comprime ancora. Lì
 * si tratta di foto da 15-25 MB (ProRAW, scanner di terze parti) dove il costo
 * di rete è reale e la ricompressione si ripaga.
 *
 * ⚠️ Non reintrodurre la compressione "per tutte le foto" senza spostarla fuori
 * dal main thread (Web Worker + OffscreenCanvas): è quella, non la qualità, la
 * ragione per cui è stata tolta.
 */
export const SOGLIA_RICOMPRESSIONE_BYTES = 12 * 1024 * 1024;

export type TipoMedia = 'image' | 'video' | 'pdf';

/**
 * Blob da mettere in coda per questo file. Nella stragrande maggioranza dei
 * casi è il file originale, restituito senza toccarlo.
 */
export async function preparaMedia(file: File, kind: TipoMedia): Promise<File> {
  if (kind !== 'image') return file;
  if (file.size <= SOGLIA_RICOMPRESSIONE_BYTES) return file;
  return compressImage(file);
}
