'use client';

import * as React from 'react';
import {
  Camera,
  Video,
  X,
  AlertCircle,
  Smartphone,
  CheckCircle2,
  Loader2,
  Paperclip,
  CalendarClock,
  FileText,
  ScanLine,
} from 'lucide-react';
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
} from '@kommessa/ui';
import type { UploadProgressMap } from '../_lib/upload-media';
import {
  dataDaLastModified,
  fmtScattoDate,
  readImageDate,
} from '../../../../_lib/read-image-date';

export interface MediaFile {
  id: string;
  file: File;
  kind: 'image' | 'video' | 'pdf';
  /** Vuoto per i PDF (nessuna anteprima immagine): si mostra l'icona file. */
  previewUrl: string;
  sizeMB: number;
  /** Data di scatto da EXIF o fallback File.lastModified. null se non rilevabile. */
  takenAt: Date | null;
}

const MAX_VIDEO_MB = 500;
const MAX_PHOTO_MB = 25;
// Documenti PDF (capitolati, schemi, preventivi cartacei scansionati): cap
// generoso ma sotto la soglia multipart, niente compressione client-side.
const MAX_DOC_MB = 50;
// Cap pratico: 30 file in un singolo intake (foto + video). Sopra è quasi
// sempre un errore (sopralluogo lungo = meglio scattarne 30, creare la
// commessa, poi continuare dal pannello commessa). 30 lascia tantissimo
// spazio per sopralluoghi reali (10-15 foto + 1-2 video tipici).
const MAX_FILES = 30;
const WARN_VIDEO_MB = 200;
// Soft warning quando ci si avvicina al cap: 80% = 24/30.
const WARN_NEAR_LIMIT = Math.floor(MAX_FILES * 0.8);

interface ValidationError {
  name: string;
  reason: string;
}

interface Props {
  files: MediaFile[];
  onChange: (files: MediaFile[]) => void;
  uploading?: boolean;
  uploadProgress?: UploadProgressMap;
  onCancel?: () => void;
  /** Se presente, mostra un tasto "Scansiona" (scanner PDF da fotocamera). */
  onScanPdf?: () => void;
  /** Titolo/descrizione della card. Default: contesto sopralluogo. */
  title?: string;
  description?: string;
}

