'use client';

import * as React from 'react';
import { ImageOff, Play, X } from 'lucide-react';

/**
 * La galleria della pagina pubblica.
 *
 * Volutamente **non** riusa `MediaLightbox` dell'app: quello sa di commesse, di
 * annotazioni, di permessi e di cestino, e tutta quella conoscenza qui sarebbe
 * superficie in più per niente. Qui servono una griglia e un ingrandimento.
 *
 * Ogni immagine passa da `/api/pubblico/<token>/media/<id>`: l'unico indirizzo
 * che un visitatore senza account può usare, e che verifica a ogni richiesta
 * che quel file sia davvero di quella commessa.
 */

interface MediaPubblico {
  id: string;
  filename: string;
  mime: string;
}

export function GalleriaPubblica({
  token,
  media,
}: {
  token: string;
  media: MediaPubblico[];
}) {
  const [aperto, setAperto] = React.useState<MediaPubblico | null>(null);

  // Esc chiude: su un portatile è il gesto che tutti provano per primo.
  React.useEffect(() => {
    if (!aperto) return;
    const suTasto = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAperto(null);
    };
    window.addEventListener('keydown', suTasto);
    return () => window.removeEventListener('keydown', suTasto);
  }, [aperto]);

  return (
    <>
      <p className="text-xs text-muted-foreground">
        {media.length} {media.length === 1 ? 'elemento' : 'elementi'}
      </p>

      <ul className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
        {media.map((m) => (
          <li key={m.id}>
            <button
              type="button"
              onClick={() => setAperto(m)}
              className="relative block aspect-square w-full overflow-hidden rounded-md border border-border bg-muted transition active:scale-[0.97]"
              aria-label={`Apri ${m.filename}`}
            >
              <Anteprima token={token} media={m} />
            </button>
          </li>
        ))}
      </ul>

      {aperto ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={aperto.filename}
          onClick={() => setAperto(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
        >
          <button
            type="button"
            onClick={() => setAperto(null)}
            aria-label="Chiudi"
            className="absolute right-3 top-3 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white"
          >
            <X aria-hidden="true" className="h-5 w-5" />
          </button>
          {aperto.mime.startsWith('video/') ? (
            <video
              src={`/api/pubblico/${token}/media/${aperto.id}`}
              controls
              playsInline
              className="max-h-full max-w-full"
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/api/pubblico/${token}/media/${aperto.id}`}
              alt={aperto.filename}
              className="max-h-full max-w-full object-contain"
              onClick={(e) => e.stopPropagation()}
            />
          )}
        </div>
      ) : null}
    </>
  );
}

/**
 * Anteprima con le tre strade chiuse: arriva, non c'è, oppure non arriva né un
 * sì né un no (e allora dopo un po' si smette di aspettare).
 */
function Anteprima({ token, media }: { token: string; media: MediaPubblico }) {
  const [stato, setStato] = React.useState<'attesa' | 'ok' | 'assente'>('attesa');
  const video = media.mime.startsWith('video/');

  React.useEffect(() => {
    if (stato !== 'attesa') return;
    const t = setTimeout(() => setStato('assente'), 12_000);
    return () => clearTimeout(t);
  }, [stato]);

  if (stato === 'assente') {
    return (
      <span className="flex h-full w-full flex-col items-center justify-center gap-1 text-muted-foreground">
        {video ? (
          <Play aria-hidden="true" className="h-5 w-5" />
        ) : (
          <ImageOff aria-hidden="true" className="h-5 w-5" />
        )}
        <span className="text-[10px]">{video ? 'Video' : 'Non disponibile'}</span>
      </span>
    );
  }

  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`/api/pubblico/${token}/media/${media.id}?size=thumb`}
        alt={media.filename}
        loading="lazy"
        decoding="async"
        onLoad={() => setStato('ok')}
        onError={() => setStato('assente')}
        className={`h-full w-full object-cover transition-opacity ${
          stato === 'ok' ? 'opacity-100' : 'opacity-0'
        }`}
      />
      {stato === 'attesa' ? (
        <span aria-hidden="true" className="absolute inset-0 animate-pulse bg-muted-foreground/10" />
      ) : null}
      {video && stato === 'ok' ? (
        <span aria-hidden="true" className="absolute inset-0 flex items-center justify-center">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-black/55 text-white">
            <Play className="h-4 w-4 fill-current" />
          </span>
        </span>
      ) : null}
    </>
  );
}
