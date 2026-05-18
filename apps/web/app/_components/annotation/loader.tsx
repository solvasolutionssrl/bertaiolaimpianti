'use client';

/**
 * Loader client-side per gli editor/viewer del framework annotation.
 *
 * pdfjs-dist e Konva sono entrambi window-dependant → ssr:false + code-split.
 * In questo modo:
 *  - Pagine che listano file (documenti/foto) restano leggere; il bundle
 *    annotator (≈ +200kb gz fra konva+pdfjs+react-pdf) viene caricato
 *    SOLO quando l'utente clicca "Annota".
 *  - Loader visivo bordless: full-screen overlay scuro coerente con
 *    l'EditorShell che monta subito dopo.
 */

import dynamic from 'next/dynamic';
import { Loader2 } from 'lucide-react';

const Loading = () => (
  <div
    role="status"
    aria-label="Apertura editor"
    className="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-3 bg-slate-950 text-slate-100"
  >
    <div className="h-0.5 w-32 animate-pulse bg-gradient-to-r from-primary to-accent" />
    <Loader2 className="h-6 w-6 animate-spin" aria-hidden="true" />
    <p className="text-sm text-slate-300">Apertura editor…</p>
  </div>
);

export const PhotoAnnotator = dynamic(
  () => import('./photo-annotator').then((m) => m.PhotoAnnotator),
  { ssr: false, loading: Loading },
);

export const PdfAnnotator = dynamic(
  () => import('./pdf-annotator').then((m) => m.PdfAnnotator),
  { ssr: false, loading: Loading },
);