export function MediaAttachSection({
  files,
  onChange,
  uploading = false,
  uploadProgress,
  onCancel,
  onScanPdf,
  title,
  description,
}: Props) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const cameraInputRef = React.useRef<HTMLInputElement>(null);
  const docInputRef = React.useRef<HTMLInputElement>(null);
  const [skipOpen, setSkipOpen] = React.useState(false);
  const [validationErrors, setValidationErrors] = React.useState<ValidationError[]>([]);
  const [confirmCancel, setConfirmCancel] = React.useState(false);

  const addFiles = async (list: FileList | null) => {
    if (!list || list.length === 0) return;
    const errors: ValidationError[] = [];
    const accepted: MediaFile[] = [];
    const remaining = MAX_FILES - files.length;
    Array.from(list).forEach((f, idx) => {
      if (idx >= remaining) {
        errors.push({ name: f.name, reason: `Limite di ${MAX_FILES} file raggiunto` });
        return;
      }
      // I PDF arrivano dal picker documenti (mime application/pdf) ma su alcuni
      // device il mime può mancare: ricadiamo sull'estensione del nome.
      const isPdf = f.type === 'application/pdf' || /\.pdf$/i.test(f.name);
      const isVideo = !isPdf && f.type.startsWith('video/');
      const sizeMB = f.size / (1024 * 1024);
      const limit = isPdf ? MAX_DOC_MB : isVideo ? MAX_VIDEO_MB : MAX_PHOTO_MB;
      if (sizeMB > limit) {
        errors.push({
          name: f.name,
          reason: isPdf
            ? `File troppo grande (${sizeMB.toFixed(0)} MB, max ${MAX_DOC_MB} MB).`
            : isVideo
              ? `Video troppo grande (${sizeMB.toFixed(0)} MB, max ${MAX_VIDEO_MB} MB). Vai su Impostazioni iPhone → Fotocamera → Formato e scegli "Alta efficienza" (H.265).`
              : `Foto troppo grande (${sizeMB.toFixed(0)} MB, max ${MAX_PHOTO_MB} MB).`,
        });
        return;
      }
      const kind: MediaFile['kind'] = isPdf ? 'pdf' : isVideo ? 'video' : 'image';
      accepted.push({
        id: crypto.randomUUID(),
        file: f,
        kind,
        // I PDF non hanno anteprima immagine: previewUrl resta vuoto (nessun
        // object URL da revocare, nessun <img> da renderizzare).
        previewUrl: isPdf ? '' : URL.createObjectURL(f),
        sizeMB,
        takenAt: null,
      });
    });
    if (errors.length > 0) setValidationErrors(errors);
    if (accepted.length === 0) return;

    // Consegna in DUE ondate (correzione 30/07/2026).
    //
    // Prima si aspettava `Promise.all` sull'EXIF di TUTTO il batch prima di
    // esporre un solo file al parent: un video selezionato insieme a 20 foto
    // restava fermo finché exifr non aveva finito con le foto, e solo dopo
    // iniziava a caricare. Video e PDF non hanno EXIF utile, quindi escono
    // subito con la data presa da `lastModified`; le foto arrivano appena
    // l'EXIF è pronto.
    const immagini = accepted.filter((m) => m.kind === 'image');
    const senzaExif = accepted.filter((m) => m.kind !== 'image');
    const base = files;

    if (senzaExif.length > 0) {
      onChange([
        ...base,
        ...senzaExif.map((m) => ({
          ...m,
          takenAt: m.kind === 'pdf' ? null : dataDaLastModified(m.file),
        })),
      ]);
    }
    if (immagini.length === 0) return;

    // exifr legge ~64KB di testa per file → 50-200ms cadauno, in parallelo.
    const conDate = await Promise.all(
      immagini.map(async (m) => ({ ...m, takenAt: await readImageDate(m.file) })),
    );
    onChange([
      ...base,
      ...senzaExif.map((m) => ({
        ...m,
        takenAt: m.kind === 'pdf' ? null : dataDaLastModified(m.file),
      })),
      ...conDate,
    ]);
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
  const hasLargeVideo = files.some((f) => f.kind === 'video' && f.sizeMB > WARN_VIDEO_MB);
  const atLimit = files.length >= MAX_FILES;
  const nearLimit = files.length >= WARN_NEAR_LIMIT && !atLimit;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
            <Camera className="h-4 w-4" aria-hidden="true" />
          </span>
          <div>
            <CardTitle className="text-base">{title ?? 'Foto/video · sopralluogo'}</CardTitle>
            <CardDescription>
              {description ??
                'Documenta lo stato iniziale del cantiere. Opzionale — puoi aggiungere altro in seguito.'}
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Counter X/MAX + warning quando vicino o al limite. Mostrato solo
            quando ci sono già file (in vuoto-state non serve confondere). */}
        {files.length > 0 ? (
          <div
            className={`flex items-center justify-between rounded-md border px-2.5 py-1.5 text-xs ${
              atLimit
                ? 'border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-200'
                : nearLimit
                  ? 'border-amber-500/30 bg-amber-500/[0.04] text-amber-900/85 dark:text-amber-200/85'
                  : 'border-border bg-muted/30 text-muted-foreground'
            }`}
          >
            <span>
              <span className="font-mono font-semibold tabular-nums">
                {files.length}/{MAX_FILES}
              </span>{' '}
              file allegati{totalMB > 0 ? ` · ${totalMB.toFixed(0)} MB` : ''}
            </span>
            {atLimit ? (
              <span className="font-medium">
                Limite raggiunto — rimuovi un file per aggiungerne altri
              </span>
            ) : nearLimit ? (
              <span>vicino al limite</span>
            ) : null}
          </div>
        ) : null}

        {files.length === 0 ? (
          <div className={onScanPdf ? 'grid grid-cols-2 gap-2' : 'grid grid-cols-3 gap-2'}>
            <button
              type="button"
              onClick={() => cameraInputRef.current?.click()}
              className="flex min-h-[88px] flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-primary/30 bg-primary-soft/20 text-primary transition hover:bg-primary-soft/40 active:scale-[.98]"
            >
              <Camera className="h-6 w-6 opacity-70" aria-hidden="true" />
              <span className="text-sm font-semibold">Scatta foto</span>
              <span className="text-[11px] text-muted-foreground">Fotocamera</span>
            </button>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="flex min-h-[88px] flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border bg-muted/20 text-muted-foreground transition hover:bg-muted/40 active:scale-[.98]"
            >
              <Paperclip className="h-6 w-6 opacity-70" aria-hidden="true" />
              <span className="text-sm font-semibold text-foreground">Foto e video</span>
              <span className="text-[11px]">Dalla galleria</span>
            </button>
            <button
              type="button"
              onClick={() => docInputRef.current?.click()}
              className="flex min-h-[88px] flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border bg-muted/20 text-muted-foreground transition hover:bg-muted/40 active:scale-[.98]"
            >
              <FileText className="h-6 w-6 opacity-70" aria-hidden="true" />
              <span className="text-sm font-semibold text-foreground">Allega file</span>
              <span className="text-[11px]">PDF e documenti</span>
            </button>
            {onScanPdf ? (
              <button
                type="button"
                onClick={onScanPdf}
                className="flex min-h-[88px] flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-sky-300 bg-sky-50/60 text-sky-700 transition hover:bg-sky-50 active:scale-[.98]"
              >
                <ScanLine className="h-6 w-6 opacity-80" aria-hidden="true" />
                <span className="text-sm font-semibold">Scansiona PDF</span>
                <span className="text-[11px] text-sky-700/70">Foto dei fogli</span>
              </button>
            ) : null}
          </div>
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
                  ) : f.kind === 'video' ? (
                    <VideoThumb src={f.previewUrl} sizeMB={f.sizeMB} />
                  ) : (
                    <PdfThumb name={f.file.name} />
                  )}

                  {/* Progress overlay */}
                  {prog && prog.step !== 'done' && prog.step !== 'error' && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/60">
                      {prog.step === 'compressing' ? (
                        <>
                          <Loader2 className="h-5 w-5 animate-spin text-white" aria-hidden="true" />
                          <span className="text-[10px] font-semibold text-white">Comprimo…</span>
                        </>
                      ) : prog.step === 'processing' ? (
                        <>
                          <Loader2 className="h-5 w-5 animate-spin text-white" aria-hidden="true" />
                          <span className="text-[10px] font-semibold text-white">Cloud…</span>
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
                    <div className="absolute inset-x-1 bottom-1 flex flex-col items-start gap-1">
                      <div className="flex gap-1">
                        {f.kind === 'video' && (
                          <span className="rounded-full bg-black/70 px-1.5 py-px text-[10px] font-semibold text-white">
                            ▶
                          </span>
                        )}
                        <span className="rounded-full bg-black/60 px-1.5 py-px text-[10px] text-white">
                          {f.sizeMB.toFixed(1)} MB
                        </span>
                      </div>
                      {f.takenAt ? (
                        <span
                          className="inline-flex max-w-full items-center gap-0.5 truncate rounded-full bg-black/65 px-1.5 py-px text-[9px] font-medium text-white backdrop-blur-sm"
                          title={f.takenAt.toLocaleString('it-IT', { timeZone: 'Europe/Rome' })}
                        >
                          <CalendarClock className="h-2.5 w-2.5" aria-hidden="true" />
                          {fmtScattoDate(f.takenAt)}
                        </span>
                      ) : null}
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

            {/* Quando ci sono già file, mostriamo DUE tile rapidi:
                "Scatta" (camera) primary + "Allega" (gallery) secondary.
                Prima c'era solo un "+" generico che apriva la GALLERIA,
                rendendo impossibile scattare in sequenza dal terzo step
                voice-intake. Fix richiesto da Bertaiola. */}
            {!atLimit && !uploading &&
              (onScanPdf ? (
                <>
                  <button
                    type="button"
                    onClick={() => cameraInputRef.current?.click()}
                    aria-label="Scatta una foto"
                    className="flex aspect-square flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-primary/40 bg-primary-soft/30 text-primary transition hover:bg-primary-soft/50 active:scale-[.98]"
                  >
                    <Camera className="h-5 w-5" aria-hidden="true" />
                    <span className="text-[11px] font-medium">Scatta</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => inputRef.current?.click()}
                    aria-label="Allega foto o video dalla galleria"
                    className="flex aspect-square flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-border bg-muted/30 text-muted-foreground transition hover:bg-muted/50 active:scale-[.98]"
                  >
                    <Paperclip className="h-5 w-5" aria-hidden="true" />
                    <span className="text-[11px] font-medium">Galleria</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => docInputRef.current?.click()}
                    aria-label="Allega un file PDF o documento"
                    className="flex aspect-square flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-border bg-muted/30 text-muted-foreground transition hover:bg-muted/50 active:scale-[.98]"
                  >
                    <FileText className="h-5 w-5" aria-hidden="true" />
                    <span className="text-[11px] font-medium">File</span>
                  </button>
                  <button
                    type="button"
                    onClick={onScanPdf}
                    aria-label="Scansiona un PDF con la fotocamera"
                    className="flex aspect-square flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-sky-300 bg-sky-50/60 text-sky-700 transition hover:bg-sky-50 active:scale-[.98]"
                  >
                    <ScanLine className="h-5 w-5" aria-hidden="true" />
                    <span className="text-[11px] font-medium">Scansiona</span>
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => cameraInputRef.current?.click()}
                    aria-label="Scatta un'altra foto"
                    className="flex aspect-square flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-primary/40 bg-primary-soft/30 text-primary transition hover:bg-primary-soft/50 active:scale-[.98]"
                  >
                    <Camera className="h-5 w-5" aria-hidden="true" />
                    <span className="text-[10px] font-semibold uppercase tracking-wider">
                      Scatta
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => inputRef.current?.click()}
                    aria-label="Allega altri file dalla libreria"
                    className="flex aspect-square flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-border bg-muted/30 text-muted-foreground transition hover:bg-muted/50 active:scale-[.98]"
                  >
                    <Paperclip className="h-5 w-5" aria-hidden="true" />
                    <span className="text-[10px] font-semibold uppercase tracking-wider">
                      Allega
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => docInputRef.current?.click()}
                    aria-label="Allega un file PDF o documento"
                    className="flex aspect-square flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-border bg-muted/30 text-muted-foreground transition hover:bg-muted/50 active:scale-[.98]"
                  >
                    <FileText className="h-5 w-5" aria-hidden="true" />
                    <span className="text-[10px] font-semibold uppercase tracking-wider">
                      File
                    </span>
                  </button>
                </>
              ))}
          </div>
        )}

        {/* File picker — libreria (foto + video, multipli) */}
        <input
          ref={inputRef}
          type="file"
          accept="image/*,video/*"
          multiple
          className="sr-only"
          onChange={(e) => addFiles(e.target.files)}
          onClick={(e) => ((e.target as HTMLInputElement).value = '')}
        />
        {/* Camera input — scatto diretto (solo immagini, fotocamera posteriore) */}
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          onChange={(e) => addFiles(e.target.files)}
          onClick={(e) => ((e.target as HTMLInputElement).value = '')}
        />
        {/* File picker — documenti PDF (multipli) */}
        <input
          ref={docInputRef}
          type="file"
          accept="application/pdf,.pdf"
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

        {hasLargeVideo && (
          <div className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning-foreground">
            <Smartphone className="mt-px h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              Video grande (&gt;{WARN_VIDEO_MB} MB) — il caricamento richiede qualche minuto su rete mobile.
              Per file più leggeri: <strong>Impostazioni iPhone → Fotocamera → Formato → Alta efficienza</strong> (H.265 dimezza la dimensione senza perdita visibile).
              Puoi continuare a lavorare o chiudere l&apos;app: il caricamento riprende da solo.
            </span>
          </div>
        )}
        {hasVideo && !hasLargeVideo && (
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
          {uploading && onCancel ? (
            confirmCancel ? (
              <span className="flex items-center gap-2">
                <span className="text-foreground">Annullare?</span>
                <button
                  type="button"
                  className="font-semibold text-destructive"
                  onClick={() => { onCancel(); setConfirmCancel(false); }}
                >
                  Sì
                </button>
                <button
                  type="button"
                  className="text-muted-foreground"
                  onClick={() => setConfirmCancel(false)}
                >
                  No
                </button>
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmCancel(true)}
                className="underline-offset-2 hover:text-foreground hover:underline"
              >
                Annulla
              </button>
            )
          ) : files.length > 0 && !uploading ? (
            <button
              type="button"
              onClick={() => setSkipOpen(true)}
              className="underline-offset-2 hover:text-foreground hover:underline"
            >
              Salta per ora
            </button>
          ) : null}
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

/**
 * Sopra questa soglia non si estrae il fotogramma di anteprima: decodificare un
 * video da centinaia di MB sul main thread blocca la UI e ruba CPU proprio
 * mentre l'upload dovrebbe avanzare. Si mostra l'icona e basta.
 */
const ANTEPRIMA_VIDEO_MAX_MB = 30;

function VideoThumb({ src, sizeMB }: { src: string; sizeMB?: number }) {
  const troppoGrande = (sizeMB ?? 0) > ANTEPRIMA_VIDEO_MAX_MB;
  const [thumb, setThumb] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (troppoGrande) return;
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
  }, [src, troppoGrande]);
  return thumb ? (
    <img src={thumb} alt="" className="h-full w-full object-cover" />
  ) : (
    <div className="flex h-full w-full items-center justify-center">
      <Video className="h-7 w-7 text-muted-foreground" aria-hidden="true" />
    </div>
  );
}

function PdfThumb({ name }: { name: string }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-muted/60 px-1.5 text-center">
      <FileText className="h-7 w-7 text-muted-foreground" aria-hidden="true" />
      <span className="line-clamp-2 break-all text-[9px] leading-tight text-muted-foreground">
        {name}
      </span>
    </div>
  );
}
