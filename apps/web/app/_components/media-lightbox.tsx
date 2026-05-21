'use client';

import * as React from 'react';
import dynamic from 'next/dynamic';
import {
  ChevronLeft,
  ChevronRight,
  X as XIcon,
  Download,
  Loader2,
} from 'lucide-react';

import { VideoPlayer } from './video-player';

const PdfViewer = dynamic(() => import('./pdf-viewer').then((m) => m.PdfViewer), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center text-white/70">
      <Loader2 className="h-5 w-5 animate-spin" />
    </div>
  ),
});

export interface MediaItem {
  id: string;
  src: string;
  mime: string;
  filename: string;
  /** URL alternativo per download/apertura esterna (default: src). */
  downloadUrl?: string;
}

interface Props {
  items: MediaItem[];
  initialIndex: number;
  onClose: () => void;
}

const SWIPE_THRESHOLD = 60;

/**
 * Visualizzatore full-screen per immagini, video e PDF con swipe/frecce
 * per navigare nella collezione.
 *
 * Player video: custom (componenti VideoPlayer), niente controlli browser.
 * PDF: react-pdf lazy-loaded.
 *
 * Tastiera:
 *  - Esc          → chiudi
 *  - ArrowLeft/→  → prev/next
 *
 * Touch:
 *  - swipe orizz. → prev/next (soglia 60px) — bloccato per video/PDF perché
 *    interferirebbe con scrub / pan.
 *  - tap fuori    → chiudi (solo backdrop)
 */
export function MediaLightbox({ items, initialIndex, onClose }: Props) {
  const [index, setIndex] = React.useState(
    Math.max(0, Math.min(initialIndex, items.length - 1)),
  );
  const touchStartXRef = React.useRef<number | null>(null);

  const current = items[index];
  const total = items.length;

  const next = React.useCallback(() => {
    setIndex((i) => Math.min(i + 1, items.length - 1));
  }, [items.length]);

  const prev = React.useCallback(() => {
    setIndex((i) => Math.max(i - 1, 0));
  }, []);

  React.useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft') prev();
      else if (e.key === 'ArrowRight') next();
    };
    window.addEventListener('keydown', onKey);

    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [next, prev, onClose]);

  if (!current) return null;

  const isImage = current.mime.startsWith('image/');
  const isVideo = current.mime.startsWith('video/');
  const isPdf =
    current.mime === 'application/pdf' || /\.pdf$/i.test(current.filename);

  // Swipe solo per immagini (su video/pdf interferisce con scrub/pan)
  const swipeEnabled = isImage;

  const handleTouchStart = (e: React.TouchEvent) => {
    if (!swipeEnabled) return;
    touchStartXRef.current = e.touches[0]?.clientX ?? null;
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!swipeEnabled) return;
    const start = touchStartXRef.current;
    if (start == null) return;
    const endX = e.changedTouches[0]?.clientX ?? start;
    const delta = endX - start;
    touchStartXRef.current = null;
    if (delta > SWIPE_THRESHOLD) prev();
    else if (delta < -SWIPE_THRESHOLD) next();
  };

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex animate-fade-in flex-col bg-black/95 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-label={`Anteprima ${current.filename}`}
      style={{ animation: 'fadeIn .15s ease-out' }}
    >
      <style jsx>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
      `}</style>
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/5 bg-black/30 px-4 py-3 text-white backdrop-blur-md">
        <div className="flex min-w-0 items-center gap-3">
          <span className="font-mono text-[11px] tabular-nums text-white/60">
            {String(index + 1).padStart(2, '0')}
            <span className="mx-1 text-white/30">/</span>
            {String(total).padStart(2, '0')}
          </span>
          <p
            className="hidden truncate font-mono text-xs text-white/80 sm:block"
            title={current.filename}
          >
            {current.filename}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <a
            href={current.downloadUrl ?? current.src}
            download={current.filename}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-full p-2 transition hover:bg-white/10"
            aria-label="Scarica"
            title="Scarica"
          >
            <Download className="h-4 w-4" />
          </a>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 transition hover:bg-white/10"
            aria-label="Chiudi (Esc)"
            title="Chiudi"
          >
            <XIcon className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Media area */}
      <div
        className="relative flex flex-1 items-center justify-center overflow-hidden"
        onClick={handleBackdropClick}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {index > 0 && (
          <button
            type="button"
            onClick={prev}
            className="absolute left-3 z-10 hidden h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-md ring-1 ring-white/20 transition hover:bg-white/20 hover:scale-105 md:flex"
            aria-label="Precedente"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
        )}

        <div
          key={current.id}
          className="flex h-full w-full items-center justify-center"
          style={{ animation: 'fadeIn .2s ease-out' }}
        >
          {isImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={current.src}
              alt={current.filename}
              className="max-h-full max-w-full select-none object-contain"
              draggable={false}
              onClick={(e) => e.stopPropagation()}
            />
          ) : isVideo ? (
            <div
              className="h-full w-full"
              onClick={(e) => e.stopPropagation()}
            >
              <VideoPlayer src={current.src} />
            </div>
          ) : isPdf ? (
            <div
              className="h-full w-full"
              onClick={(e) => e.stopPropagation()}
            >
              <PdfViewer src={current.src} />
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3 text-white">
              <p className="text-sm text-white/70">
                Tipo file non visualizzabile in-app
              </p>
              <a
                href={current.downloadUrl ?? current.src}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-full border border-white/20 bg-white/10 px-4 py-2 text-xs uppercase tracking-wider hover:bg-white/20"
              >
                Apri esternamente
              </a>
            </div>
          )}
        </div>

        {index < total - 1 && (
          <button
            type="button"
            onClick={next}
            className="absolute right-3 z-10 hidden h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-md ring-1 ring-white/20 transition hover:bg-white/20 hover:scale-105 md:flex"
            aria-label="Successivo"
          >
            <ChevronRight className="h-6 w-6" />
          </button>
        )}
      </div>

      {/* Footer mobile: filename */}
      <div className="border-t border-white/5 bg-black/30 px-4 py-2 text-center backdrop-blur-md sm:hidden">
        <p className="truncate font-mono text-[11px] text-white/70">{current.filename}</p>
      </div>
    </div>
  );
}
