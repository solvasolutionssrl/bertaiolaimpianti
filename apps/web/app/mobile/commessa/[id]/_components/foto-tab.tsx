'use client';

import * as React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Camera, Loader2, Upload, ImageIcon, Video } from 'lucide-react';
import { Button, cn } from '@kommessa/ui';

import { Divider, Stagger } from '../../../_components/blueprint';
import { MediaLightbox, type MediaItem } from '../../../../_components/media-lightbox';
import { AddMediaSection } from './add-media-section';

export interface FotoItem {
  id: string;
  filename: string;
  thumbnail_url: string | null;
  momento: 'sopralluogo' | 'in_corso' | 'finale' | null;
  mime: string;
  /** Presente se il file è sul nuovo flusso R2 (può servire via /api/media/[id]). */
  r2_key?: string | null;
}

interface Props {
  commessaId: string;
  sopralluogo: FotoItem[];
  inCorso: FotoItem[];
  finali: FotoItem[];
}

export function FotoTab({ commessaId, sopralluogo, inCorso, finali }: Props) {
  const [showUpload, setShowUpload] = React.useState(false);
  const [lightboxIdx, setLightboxIdx] = React.useState<number | null>(null);

  // Lista unica ordinata: serve al lightbox per navigare con swipe
  // attraverso TUTTI i media della commessa, indipendentemente dal momento.
  const allItems = React.useMemo(
    () => [...sopralluogo, ...inCorso, ...finali],
    [sopralluogo, inCorso, finali],
  );

  const lightboxItems = React.useMemo<MediaItem[]>(
    () => allItems.map((f) => ({
      id: f.id,
      mime: f.mime,
      filename: f.filename,
      // Se la riga ha r2_key usiamo il resolver R2 (funziona per img e video).
      // Altrimenti per le immagini legacy resta il vecchio proxy Nextcloud.
      // Per i video legacy senza r2_key non c'è ancora un proxy con range:
      // il lightbox mostrerà "tipo non visualizzabile" + link esterno.
      src: f.r2_key
        ? `/api/media/${f.id}`
        : f.mime.startsWith('image/')
          ? `/api/photo/${f.id}`
          : '',
      // Foto/video di file_refs: passiamo direttamente l'id (è già un fileRefId).
      annotation: { fileRefId: f.id },
    })),
    [allItems],
  );

  const openAt = (item: FotoItem) => {
    const idx = allItems.findIndex((x) => x.id === item.id);
    if (idx >= 0) setLightboxIdx(idx);
  };

  const totalCount = allItems.length;

  return (
    <div className="space-y-4">
      {/* Azioni principali affiancate */}
      <div className="grid grid-cols-2 gap-2">
        <Link href={`/mobile/commessa/${commessaId}/scatto`} className="block">
          <Button
            variant="outline"
            size="lg"
            className="min-h-[48px] w-full font-mono text-xs uppercase tracking-[0.14em]"
          >
            <Camera className="mr-1.5 h-4 w-4" aria-hidden="true" />
            Scatta dal vivo
          </Button>
        </Link>
        <Button
          variant={showUpload ? 'default' : 'outline'}
          size="lg"
          className="min-h-[48px] w-full font-mono text-xs uppercase tracking-[0.14em]"
          onClick={() => setShowUpload((v) => !v)}
        >
          <Upload className="mr-1.5 h-4 w-4" aria-hidden="true" />
          {showUpload ? 'Chiudi' : 'Dalla galleria'}
        </Button>
      </div>

      {/* Upload section inline */}
      {showUpload && (
        <div className="rounded-xl border border-border bg-card/50 p-3">
          <AddMediaSection commessaId={commessaId} />
        </div>
      )}

      {/* Galleria per momenti */}
      {totalCount === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-muted/20 p-6 text-center">
          <span className="mx-auto mb-2 flex h-9 w-9 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <ImageIcon className="h-5 w-5" aria-hidden="true" />
          </span>
          <p className="text-sm font-medium text-foreground">Nessuna foto o video</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Scatta dal vivo o carica dalla galleria
          </p>
        </div>
      ) : (
        <Stagger className="space-y-6">
          {sopralluogo.length > 0 && (
            <FotoMomentoBlock
              label="Sopralluogo"
              count={sopralluogo.length}
              items={sopralluogo}
              onOpen={openAt}
            />
          )}
          {inCorso.length > 0 && (
            <FotoMomentoBlock
              label="In corso"
              count={inCorso.length}
              items={inCorso}
              onOpen={openAt}
            />
          )}
          {finali.length > 0 && (
            <FotoMomentoBlock
              label="Finali"
              count={finali.length}
              items={finali}
              onOpen={openAt}
            />
          )}
        </Stagger>
      )}

      <MediaLightbox
        items={lightboxItems}
        initialIndex={lightboxIdx}
        open={lightboxIdx !== null}
        onOpenChange={(o) => {
          if (!o) setLightboxIdx(null);
        }}
      />
    </div>
  );
}

