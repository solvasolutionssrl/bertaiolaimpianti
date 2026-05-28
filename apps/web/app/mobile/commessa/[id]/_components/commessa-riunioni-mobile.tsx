'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  Camera,
  ChevronDown,
  FileText,
  ImagePlus,
  Paperclip,
  Sparkles,
} from 'lucide-react';
import { Button, cn } from '@kommessa/ui';

import { MediaLightbox, type MediaItem } from '../../../../_components/media-lightbox';
import { useUploadQueue } from '../../../../_components/upload-queue-provider';
import { VIDEO_MAX_SIZE_BYTES } from '../../../../_lib/upload-queue/types';
import { useAlert } from '../../../../_components/confirm-provider';

export interface RiunioneAllegatoMobile {
  id: string;
  /** file_refs.id, usato per costruire /api/photo/<id> o /api/cloud/file?path=... */
  file_ref_id: string;
  filename: string;
  mime: string;
  /** Path relativo (cloud_folder_path completo) — usato per il viewer cartella. */
  path: string | null;
  kind: 'foto' | 'video' | 'pdf_acquisito';
}

export interface RiunioneMobileRow {
  id: string;
  data_riunione: string;
  titolo: string | null;
  reportino: string | null;
  corpo_libero: string | null;
  trascrizione: string | null;
  created_by_nome: string | null;
  /** Allegati linkati (foto + PDF), caricati lato server. */
  allegati: RiunioneAllegatoMobile[];
}

interface Props {
  riunioni: RiunioneMobileRow[];
  commessaId: string;
  /** Se true, mostra i bottoni "Aggiungi foto/video" e "Scatta" sull'espansione. */
  canUpload: boolean;
}

export function CommessaRiunioniMobile({ riunioni, commessaId, canUpload }: Props) {
  if (riunioni.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-card p-6 text-center text-sm text-muted-foreground">
        Nessuna riunione registrata su questa commessa.
      </div>
    );
  }

  return (
    <div className="relative pl-5">
      {/* Rail verticale */}
      <div className="absolute bottom-1 left-2 top-1 w-px bg-border" aria-hidden="true" />
      {riunioni.map((r) => (
        <div key={r.id} className="relative mb-2 last:mb-0">
          {/* Dot sul rail — primary se ha report AI, altrimenti muted */}
          <span
            className={cn(
              'absolute -left-4 top-5 z-10 h-2 w-2 rounded-full ring-2 ring-card',
              r.reportino?.trim() ? 'bg-primary' : 'bg-muted-foreground/40',
            )}
            aria-hidden="true"
          />
          <RiunioneCard r={r} commessaId={commessaId} canUpload={canUpload} />
        </div>
      ))}
    </div>
  );
}

