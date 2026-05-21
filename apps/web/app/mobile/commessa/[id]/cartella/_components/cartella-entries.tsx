'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  Folder,
  FileText,
  ImageIcon,
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
 * Comportamento click:
 *  - cartella  → naviga al sotto-path
 *  - immagine/video → apre MediaLightbox in-app (con swipe tra media)
 *  - altri file (PDF, doc, ecc.) → apre proxy in nuova tab (come prima)
 */
export function CartellaEntries({ entries, commessaId, subPath, rootName }: Props) {
  // Media navigabili (img+video) → indice per il lightbox
  const mediaEntries = React.useMemo(
    () => entries.filter((e) => !e.isDirectory && isMediaMime(e.mimeType)),
    [entries],
  );

  const mediaItems = React.useMemo<MediaItem[]>(
    () => mediaEntries.map((e) => {
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
    [mediaEntries, rootName, subPath],
  );

  const [lightboxIdx, setLightboxIdx] = React.useState<number | null>(null);

  const openMedia = (entryName: string) => {
    const idx = mediaEntries.findIndex((e) => e.name === entryName);
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
          items={mediaItems}
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
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-primary/30 bg-primary/8 text-primary">
          <Folder className="h-4 w-4" aria-hidden="true" />
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
  const isPdf = ext === 'PDF';
  const sizeLabel = formatBytes(entry.size);

  const cloudPath = [rootName, subPath, entry.name].filter(Boolean).join('/');
  const proxyUrl = `/api/cloud/file?path=${encodeURIComponent(cloudPath)}`;

  const iconClass =
    'flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-md font-mono text-[9px] font-bold leading-none ' +
    (isPdf
      ? 'border border-accent/40 bg-accent/10 text-accent-soft-foreground'
      : isImage
        ? 'border border-success/30 bg-success/10 text-success'
        : isVideo
          ? 'border border-primary/30 bg-primary/10 text-primary'
          : 'border border-border bg-muted text-muted-foreground');

  const content = (
    <>
      <span className={iconClass}>
        {isImage ? (
          <ImageIcon className="h-3.5 w-3.5 mb-0.5" aria-hidden="true" />
        ) : isVideo ? (
          <Video className="h-3.5 w-3.5 mb-0.5" aria-hidden="true" />
        ) : (
          <FileText className="h-3.5 w-3.5 mb-0.5" aria-hidden="true" />
        )}
        <span className="tracking-tight">{ext.slice(0, 4)}</span>
      </span>
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

  // Media → lightbox in-app
  if (isImage || isVideo) {
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

  // Altri tipi (PDF, doc) → apri esternamente come prima
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

function isMediaMime(mime: string): boolean {
  if (!mime) return false;
  return mime.startsWith('image/') || mime.startsWith('video/');
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