function FotoMomentoBlock({
  label,
  count,
  items,
  onOpen,
}: {
  label: string;
  count: number;
  items: FotoItem[];
  onOpen: (item: FotoItem) => void;
}) {
  return (
    <div className="space-y-2">
      <Divider label={`${label} · ${String(count).padStart(2, '0')}`} />
      <div className="grid grid-cols-3 gap-1.5">
        {items.map((f) => (
          <FotoCell key={f.id} item={f} onOpen={onOpen} />
        ))}
      </div>
    </div>
  );
}

function FotoCell({
  item,
  onOpen,
}: {
  item: FotoItem;
  onOpen: (item: FotoItem) => void;
}) {
  const isVideo = item.mime.startsWith('video/');
  const [imgLoaded, setImgLoaded] = React.useState(false);
  /**
   * Anteprima che non arriva (11/08/2026).
   *
   * Prima c'era solo `imgLoaded`: se la richiesta falliva — miniatura non
   * ancora generata, proxy Nextcloud che risponde 502, file cancellato a
   * mano — non scattava nessun evento e **la rotella girava per sempre**.
   * Ora l'errore si vede (`onError`) e c'e' comunque una rete di sicurezza a
   * tempo, perche' su un video pesante il browser puo' restare appeso senza
   * emettere ne' `loadeddata` ne' `error`.
   */
  const [nonDisponibile, setNonDisponibile] = React.useState(false);

  React.useEffect(() => {
    if (imgLoaded || nonDisponibile) return;
    const t = window.setTimeout(() => setNonDisponibile(true), 12_000);
    return () => window.clearTimeout(t);
  }, [imgLoaded, nonDisponibile]);

  // Thumbnail strategy:
  //  - Per le immagini usiamo SEMPRE /api/photo/<id>?size=thumb: l'endpoint
  //    redirige al thumb 400x400 webp persistente su R2 (~30 KB cad) quando
  //    disponibile, altrimenti fa fallback al full-size via proxy Nextcloud.
  //  - Per i video manteniamo /api/media/<id> (Range-requests, preload=
  //    metadata in <video>): niente thumb statico ancora.
  const thumbSrc = item.thumbnail_url
    ?? (isVideo
      ? (item.r2_key ? `/api/media/${item.id}` : null)
      : `/api/photo/${item.id}?size=thumb`);

  return (
    <button
      type="button"
      onClick={() => onOpen(item)}
      className="group relative aspect-square overflow-hidden rounded-md border border-border bg-muted transition-transform active:scale-[0.96]"
      title={item.filename}
      aria-label={`Apri ${item.filename}`}
    >
      {/* Rotella solo mentre c'è speranza; poi l'icona del tipo di file. */}
      {!imgLoaded && !nonDisponibile && (
        <span className="absolute inset-0 flex items-center justify-center" aria-hidden="true">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground/60" />
        </span>
      )}

      {thumbSrc && !nonDisponibile ? (
        isVideo ? (
          <video
            src={thumbSrc}
            preload="metadata"
            muted
            playsInline
            className="h-full w-full object-cover"
            onLoadedData={() => setImgLoaded(true)}
            onError={() => setNonDisponibile(true)}
          />
        ) : (
          <Image
            src={thumbSrc}
            alt={item.filename}
            width={160}
            height={160}
            className={cn(
              'h-full w-full object-cover transition-opacity duration-200',
              imgLoaded ? 'opacity-100' : 'opacity-0',
            )}
            unoptimized={thumbSrc.startsWith('/api/')}
            onLoad={() => setImgLoaded(true)}
            onError={() => setNonDisponibile(true)}
          />
        )
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-muted-foreground">
          {isVideo ? (
            <Video className="h-5 w-5" aria-hidden="true" />
          ) : (
            <ImageIcon className="h-5 w-5" aria-hidden="true" />
          )}
          {nonDisponibile ? (
            <span className="px-1 text-center text-[9px] leading-tight">
              anteprima non pronta
            </span>
          ) : null}
        </div>
      )}
      {isVideo && (
        <span className="absolute bottom-1 left-1 rounded-full bg-black/70 px-1.5 py-px font-mono text-[10px] font-bold text-white">
          ▶
        </span>
      )}
    </button>
  );
}
