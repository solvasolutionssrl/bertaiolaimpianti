'use client';

import * as React from 'react';
import { Document, Page } from 'react-pdf';
import { ChevronUp, ChevronDown, Loader2 } from 'lucide-react';

import './annotation/pdf-worker';

interface Props {
  src: string;
}

/**
 * Viewer PDF inline (riusa react-pdf + worker pdfjs già configurato).
 *
 * Paginazione semplice con frecce ↑↓ e contatore. Per i PDF molto pesanti
 * (>10 MB) il rendering pagina-a-pagina mantiene la memoria contenuta.
 */
export function PdfViewer({ src }: Props) {
  const [numPages, setNumPages] = React.useState<number | null>(null);
  const [page, setPage] = React.useState(1);
  const [containerWidth, setContainerWidth] = React.useState<number>(0);
  const wrapRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const update = () => {
      if (wrapRef.current) {
        setContainerWidth(wrapRef.current.clientWidth);
      }
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  return (
    <div className="relative flex h-full w-full flex-col bg-neutral-900">
      <div
        ref={wrapRef}
        className="flex flex-1 items-start justify-center overflow-auto p-4"
      >
        <Document
          file={src}
          onLoadSuccess={({ numPages: n }) => setNumPages(n)}
          loading={
            <div className="flex h-full items-center justify-center text-white/70">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          }
          error={
            <div className="flex h-full items-center justify-center text-white/70">
              Impossibile aprire il PDF
            </div>
          }
          className="rounded-md shadow-2xl"
        >
          {containerWidth > 0 && (
            <Page
              pageNumber={page}
              width={Math.min(containerWidth - 32, 900)}
              renderAnnotationLayer={false}
              renderTextLayer={false}
              loading={
                <div className="flex h-96 items-center justify-center text-white/70">
                  <Loader2 className="h-5 w-5 animate-spin" />
                </div>
              }
            />
          )}
        </Document>
      </div>

      {numPages && numPages > 1 && (
        <div className="flex items-center justify-center gap-3 border-t border-white/10 bg-black/60 py-2 backdrop-blur">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="rounded-full p-1.5 text-white hover:bg-white/10 disabled:opacity-30"
            aria-label="Pagina precedente"
          >
            <ChevronUp className="h-4 w-4" />
          </button>
          <span className="font-mono text-xs tabular-nums text-white/80">
            {page} / {numPages}
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(numPages, p + 1))}
            disabled={page >= numPages}
            className="rounded-full p-1.5 text-white hover:bg-white/10 disabled:opacity-30"
            aria-label="Pagina successiva"
          >
            <ChevronDown className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}
