'use client';

import * as React from 'react';
import dynamic from 'next/dynamic';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import {
  ChevronLeft,
  ChevronRight,
  X as XIcon,
  Download,
  Loader2,
  PenLine,
} from 'lucide-react';

import { VideoPlayer } from './video-player';
import { AnnotationOverlay, type AnnotationTarget } from './annotation-overlay';

const PdfViewer = dynamic(() => import('./pdf-viewer').then((m) => m.PdfViewer), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center text-slate-400">
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
  /**
   * Se presente, abilita il bottone "Annota" per immagini/PDF.
   * Foto-tab: passa direttamente `{ fileRefId }`.
   * Cartella-entries: passa `{ resolve: { commessaId, path, ... } }` per
   * risolvere/creare la riga file_refs on demand.
   */
  annotation?: AnnotationTarget;
}

interface Props {
  items: MediaItem[];
  initialIndex: number | null;
  /** `true` quando initialIndex è valido. Mantenuto separato per animazioni Radix. */
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const SWIPE_THRESHOLD = 60;

/**
 * Visualizzatore full-screen per immagini, video e PDF.
 *
 * Implementato come Radix Dialog: backdrop dim, focus trap, Escape integrati.
 *
 * Temi:
 *  - foto/video → backdrop nero, header/footer translucid scuri
 *  - PDF       → backdrop grigio scuro ma container chiaro per leggibilità
 *
 * Tastiera: Esc (Radix), ←/→ (custom).
 * Touch: swipe orizzontale per immagini (su video/PDF interferirebbe).
 * Tap fuori = chiusura (Radix overlay click).
 *
 * API: open/onOpenChange + initialIndex. Quando un nuovo initialIndex
 * arriva mentre il dialog è aperto, il cursore si aggiorna.
 */
export function MediaLightbox({ items, initialIndex, open, onOpenChange }: Props) {
  const [index, setIndex] = React.useState(
    initialIndex == null ? 0 : Math.max(0, Math.min(initialIndex, items.length - 1)),
  );
  const touchStartXRef = React.useRef<number | null>(null);
  const [annotating, setAnnotating] = React.useState(false);

  // Re-sync index quando arriva un nuovo initialIndex (apri di una foto diversa)
  React.useEffect(() => {
    if (initialIndex == null) return;
    setIndex(Math.max(0, Math.min(initialIndex, items.length - 1)));
  }, [initialIndex, items.length]);

  const current = items[index];
  const total = items.length;

  const next = React.useCallback(() => {
    setIndex((i) => Math.min(i + 1, items.length - 1));
  }, [items.length]);

  const prev = React.useCallback(() => {
    setIndex((i) => Math.max(i - 1, 0));
  }, []);

  // Tasti ←/→
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') prev();
      else if (e.key === 'ArrowRight') next();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, next, prev]);

  if (!current) {
    return (
      <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
        <DialogPrimitive.Portal />
      </DialogPrimitive.Root>
    );
  }

  const isImage = current.mime.startsWith('image/');
  const isVideo = current.mime.startsWith('video/');
  const isPdf =
    current.mime === 'application/pdf' || /\.pdf$/i.test(current.filename);
  const canAnnotate =
    !!current.annotation && (isImage || isPdf);

  // Tema chiaro come default per tutti i media (foto/video/PDF).
  // I video usano un container nero interno (VideoPlayer) per il letterboxing.
  const lightTheme = true;
  // Swipe abilitato solo per immagini (video/PDF catturano i touch interni).
  // Per gli altri si naviga con frecce / thumbnail strip.
  const swipeEnabled = isImage && items.length > 1;

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

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className={
            'fixed inset-0 z-50 backdrop-blur-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 ' +
            (lightTheme ? 'bg-slate-900/60' : 'bg-black/85')
          }
        />
        <DialogPrimitive.Content
          aria-label={`Anteprima ${current.filename}`}
          onOpenAutoFocus={(e) => e.preventDefault()}
          className={
            'fixed inset-0 z-50 flex flex-col outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 ' +
            'sm:inset-4 sm:rounded-2xl sm:shadow-2xl sm:ring-1 ' +
            (lightTheme
              ? 'bg-neutral-50 sm:ring-black/10'
              : 'bg-neutral-950 sm:ring-white/10')
          }
        >
          <DialogPrimitive.Title className="sr-only">
            {current.filename}
          </DialogPrimitive.Title>

          {/* Header */}
          <div
            className={
              'flex items-center justify-between border-b px-4 py-3 ' +
              (lightTheme
                ? 'border-neutral-200 bg-white/80 text-neutral-700 backdrop-blur'
                : 'border-white/5 bg-black/30 text-white backdrop-blur-md')
            }
          >
            <div className="flex min-w-0 items-center gap-3">
              <span
                className={
                  'font-mono text-[11px] tabular-nums ' +
                  (lightTheme ? 'text-neutral-500' : 'text-white/60')
                }
              >
                {String(index + 1).padStart(2, '0')}
                <span className={lightTheme ? 'mx-1 text-neutral-300' : 'mx-1 text-white/30'}>
                  /
                </span>
                {String(total).padStart(2, '0')}
              </span>
              <p
                className={
                  'hidden truncate font-mono text-xs sm:block ' +
                  (lightTheme ? 'text-neutral-700' : 'text-white/80')
                }
                title={current.filename}
              >
                {current.filename}
              </p>
            </div>
            <div className="flex items-center gap-1">
              {canAnnotate && (
                <button
                  type="button"
                  onClick={() => setAnnotating(true)}
                  className={
                    'flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition ' +
                    (lightTheme
                      ? 'border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-100'
                      : 'border border-white/20 bg-white/10 text-white hover:bg-white/20')
                  }
                  aria-label="Annota"
                  title="Annota"
                >
                  <PenLine className="h-3.5 w-3.5" />
                  Annota
                </button>
              )}
              <a
                href={current.downloadUrl ?? current.src}
                download={current.filename}
                target="_blank"
                rel="noopener noreferrer"
                className={
                  'rounded-full p-2 transition ' +
                  (lightTheme
                    ? 'hover:bg-neutral-200/60'
                    : 'hover:bg-white/10')
                }
                aria-label="Scarica"
                title="Scarica"
              >
                <Download className="h-4 w-4" />
              </a>
              <DialogPrimitive.Close
                className={
                  'rounded-full p-2 transition ' +
                  (lightTheme
                    ? 'hover:bg-neutral-200/60'
                    : 'hover:bg-white/10')
                }
                aria-label="Chiudi (Esc)"
                title="Chiudi"
              >
                <XIcon className="h-5 w-5" />
              </DialogPrimitive.Close>
            </div>
          </div>

          {/* Body */}
          <div
            className="relative flex flex-1 items-center justify-center overflow-hidden"
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
          >
            {index > 0 && total > 1 && (
              <button
                type="button"
                onClick={prev}
                className={
                  'absolute left-2 top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full backdrop-blur transition hover:scale-105 ' +
                  (lightTheme
                    ? 'bg-white/80 text-neutral-700 ring-1 ring-black/10 hover:bg-white'
                    : 'bg-white/10 text-white ring-1 ring-white/20 hover:bg-white/20')
                }
                aria-label="Precedente"
              >
                <ChevronLeft className="h-6 w-6" />
              </button>
            )}

            <div
              key={current.id}
              className="flex h-full w-full items-center justify-center"
            >
              {isImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={current.src}
                  alt={current.filename}
                  className="max-h-full max-w-full select-none object-contain"
                  draggable={false}
                />
              ) : isVideo ? (
                <div className="h-full w-full">
                  <VideoPlayer src={current.src} />
                </div>
              ) : isPdf ? (
                <div className="h-full w-full">
                  <PdfViewer src={current.src} />
                </div>
              ) : (
                <div
                  className={
                    'flex flex-col items-center gap-3 ' +
                    (lightTheme ? 'text-neutral-700' : 'text-white')
                  }
                >
                  <p className="text-sm">Tipo file non visualizzabile in-app</p>
                  <a
                    href={current.downloadUrl ?? current.src}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={
                      'rounded-full px-4 py-2 text-xs uppercase tracking-wider ' +
                      (lightTheme
                        ? 'border border-neutral-300 bg-white hover:bg-neutral-100'
                        : 'border border-white/20 bg-white/10 hover:bg-white/20')
                    }
                  >
                    Apri esternamente
                  </a>
                </div>
              )}
            </div>

            {index < total - 1 && total > 1 && (
              <button
                type="button"
                onClick={next}
                className={
                  'absolute right-2 top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full backdrop-blur transition hover:scale-105 ' +
                  (lightTheme
                    ? 'bg-white/80 text-neutral-700 ring-1 ring-black/10 hover:bg-white'
                    : 'bg-white/10 text-white ring-1 ring-white/20 hover:bg-white/20')
                }
                aria-label="Successivo"
              >
                <ChevronRight className="h-6 w-6" />
              </button>
            )}
          </div>

          {/* Thumbnail strip (visibile quando ci sono ≥ 2 item) */}
          {total > 1 && (
            <div
              className={
                'border-t px-2 py-2 ' +
                (lightTheme
                  ? 'border-neutral-200 bg-white/90'
                  : 'border-white/5 bg-black/40 backdrop-blur-md')
              }
            >
              <div className="flex gap-1.5 overflow-x-auto scrollbar-none">
                {items.map((it, i) => {
                  const isActive = i === index;
                  const itIsVideo = it.mime.startsWith('video/');
                  const itIsImage = it.mime.startsWith('image/');
                  const itIsPdf =
                    it.mime === 'application/pdf' || /\.pdf$/i.test(it.filename);
                  return (
                    <button
                      key={it.id}
                      type="button"
                      onClick={() => setIndex(i)}
                      ref={(el) => {
                        if (isActive && el) {
                          el.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
                        }
                      }}
                      className={
                        'group relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-md transition ' +
                        (isActive
                          ? lightTheme
                            ? 'ring-2 ring-primary'
                            : 'ring-2 ring-white'
                          : lightTheme
                            ? 'opacity-60 hover:opacity-100 ring-1 ring-neutral-200'
                            : 'opacity-50 hover:opacity-100 ring-1 ring-white/20')
                      }
                      aria-label={`Apri ${it.filename}`}
                      title={it.filename}
                    >
                      {itIsImage ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={it.src}
                          alt=""
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />
                      ) : itIsVideo ? (
                        <>
                          <video
                            src={it.src}
                            preload="metadata"
                            muted
                            playsInline
                            className="h-full w-full object-cover"
                          />
                          <span className="absolute inset-0 flex items-center justify-center">
                            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-black/60 backdrop-blur-sm">
                              <ChevronRight className="h-3 w-3 text-white" />
                            </span>
                          </span>
                        </>
                      ) : itIsPdf ? (
                        <span
                          className={
                            'flex h-full w-full flex-col items-center justify-center font-mono text-[8px] font-black uppercase ' +
                            (lightTheme
                              ? 'bg-gradient-to-br from-accent/15 to-accent/5 text-accent-soft-foreground'
                              : 'bg-white/10 text-white')
                          }
                        >
                          <span>PDF</span>
                        </span>
                      ) : (
                        <span
                          className={
                            'flex h-full w-full items-center justify-center font-mono text-[8px] font-bold uppercase ' +
                            (lightTheme ? 'bg-neutral-100 text-neutral-500' : 'bg-white/10 text-white/70')
                          }
                        >
                          ?
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Footer mobile: filename (solo se nessuna strip) */}
          {total <= 1 && (
            <div
              className={
                'border-t px-4 py-2 text-center sm:hidden ' +
                (lightTheme
                  ? 'border-neutral-200 bg-white/80 text-neutral-600'
                  : 'border-white/5 bg-black/30 text-white/70 backdrop-blur-md')
              }
            >
              <p className="truncate font-mono text-[11px]">{current.filename}</p>
            </div>
          )}

          {/* Annotation overlay (sopra al lightbox) */}
          {annotating && canAnnotate && current.annotation && (
            <AnnotationOverlay
              src={current.src}
              mime={current.mime}
              filename={current.filename}
              target={current.annotation}
              onClose={() => setAnnotating(false)}
            />
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
