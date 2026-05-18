'use client';

/**
 * Setup del worker pdf.js (singleton).
 *
 * Strategia di hosting del worker:
 *  - In sviluppo (e default produzione iniziale): CDN jsdelivr per evitare
 *    di dover bundlare e servire il file. Risparmia il primo deploy.
 *  - In produzione finale è consigliabile self-hostare il worker in
 *    `/public/pdf-worker.mjs` per zero dipendenze esterne (PWA offline,
 *    privacy, CSP). Sostituire `workerSrc` con `'/pdf-worker.mjs'`.
 *
 * Lazy-once: setIfNot serve a evitare doppia configurazione (HMR).
 */

import { pdfjs } from 'react-pdf';

declare global {
  // eslint-disable-next-line no-var
  var __PDFJS_WORKER_CONFIGURED__: boolean | undefined;
}

if (typeof window !== 'undefined' && !globalThis.__PDFJS_WORKER_CONFIGURED__) {
  // jsdelivr risolve la versione corretta in base a pdfjs.version
  pdfjs.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
  globalThis.__PDFJS_WORKER_CONFIGURED__ = true;
}

export {};
