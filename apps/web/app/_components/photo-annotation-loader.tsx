'use client';

/**
 * Loader client-side per editor/viewer annotation.
 *
 * NB: file mantenuto come "facade" verso il nuovo modulo
 * `./annotation/loader.tsx` per retro-compatibilità con i consumer
 * storici. I nuovi consumer dovrebbero importare direttamente da
 * `./annotation/loader` per consistenza.
 */

export { PhotoAnnotator as PhotoAnnotationEditor, PdfAnnotator } from './annotation/loader';

// Viewer foto resta col vecchio path (read-only, niente refactor necessario)
import dynamic from 'next/dynamic';
export const PhotoAnnotationViewer = dynamic(
  () => import('./photo-annotation-viewer').then((m) => m.PhotoAnnotationViewer),
  { ssr: false },
);
