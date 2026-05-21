'use client';

import * as React from 'react';
import { ChevronLeft, ChevronRight, X as XIcon, Download } from 'lucide-react';

export interface MediaItem {
  id: string;
  src: string;
  mime: string;
  filename: string;
  /** Opzionale: URL per il download/apertura in nuova tab (default: src) */
  downloadUrl?: string;
}

interface Props {
  items: MediaItem[];
  initialIndex: number;
  onClose: () => void;
}

const SWIPE_THRESHOLD = 60;

/**
 * Visualizzatore full-screen per immagini + video con swipe/freccia per
 * navigare nella collezione. Usato sia dalla galleria foto della commessa
 * sia dal file browser cartella per file image/video.
 *
 * Tasti supportati:
 *  - Esc          → chiudi
 *  - ArrowLeft    → precedente
 *  - ArrowRight   → successivo
 *
 * Touch:
 *  - swipe orizz. → precedente/successivo (soglia 60px)
 *  - tap fuori    → chiudi (solo sul backdrop, non sul media)
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

  // Lock scroll body + key handlers
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

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartXRef.current = e.touches[0]?.clientX ?? null;
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    const start = touchStartXRef.current;
    if (start == null) return;
    const endX = e.changedTouches[0]?.clientX ?? start;
    const delta = endX - start;
    touchStartXRef.current = null;
    if (delta > SWIPE_THRESHOLD) prev();
    else if (delta < -SWIPE_THRESHOLD) next();
  };

  // Click sul backdrop (non sul media): chiudi
  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black/95 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={`Anteprima ${current.filename}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-3 text-white">
        <span className="font-mono text-xs tabular-nums">
          {String(index + 1).padStart(2, '0')} / {String(total).padStart(2, '0')}
        </span>
        <div className="flex items-center gap-2">
          <a
            href={current.downloadUrl ?? current.src}
            download={current.filename}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-full p-2 hover:bg-white/10"
            aria-label="Scarica"
          >
            <Download className="h-4 w-4" aria-hidden="true" />
          </a>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 hover:bg-white/10"
            aria-label="Chiudi"
          >
            <XIcon className="h-5 w-5" aria-hidden="true" />
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
            className="absolute left-2 z-10 hidden h-12 w-12 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 md:flex"
            aria-label="Precedente"
          >
            <ChevronLeft className="h-6 w-6" aria-hidden="true" />
          </button>
        )}

        {isImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={current.id}
            src={current.src}
            alt={current.filename}
            className="max-h-full max-w-full select-none object-contain"
            draggable={false}
          />
        ) : isVideo ? (
          <video
            key={current.id}
            src={current.src}
            controls
            playsInline
            className="max-h-full max-w-full"
            preload="metadata"
          />
        ) : (
          <div className="flex flex-col items-center gap-2 text-white">
            <p className="text-sm">Tipo file non visualizzabile</p>
            <a
              href={current.downloadUrl ?? current.src}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full border border-white/20 bg-white/10 px-4 py-2 text-xs uppercase tracking-wide hover:bg-white/20"
            >
              Apri esternamente
            </a>
          </div>
        )}

        {index < total - 1 && (
          <button
            type="button"
            onClick={next}
            className="absolute right-2 z-10 hidden h-12 w-12 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 md:flex"
            aria-label="Successivo"
          >
            <ChevronRight className="h-6 w-6" aria-hidden="true" />
          </button>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-3 text-center">
        <p className="truncate text-xs text-white/80">{current.filename}</p>
      </div>
    </div>
  );
}
