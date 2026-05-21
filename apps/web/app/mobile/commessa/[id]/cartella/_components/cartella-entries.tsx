'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  Folder,
  FileText,
  Image as ImageIcon,
  Video,
  ChevronRight,
} from 'lucide-react';

import type { StorageObject } from '@impiantixplus/integrations/storage';

import { MediaLightbox, type MediaItem } from '../../../../../_components/media-lightbox';

interface Props {
  entries: StorageObject[];
  commessaId: string;
  subPath: string;
  rootName: string;
}

/**
 * Render della lista entries del file browser cartella.
 *
 * Click:
 *  - cartella     → naviga nel sotto-path
 *  - immagine/video/PDF → apre MediaLightbox (con swipe tra i media nella cartella)
 *  - altri file   → apre proxy in nuova tab
 *
 * Thumbnail:
 *  - image  → <img> dal proxy
 *  - video  → <video preload="metadata"> mostra primo frame
 *  - PDF    → mini card stilizzata
 *  - altri  → icona tipologica
 */
export function CartellaEntries({ entries, commessaId, subPath, rootName }: Props) {
  // Media + PDF navigabili dal lightbox
  const lightboxables = React.useMemo(
    () => entries.filter((e) => !e.isDirectory && isLightboxable(e.mimeType, e.name)),
    [entries],
  );

  const lightboxItems = React.useMemo<MediaItem[]>(
    () => lightboxables.map((e) => {
      const cloudPath = [rootName, subPath, e.name].filter(Boolean).join('/');
      const src = `/api/cloud/file?path=${encodeURIComponent(cloudPath)}`;
      return {
        id: cloudPath,
        src,
        mime: e.mimeType || guessMimeFromName(e.name),
        filename: e.name,
        downloadUrl: src,
      };
    }),
    [lightboxables, rootName, subPath],
  );

  const [lightboxIdx, setLightboxIdx] = React.useState<number | null>(null);

  const openMedia = (entryName: string) => {
    const idx = lightboxables.findIndex((e) => e.name === entryName);
    if (idx >= 0) setLightboxIdx(idx);
  };

  return (
    <>
      <div className="flex flex-col gap-1.5">
        {entries.map((entry) => (
          <EntryRow
            key={entry.path}
            entry={entry}
            commessaId={commessaId}
            subPath={subPath}
            rootName={rootName}
            onOpenMedia={openMedia}
          />
        ))}
      </div>

      {lightboxIdx !== null && (
        <MediaLightbox
          items={lightboxItems}
          initialIndex={lightboxIdx}
          onClose={() => setLightboxIdx(null)}
        />
      )}
    </>
  );
}

function EntryRow({
  entry,
  commessaId,
  subPath,
  rootName,
  onOpenMedia,
}: {
  entry: StorageObject;
  commessaId: string;
  subPath: string;
  rootName: string;
  onOpenMedia: (entryName: string) => void;
}) {
  if (entry.isDirectory) {
    const nextPath = subPath ? `${subPath}/${entry.name}` : entry.name;
    return (
      <Link
        href={`/mobile/commessa/${commessaId}/cartella?path=${encodeURIComponent(nextPath)}`}
        className="group flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5 shadow-soft transition-all active:scale-[0.995] active:bg-muted"
      >
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md border border-primary/30 bg-primary/8 text-primary">
          <Folder className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">{entry.name}</p>
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            Cartella
          </p>
        </div>
        <ChevronRight
          className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-active:translate-x-0.5"
          aria-hidden="true"
        />
      </Link>
    );
  }

  const ext = entry.name.split('.').pop()?.toUpperCase() ?? '?';
  const mime = entry.mimeType || guessMimeFromName(entry.name);
  const isImage = mime.startsWith('image/');
  const isVideo = mime.startsWith('video/');
  const isPdf = mime === 'application/pdf' || ext === 'PDF';
  const isMedia = isImage || isVideo;
  const sizeLabel = formatBytes(entry.size);

  const cloudPath = [rootName, subPath, entry.name].filter(Boolean).join('/');
  const proxyUrl = `/api/cloud/file?path=${encodeURIComponent(cloudPath)}`;

  const thumb = (
    <span
      className={
        'relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-md ' +
        (isImage
          ? 'bg-muted'
          : isVideo
            ? 'bg-black'
            : isPdf
              ? 'border border-accent/40 bg-gradient-to-br from-accent/15 to-accent/5'
              : 'border border-border bg-muted')
      }
    >
      {isImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={proxyUrl}
          alt=""
          className="h-full w-full object-cover"
          loading="lazy"
        />
      ) : isVideo ? (
        <>
          <video
            src={proxyUrl}
            preload="metadata"
            muted
            playsInline
            className="h-full w-full object-cover"
          />
          <span className="absolute inset-0 flex items-center justify-center">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-black/60 backdrop-blur-sm">
              <Video className="h-3 w-3 text-white" aria-hidden="true" />
            </span>
          </span>
        </>
      ) : isPdf ? (
        <span className="flex flex-col items-center justify-center font-mono text-[8px] font-black uppercase leading-none text-accent-soft-foreground">
          <FileText className="mb-0.5 h-3.5 w-3.5" aria-hidden="true" />
          <span>PDF</span>
        </span>
      ) : (
        <span className="flex flex-col items-center justify-center font-mono text-[8px] font-bold uppercase leading-none text-muted-foreground">
          <FileText className="mb-0.5 h-3.5 w-3.5" aria-hidden="true" />
          <span>{ext.slice(0, 4)}</span>
        </span>
      )}
    </span>
  );

  const content = (
    <>
      {thumb}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{entry.name}</p>
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          {sizeLabel}
        </p>
      </div>
      <ChevronRight
        className="h-4 w-4 shrink-0 text-muted-foreground"
        aria-hidden="true"
      />
    </>
  );

  // Media + PDF → lightbox in-app
  if (isMedia || isPdf) {
    return (
      <button
        type="button"
        onClick={() => onOpenMedia(entry.name)}
        className="group flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5 text-left shadow-soft transition-all active:scale-[0.995] active:bg-muted"
      >
        {content}
      </button>
    );
  }

  // Altri tipi → apri esternamente
  return (
    <a
      href={proxyUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5 shadow-soft transition-all active:scale-[0.995] active:bg-muted"
    >
      {content}
    </a>
  );
}

function isLightboxable(mime: string, name: string): boolean {
  if (mime?.startsWith('image/') || mime?.startsWith('video/')) return true;
  if (mime === 'application/pdf') return true;
  if (/\.pdf$/i.test(name)) return true;
  return false;
}

function guessMimeFromName(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (['jpg', 'jpeg'].includes(ext)) return 'image/jpeg';
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'heic' || ext === 'heif') return 'image/heic';
  if (ext === 'gif') return 'image/gif';
  if (ext === 'mp4') return 'video/mp4';
  if (ext === 'mov') return 'video/quicktime';
  if (ext === 'webm') return 'video/webm';
  if (ext === 'pdf') return 'application/pdf';
  return 'application/octet-stream';
}

function formatBytes(n: number): string {
  if (!n || n <= 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
}
