'use client';

/**
 * Galleria media della commessa (ufficio).
 *
 * Mostra una griglia di thumbnail (foto + video). Il click apre il
 * `MediaLightbox` condiviso (lo stesso della PWA): si scorrono foto/video,
 * e dal popup si preme "Annota" per aprire l'editor sulle immagini.
 *
 * Niente più apertura diretta dell'editor al click: l'annotazione è un'azione
 * esplicita dentro il lightbox (gestita da AnnotationOverlay: lock, load, save).
 */

import * as React from 'react';
import { Image as ImgIcon, Video as VideoIcon, MessageSquareDashed } from 'lucide-react';

import { MediaLightbox, type MediaItem } from '../../../../_components/media-lightbox';
import { fmtDataOra } from '../../../_lib/format';

export interface FotoItem {
  id: string;
  filename: string;
  mime: string;
  thumbnail_url: string | null;
  /** Presente per file del nuovo flusso R2: fallback thumbnail via /api/media/[id] */
  r2_key: string | null;
  taken_at: string | null;
  uploaded_at: string | null;
  momento: string | null;
  // Annotazione max-version (se esiste) — usata per il badge "Annotata"
  annotation: {
    id: string;
    layer_json: unknown;
    width_px: number;
    height_px: number;
  } | null;
}

export interface FotoGridProps {
  foto: FotoItem[];
}

export function FotoGrid({ foto }: FotoGridProps) {
  const [lightboxIdx, setLightboxIdx] = React.useState<number | null>(null);

  const lightboxItems = React.useMemo<MediaItem[]>(
    () =>
      foto.map((f) => ({
        id: f.id,
        mime: f.mime,
        filename: f.filename,
        // Con r2_key usiamo il resolver R2 (img + video). Per le immagini
        // legacy resta il proxy Nextcloud /api/photo. Video legacy: nessun
        // proxy con range → il lightbox mostra "non visualizzabile" + link.
        src: f.r2_key
          ? `/api/media/${f.id}`
          : f.mime.startsWith('image/')
            ? `/api/photo/${f.id}`
            : '',
        // Solo le immagini sono annotabili: abilita il bottone "Annota".
        annotation: f.mime.startsWith('image/') ? { fileRefId: f.id } : undefined,
      })),
    [foto],
  );

  if (foto.length === 0) return null;

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {foto.map((f, idx) => (
          <FotoCell key={f.id} f={f} onOpen={() => setLightboxIdx(idx)} />
        ))}
      </div>

      <MediaLightbox
        items={lightboxItems}
        initialIndex={lightboxIdx}
        open={lightboxIdx !== null}
        onOpenChange={(o) => {
          if (!o) setLightboxIdx(null);
        }}
      />
    </>
  );
}

function FotoCell({ f, onOpen }: { f: FotoItem; onOpen: () => void }) {
  const isVideo = f.mime.startsWith('video/');
  const hasAnnotation = !!f.annotation;

  // Thumbnail: immagini → /api/photo/<id>?size=thumb (webp 400px persistente,
  // fallback full-size). Video → /api/media/<id> (preload metadata in <video>).
  const thumbSrc =
    f.thumbnail_url ??
    (isVideo ? (f.r2_key ? `/api/media/${f.id}` : null) : `/api/photo/${f.id}?size=thumb`);

  return (
    <figure className="group relative overflow-hidden rounded-md border border-border bg-card">
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Apri ${f.filename}`}
        className="block w-full text-left"
      >
        {thumbSrc ? (
          isVideo ? (
            <video
              src={thumbSrc}
              preload="metadata"
              muted
              playsInline
              className="aspect-square w-full bg-black object-cover"
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={thumbSrc}
              alt={f.filename}
              className="aspect-square w-full object-cover transition-transform group-hover:scale-[1.02]"
            />
          )
        ) : (
          <div className="flex aspect-square w-full items-center justify-center bg-muted text-muted-foreground">
            {isVideo ? <VideoIcon className="h-6 w-6" /> : <ImgIcon className="h-6 w-6" />}
          </div>
        )}

        {/* Badge video */}
        {isVideo ? (
          <span className="absolute bottom-1.5 left-1.5 inline-flex items-center gap-1 rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
            <VideoIcon className="h-3 w-3" aria-hidden="true" /> Video
          </span>
        ) : null}

        {/* Badge annotata (solo immagini) */}
        {hasAnnotation && !isVideo ? (
          <span
            className="absolute right-1.5 top-1.5 inline-flex items-center gap-1 rounded-full bg-primary/95 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary-foreground shadow"
            title="Foto annotata"
          >
            <MessageSquareDashed className="h-3 w-3" aria-hidden="true" />
            Annotata
          </span>
        ) : null}
      </button>

      <figcaption className="px-2 py-1.5 text-[11px] text-muted-foreground">
        <p className="truncate font-medium text-foreground">{f.filename}</p>
        <p>{fmtDataOra(f.taken_at ?? f.uploaded_at)}</p>
        {f.momento ? <p>{f.momento}</p> : null}
      </figcaption>
    </figure>
  );
}
