'use client';

/**
 * Loader client-side dell'annotatore PDF.
 *
 * NB: file mantenuto come "facade" verso il modulo `./annotation/loader.tsx`
 * per i consumer storici. I nuovi consumer dovrebbero importare direttamente
 * da `./annotation/loader`.
 */

export { PdfAnnotator } from './annotation/loader';
