'use client';

import * as React from 'react';
import { Document, Page } from 'react-pdf';
import { Loader2 } from 'lucide-react';

import './annotation/pdf-worker';

interface Props {
  src: string;
}

/**
 * Viewer PDF inline con scroll continuo.
 *
 * Tutte le pagine vengono renderizzate consecutivamente in una colonna
 * scrollabile. Niente paginazione manuale: l'utente scorre come in un
 * documento web normale (più intuitivo dei tasti pagina).
 *
 * Performance: per PDF molto grandi (> 50 pagine) può essere lento.
 * Per ora pragmatico — la quasi totalità dei PDF di cantiere sta sotto
 * le 20 pagine. Se diventerà necessario virtualizzeremo (react-window).
 *
 * Width responsive: ogni pagina occupa min(container - 32, 900px).
 */
export function PdfViewer({ src }: Props) {
  const [numPages, setNumPages] = React.useState<number | null>(null);
  const [containerWidth, setContainerWidth] = React.useState<number>(0);
  const [currentPage, setCurrentPage] = React.useState(1);
  const wrapRef = React.useRef<HTMLDivElement>(null);
  const pageRefs = React.useRef<Array<HTMLDivElement | null>>([]);

  React.useEffect(() => {
    const update = () => {
      if (wrapRef.current) setContainerWidth(wrapRef.current.clientWidth);
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  // Aggiorna il contatore della pagina visibile in base allo scroll
  React.useEffect(() => {
    if (!numPages || !wrapRef.current) return;
    const root = wrapRef.current;

    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .map((e) => Number((e.target as HTMLElement).dataset.page))
          .filter((n) => Number.isFinite(n));
        if (visible.length) {
          // pagina con la sezione "più centrale": prendi la prima visibile
          setCurrentPage(Math.min(...visible));
        }
      },
      { root, threshold: 0.3 },
    );

    pageRefs.current.forEach((el) => {
      if (el) obs.observe(el);
    });

    return () => obs.disconnect();
  }, [numPages]);

  const pageWidth = Math.min(containerWidth - 32, 900);

  return (
    <div className="relative flex h-full w-full flex-col bg-neutral-100">
      <div ref={wrapRef} className="flex-1 overflow-auto px-4 py-4">
        <Document
          file={src}
          onLoadSuccess={({ numPages: n }) => {
            setNumPages(n);
            pageRefs.current = new Array(n).fill(null);
          }}
          loading={
            <div className="flex h-full items-center justify-center text-neutral-500">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          }
          error={
            <div className="flex h-full items-center justify-center text-neutral-500">
              Impossibile aprire il PDF
            </div>
          }
          className="flex flex-col items-center gap-4"
        >
          {containerWidth > 0 && numPages
            ? Array.from({ length: numPages }, (_, i) => (
                <div
                  key={`page-${i + 1}`}
                  data-page={i + 1}
                  ref={(el) => {
                    pageRefs.current[i] = el;
                  }}
                  className="shadow-xl ring-1 ring-black/5"
                >
                  <Page
                    pageNumber={i + 1}
                    width={pageWidth}
                    renderAnnotationLayer={false}
                    renderTextLayer={false}
                    loading={
                      <div
                        className="flex items-center justify-center bg-white text-neutral-400"
                        style={{ width: pageWidth, height: pageWidth * 1.41 }}
                      >
                        <Loader2 className="h-5 w-5 animate-spin" />
                      </div>
                    }
                  />
                </div>
              ))
            : null}
        </Document>
      </div>

      {numPages && numPages > 1 && (
        <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2">
          <span className="pointer-events-auto rounded-full bg-white/90 px-3 py-1 font-mono text-[11px] tabular-nums text-neutral-700 shadow-lg ring-1 ring-black/10 backdrop-blur">
            {currentPage} / {numPages}
          </span>
        </div>
      )}
    </div>
  );
}