function RiunioneCard({
  r,
  commessaId,
  canUpload,
}: {
  r: RiunioneMobileRow;
  commessaId: string;
  canUpload: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const [lightboxIdx, setLightboxIdx] = React.useState<number | null>(null);
  const hasReport = !!(r.reportino && r.reportino.trim());
  const fallbackText = (r.corpo_libero || r.trascrizione || '').trim();

  // Foto e video sono visualizzabili nel lightbox (che ha già VideoPlayer
  // integrato). I PDF restano link diretti.
  const mediaAllegati = React.useMemo(
    () =>
      r.allegati.filter((a) => {
        const m = a.mime ?? '';
        return (
          a.kind === 'foto' ||
          a.kind === 'video' ||
          m.startsWith('image/') ||
          m.startsWith('video/')
        );
      }),
    [r.allegati],
  );

  const lightboxItems = React.useMemo<MediaItem[]>(
    () =>
      mediaAllegati.map((a) => {
        const isVideo =
          a.kind === 'video' || (a.mime ?? '').startsWith('video/');
        return {
          id: a.file_ref_id,
          mime: a.mime,
          filename: a.filename,
          // I video sono solo sul nuovo flusso R2 → resolver /api/media/<id>
          // gestisce sia presigned GET R2 che redirect (Range-requests OK).
          // Per le foto resta /api/photo per compat con righe legacy.
          src: isVideo
            ? `/api/media/${a.file_ref_id}`
            : `/api/photo/${a.file_ref_id}`,
          annotation: { fileRefId: a.file_ref_id },
        };
      }),
    [mediaAllegati],
  );

  const openLightboxAt = (fileRefId: string) => {
    const idx = mediaAllegati.findIndex((a) => a.file_ref_id === fileRefId);
    if (idx >= 0) setLightboxIdx(idx);
  };

  return (
    <li
      className={cn(
        'list-none overflow-hidden rounded-lg border bg-card shadow-soft transition-colors',
        hasReport ? 'border-primary/30' : 'border-border',
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-start gap-2 p-3 text-left active:bg-muted/40"
      >
        <div className="min-w-0 flex-1">
          {/* Data sopra il titolo */}
          <p className="mb-0.5 font-mono text-[10px] text-muted-foreground">
            {fmtData(r.data_riunione)}
            {r.created_by_nome ? ` · ${r.created_by_nome}` : ''}
          </p>
          <div className="flex items-start gap-1.5">
            <p className="flex-1 text-[13px] font-medium leading-snug">
              {r.titolo?.trim() || 'Riunione'}
            </p>
            <div className="flex shrink-0 items-center gap-1">
              {hasReport ? (
                <span className="inline-flex items-center gap-0.5 rounded-full bg-primary/10 px-1.5 py-0 font-mono text-[9px] font-semibold uppercase tracking-[0.14em] text-primary">
                  <Sparkles className="h-2 w-2" />
                  AI
                </span>
              ) : null}
              {r.allegati.length > 0 ? (
                <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-500/10 px-1.5 py-0 font-mono text-[9px] font-semibold uppercase tracking-[0.14em] text-amber-700 dark:text-amber-400">
                  <Paperclip className="h-2 w-2" />
                  {r.allegati.length}
                </span>
              ) : null}
              <ChevronDown
                aria-hidden="true"
                className={cn(
                  'h-3 w-3 shrink-0 text-muted-foreground transition-transform',
                  open && 'rotate-180',
                )}
              />
            </div>
          </div>
          {!open && (hasReport || fallbackText) ? (
            <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
              {hasReport ? r.reportino : fallbackText}
            </p>
          ) : null}
        </div>
      </button>

      {open ? (
        <div className="space-y-3 border-t border-border bg-muted/30 px-3 py-3">
          {hasReport ? (
            <div>
              <p className="mb-1 font-mono text-[9px] uppercase tracking-[0.16em] text-primary">
                Report AI
              </p>
              <div className="whitespace-pre-wrap text-xs leading-relaxed">
                {r.reportino}
              </div>
            </div>
          ) : fallbackText ? (
            <div>
              <p className="mb-1 font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground">
                Verbale grezzo
              </p>
              <div className="whitespace-pre-wrap text-xs leading-relaxed text-foreground/90">
                {fallbackText}
              </div>
            </div>
          ) : null}

          {/* Allegati: foto thumb (proxy /api/photo) + PDF chip clickable */}
          {r.allegati.length > 0 ? (
            <div>
              <p className="mb-1.5 font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground">
                Allegati ({r.allegati.length})
              </p>
              <div className="grid grid-cols-3 gap-1.5">
                {r.allegati.map((a) => {
                  const mime = a.mime ?? '';
                  const isFoto = a.kind === 'foto' || mime.startsWith('image/');
                  const isVideo = a.kind === 'video' || mime.startsWith('video/');
                  if (isFoto) {
                    return (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => openLightboxAt(a.file_ref_id)}
                        aria-label={`Apri ${a.filename}`}
                        className="group relative aspect-square overflow-hidden rounded-md border border-border bg-card transition-transform active:scale-[0.96]"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={`/api/photo/${a.file_ref_id}`}
                          alt={a.filename}
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />
                      </button>
                    );
                  }
                  if (isVideo) {
                    return (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => openLightboxAt(a.file_ref_id)}
                        aria-label={`Apri ${a.filename}`}
                        className="group relative aspect-square overflow-hidden rounded-md border border-border bg-black transition-transform active:scale-[0.96]"
                      >
                        <video
                          src={`/api/media/${a.file_ref_id}`}
                          preload="metadata"
                          muted
                          playsInline
                          className="h-full w-full object-cover"
                        />
                        <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/20">
                          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-black/70 text-white">
                            <span aria-hidden="true" className="text-[10px]">▶</span>
                          </span>
                        </span>
                      </button>
                    );
                  }
                  // PDF / altro: chip con nome troncato e link al file su Nextcloud.
                  return (
                    <a
                      key={a.id}
                      href={a.path ? `/api/cloud/file?path=${encodeURIComponent(a.path)}` : '#'}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex aspect-square flex-col items-center justify-center gap-1 overflow-hidden rounded-md border border-border bg-card p-1.5 text-center"
                      title={a.filename}
                    >
                      <FileText className="h-5 w-5 shrink-0 text-muted-foreground" />
                      <span className="line-clamp-2 w-full break-all font-mono text-[8px] uppercase tracking-wider text-muted-foreground">
                        {a.filename.replace(/\.pdf$/i, '')}
                      </span>
                    </a>
                  );
                })}
              </div>
            </div>
          ) : null}

          {!hasReport && !fallbackText && r.allegati.length === 0 ? (
            <p className="text-xs italic text-muted-foreground">
              Riunione senza contenuto.
            </p>
          ) : null}

          {canUpload ? (
            <AllegatiAttacher commessaId={commessaId} riunioneId={r.id} />
          ) : null}
        </div>
      ) : null}

      {lightboxItems.length > 0 ? (
        <MediaLightbox
          items={lightboxItems}
          initialIndex={lightboxIdx}
          open={lightboxIdx !== null}
          onOpenChange={(o) => {
            if (!o) setLightboxIdx(null);
          }}
        />
      ) : null}
    </li>
  );
}

/**
 * Blocco "aggiungi allegati a una riunione esistente". L'upload va dalla
 * UploadQueue globale → R2 staging → server crea il link
 * commessa_riunione_allegato al complete. Quando un job di questa riunione
 * va in "done", facciamo router.refresh() per mostrare l'allegato.
 */
function AllegatiAttacher({
  commessaId,
  riunioneId,
}: {
  commessaId: string;
  riunioneId: string;
}) {
  const queue = useUploadQueue();
  const router = useRouter();
  const showAlert = useAlert();
  const galleryRef = React.useRef<HTMLInputElement | null>(null);
  const cameraRef = React.useRef<HTMLInputElement | null>(null);
  const enqueuedJobIdsRef = React.useRef<Set<string>>(new Set());
  const completedJobIdsRef = React.useRef<Set<string>>(new Set());

  // Rileva il done dei job di questa riunione → refresh server-side.
  React.useEffect(() => {
    let triggered = false;
    for (const job of queue.jobs) {
      if (
        enqueuedJobIdsRef.current.has(job.id) &&
        job.status === 'done' &&
        !completedJobIdsRef.current.has(job.id)
      ) {
        completedJobIdsRef.current.add(job.id);
        triggered = true;
      }
    }
    if (triggered) router.refresh();
  }, [queue.jobs, router]);

  const enqueueFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const oversized: string[] = [];
    for (const file of Array.from(files)) {
      const isVideo = file.type.startsWith('video/');
      if (isVideo && file.size > VIDEO_MAX_SIZE_BYTES) {
        oversized.push(file.name);
        continue;
      }
      const kind: 'foto' | 'video' = isVideo ? 'video' : 'foto';
      const id = queue.enqueue({
        fileBlob: file,
        fileName: file.name,
        fileMime: file.type || (isVideo ? 'video/mp4' : 'image/jpeg'),
        fileSize: file.size,
        commessaId,
        riunioneId,
        kind,
      });
      enqueuedJobIdsRef.current.add(id);
    }
    if (oversized.length > 0) {
      void showAlert({
        title: 'Alcuni video sono troppo grandi',
        body: `Limite: 500 MB.\n\nFile esclusi:\n${oversized.join('\n')}`,
      });
    }
  };

  return (
    <div className="rounded-lg border border-dashed border-primary/30 bg-primary/[0.03] p-2.5">
      <p className="mb-1.5 font-mono text-[9px] uppercase tracking-[0.16em] text-primary/80">
        Aggiungi alla riunione
      </p>
      <div className="grid grid-cols-[1fr_auto] gap-1.5">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-9 justify-center gap-1.5 border-primary/40 bg-card text-primary hover:bg-primary/5 hover:text-primary"
          onClick={() => galleryRef.current?.click()}
        >
          <ImagePlus className="h-4 w-4" aria-hidden="true" />
          <span className="text-xs font-medium">Foto / video</span>
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-9 gap-1 px-2 text-muted-foreground hover:text-foreground"
          onClick={() => cameraRef.current?.click()}
          aria-label="Scatta foto"
          title="Scatta foto"
        >
          <Camera className="h-4 w-4" aria-hidden="true" />
          <span className="text-[10px] font-medium uppercase tracking-wider">
            Scatta
          </span>
        </Button>
      </div>
      <input
        ref={galleryRef}
        type="file"
        accept="image/*,video/*"
        multiple
        className="hidden"
        onChange={(e) => {
          enqueueFiles(e.target.files);
          // reset così riselezionare lo stesso file riemette l'evento.
          e.target.value = '';
        }}
      />
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          enqueueFiles(e.target.files);
          e.target.value = '';
        }}
      />
    </div>
  );
}

function fmtData(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const sameYear = d.getFullYear() === now.getFullYear();
    return d.toLocaleDateString('it-IT', {
      day: '2-digit',
      month: 'short',
      year: sameYear ? undefined : '2-digit',
    });
  } catch {
    return iso;
  }
}
