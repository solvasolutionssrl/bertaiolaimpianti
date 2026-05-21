'use client';

import * as React from 'react';
import { Camera, Video, X, Plus, AlertCircle, Smartphone, CheckCircle2, Loader2 } from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@impiantixplus/ui';
import type { UploadProgressMap } from '../_lib/upload-media';

export interface MediaFile {
  id: string;
  file: File;
  kind: 'image' | 'video';
  previewUrl: string;
  sizeMB: number;
}

const MAX_VIDEO_MB = 150;
const MAX_PHOTO_MB = 25;
const MAX_FILES = 6;

interface ValidationError {
  name: string;
  reason: string;
}

interface Props {
  files: MediaFile[];
  onChange: (files: MediaFile[]) => void;
  uploading?: boolean;
  uploadProgress?: UploadProgressMap;
}

export function MediaAttachSection({ files, onChange, uploading = false, uploadProgress }: Props) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [skipOpen, setSkipOpen] = React.useState(false);
  const [validationErrors, setValidationErrors] = React.useState<ValidationError[]>([]);

  const addFiles = (list: FileList | null) => {
    if (!list || list.length === 0) return;
    const errors: ValidationError[] = [];
    const accepted: MediaFile[] = [];
    const remaining = MAX_FILES - files.length;
    Array.from(list).forEach((f, idx) => {
      if (idx >= remaining) {
        errors.push({ name: f.name, reason: `Limite di ${MAX_FILES} file raggiunto` });
        return;
      }
      const isVideo = f.type.startsWith('video/');
      const sizeMB = f.size / (1024 * 1024);
      const limit = isVideo ? MAX_VIDEO_MB : MAX_PHOTO_MB;
      if (sizeMB > limit) {
        errors.push({
          name: f.name,
          reason: isVideo
            ? `Video troppo grande (${sizeMB.toFixed(0)} MB, max ${MAX_VIDEO_MB} MB). Registra in 1080p: Impostazioni iPhone → Fotocamera.`
            : `Foto troppo grande (${sizeMB.toFixed(0)} MB, max ${MAX_PHOTO_MB} MB).`,
        });
        return;
      }
      accepted.push({
        id: crypto.randomUUID(),
        file: f,
        kind: isVideo ? 'video' : 'image',
        previewUrl: URL.createObjectURL(f),
        sizeMB,
      });
    });
    if (errors.length > 0) setValidationErrors(errors);
    if (accepted.length > 0) onChange([...files, ...accepted]);
  };

  const remove = (id: string) => {
    const target = files.find((f) => f.id === id);
    if (target) URL.revokeObjectURL(target.previewUrl);
    onChange(files.filter((f) => f.id !== id));
    setValidationErrors([]);
  };

  const clearAll = () => {
    for (const f of files) URL.revokeObjectURL(f.previewUrl);
    onChange([]);
    setValidationErrors([]);
    setSkipOpen(false);
  };

  const totalMB = files.reduce((s, f) => s + f.sizeMB, 0);
  const hasVideo = files.some((f) => f.kind === 'video');
  const atLimit = files.length >= MAX_FILES;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
            <Camera className="h-4 w-4" aria-hidden="true" />
          </span>
          <div>
            <CardTitle className="text-base">Foto &amp; Video · sopralluogo</CardTitle>
            <CardDescription>
              Documenta lo stato iniziale del cantiere. Opzionale — puoi aggiungere altro in seguito.
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {files.length === 0 ? (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="flex min-h-[96px] w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-primary/30 bg-primary-soft/20 text-primary transition hover:bg-primary-soft/40 active:scale-[.98]"
          >
            <Camera className="h-7 w-7 opacity-70" aria-hidden="true" />
            <span className="text-sm font-medium">Aggiungi foto o video</span>
            <span className="text-xs text-muted-foreground">Scatta o scegli dalla libreria</span>
          </button>
        ) : (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {files.map((f) => {
              const prog = uploadProgress?.get(f.id);
              return (
                <div
                  key={f.id}
                  className="group relative aspect-square overflow-hidden rounded-lg border border-border bg-muted"
                >
                  {f.kind === 'image' ? (
                    <img src={f.previewUrl} alt={f.file.name} className="h-full w-full object-cover" />
                  ) : (
                    <VideoThumb src={f.previewUrl} />
                  )}

                  {/* Progress overlay */}
                  {prog && prog.step !== 'done' && prog.step !== 'error' && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/60">
                      {prog.step === 'compressing' ? (
                        <>
                          <Loader2 className="h-5 w-5 animate-spin text-white" aria-hidden="true" />
                          <span className="text-[10px] font-semibold text-white">Comprimo…</span>
                        </>
                      ) : (
                        <>
                          <div className="w-3/4 overflow-hidden rounded-full bg-white/30">
                            <div
                              className="h-1.5 rounded-full bg-white transition-all duration-150"
                              style={{ width: `${Math.round(prog.pct * 100)}%` }}
                            />
                          </div>
                          <span className="text-[10px] font-semibold text-white">
                            {Math.round(prog.pct * 100)}%
                          </span>
                        </>
                      )}
                    </div>
                  )}

                  {/* Done */}
                  {prog?.step === 'done' && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                      <CheckCircle2 className="h-7 w-7 text-white drop-shadow" aria-hidden="true" />
                    </div>
                  )}

                  {/* Error */}
                  {prog?.step === 'error' && (
                    <div className="absolute inset-0 flex items-center justify-center bg-destructive/60">
                      <AlertCircle className="h-7 w-7 text-white drop-shadow" aria-hidden="true" />
                    </div>
                  )}

                  {/* Badges (hidden during upload) */}
                  {!prog && (
                    <div className="absolute bottom-1 left-1 flex gap-1">
                      {f.kind === 'video' && (
                        <span className="rounded-full bg-black/70 px-1.5 py-px text-[10px] font-semibold text-white">
                          ▶
                        </span>
                      )}
                      <span className="rounded-full bg-black/60 px-1.5 py-px text-[10px] text-white">
                        {f.sizeMB.toFixed(1)} MB
                      </span>
                    </div>
                  )}

                  <button
                    type="button"
                    aria-label={`Rimuovi ${f.file.name}`}
                    onClick={() => remove(f.id)}
                    disabled={uploading}
                    className="absolute right-1 top-1 inline-flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition group-hover:opacity-100 focus-visible:opacity-100 active:opacity-100 disabled:pointer-events-none"
                  >
                    <X className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </div>
              );
            })}

            {!atLimit && !uploading && (
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                aria-label="Aggiungi altri file"
                className="flex aspect-square items-center justify-center rounded-lg border-2 border-dashed border-primary/30 bg-primary-soft/20 text-primary transition hover:bg-primary-soft/40 active:scale-[.98]"
              >
                <Plus className="h-5 w-5" aria-hidden="true" />
              </button>
            )}
          </div>
        )}

        <input
          ref={inputRef}
          type="file"
          accept="image/*,video/*"
          multiple
          className="sr-only"
          onChange={(e) => addFiles(e.target.files)}
          onClick={(e) => ((e.target as HTMLInputElement).value = '')}
        />

        {validationErrors.length > 0 && (
          <div className="space-y-1.5 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2">
            {validationErrors.map((e, i) => (
              <div key={i} className="flex items-start gap-1.5 text-xs text-destructive">
                <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span>
                  <span className="font-medium">{e.name}</span> — {e.reason}
                </span>
              </div>
            ))}
          </div>
        )}

        {hasVideo && (
          <div className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning-foreground">
            <Smartphone className="mt-px h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              Tieni lo schermo acceso durante il caricamento del video — iOS sospende i
              trasferimenti se il display si spegne.
            </span>
          </div>
        )}

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          {files.length > 0 ? (
            <span>
              <span className="font-semibold tabular-nums text-foreground">{files.length}</span>
              {atLimit && <span className="ml-1">(max {MAX_FILES})</span>}{' '}
              file ·{' '}
              <span className="font-semibold tabular-nums text-foreground">
                {totalMB.toFixed(1)} MB
              </span>{' '}
              totali
            </span>
          ) : (
            <span>Nessun allegato — la commessa verrà creata senza file.</span>
          )}
          {files.length > 0 && !uploading && (
            <button
              type="button"
              onClick={() => setSkipOpen(true)}
              className="underline-offset-2 hover:text-foreground hover:underline"
            >
              Salta per ora
            </button>
          )}
        </div>
      </CardContent>

      <Dialog open={skipOpen} onOpenChange={setSkipOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rimuovere i file selezionati?</DialogTitle>
            <DialogDescription>
              Hai selezionato {files.length} file. Potrai aggiungerli dalla commessa dopo la
              creazione, nella sezione Foto.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button type="button" variant="ghost" onClick={() => setSkipOpen(false)}>
              Annulla
            </Button>
            <Button type="button" variant="outline" onClick={clearAll}>
              Sì, rimuovi tutti
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function VideoThumb({ src }: { src: string }) {
  const [thumb, setThumb] = React.useState<string | null>(null);
  React.useEffect(() => {
    const video = document.createElement('video');
    video.src = src;
    video.muted = true;
    video.playsInline = true;
    video.currentTime = 0.5;
    const handler = () => {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth || 320;
      canvas.height = video.videoHeight || 240;
      canvas.getContext('2d')?.drawImage(video, 0, 0);
      setThumb(canvas.toDataURL('image/jpeg', 0.6));
    };
    video.addEventListener('loadeddata', handler, { once: true });
    return () => { video.src = ''; };
  }, [src]);
  return thumb ? (
    <img src={thumb} alt="" className="h-full w-full object-cover" />
  ) : (
    <div className="flex h-full w-full items-center justify-center">
      <Video className="h-7 w-7 text-muted-foreground" aria-hidden="true" />
    </div>
  );
}
