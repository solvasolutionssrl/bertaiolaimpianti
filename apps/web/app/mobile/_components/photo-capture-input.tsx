'use client';

import * as React from 'react';
import { Camera, CalendarClock, ImagePlus, X } from 'lucide-react';

import { cn } from '@kommessa/ui';

import { fmtScattoDate, readImageDate } from '../../_lib/read-image-date';

/**
 * PhotoCaptureInput — wrapper su `<input type="file" capture>` che:
 *  - apre la camera nativa iOS/Android (capture="environment")
 *  - mostra preview compressa lato client
 *  - espone il File al parent via `name` (è un form-friendly input)
 *  - non gestisce EXIF in lettura (browser per privacy spesso lo strippano);
 *    geo + timestamp vengono presi runtime via Geolocation API + Date.now()
 *    dal parent (vedi `scatto/page.tsx`).
 *
 * Comportamento camera vs galleria:
 *  - bottone principale ("Tap per scattare"): SEMPRE camera diretta
 *    (`capture="environment"`). È l'azione 1-tap del cantiere.
 *  - se `allowGallery=true` mostra anche un bottone secondario "Allega
 *    da galleria" con un secondo input separato (no `capture`) →
 *    permette di caricare una foto fatta in precedenza o un PDF/file
 *    già sul telefono.
 *
 * Mockup_UI §4 (scatto foto cantiere).
 */
export interface PhotoCaptureInputProps {
  name: string;
  id?: string;
  required?: boolean;
  /** Se true mostra ANCHE un bottone "Da galleria". Default false (solo camera). */
  allowGallery?: boolean;
  onFileChange?: (file: File | null) => void;
  /** Callback con la data di scatto rilevata da EXIF o lastModified. */
  onTakenAtChange?: (date: Date | null) => void;
  className?: string;
}

export function PhotoCaptureInput({
  name,
  id = 'photo-input',
  required,
  allowGallery = false,
  onFileChange,
  onTakenAtChange,
  className,
}: PhotoCaptureInputProps) {
  const cameraInputRef = React.useRef<HTMLInputElement>(null);
  const galleryInputRef = React.useRef<HTMLInputElement>(null);
  const [preview, setPreview] = React.useState<string | null>(null);
  const [fileName, setFileName] = React.useState<string | null>(null);
  const [takenAt, setTakenAt] = React.useState<Date | null>(null);
  // Token monotono per scartare risultati EXIF di file già rimossi.
  const exifTokenRef = React.useRef(0);

  // Cleanup objectURL per evitare memory leak
  React.useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    if (preview) URL.revokeObjectURL(preview);
    setTakenAt(null);
    onTakenAtChange?.(null);
    if (file) {
      const url = URL.createObjectURL(file);
      setPreview(url);
      setFileName(file.name);
      // Lettura asincrona EXIF: non blocca il preview, aggiorna la pill
      // quando arriva. Token previene race se l'utente cambia foto subito.
      const myToken = ++exifTokenRef.current;
      void readImageDate(file).then((d) => {
        if (exifTokenRef.current !== myToken) return;
        setTakenAt(d);
        onTakenAtChange?.(d);
      });
    } else {
      setPreview(null);
      setFileName(null);
    }
    onFileChange?.(file);
  };

  const reset = () => {
    if (cameraInputRef.current) cameraInputRef.current.value = '';
    if (galleryInputRef.current) galleryInputRef.current.value = '';
    if (preview) URL.revokeObjectURL(preview);
    exifTokenRef.current++;
    setPreview(null);
    setFileName(null);
    setTakenAt(null);
    onFileChange?.(null);
    onTakenAtChange?.(null);
  };

  return (
    <div className={cn('space-y-2', className)}>
      {/* Input camera diretta — sempre presente, è il default */}
      <input
        ref={cameraInputRef}
        id={id}
        name={name}
        type="file"
        accept="image/*"
        capture="environment"
        required={required}
        onChange={handleChange}
        className="sr-only"
      />
      {/* Input galleria — solo se allowGallery. NON ha `name` per evitare
          collisione di submit FormData con l'input camera. */}
      {allowGallery ? (
        <input
          ref={galleryInputRef}
          id={`${id}-gallery`}
          type="file"
          accept="image/*"
          onChange={handleChange}
          className="sr-only"
        />
      ) : null}

      {preview ? (
        <div className="relative overflow-hidden rounded-xl border border-border bg-muted">
          <img
            src={preview}
            alt={`Anteprima foto ${fileName ?? ''}`}
            className="aspect-[4/3] w-full object-cover"
          />
          {takenAt ? (
            <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-full bg-black/65 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-white backdrop-blur-sm">
              <CalendarClock className="h-3 w-3" aria-hidden="true" />
              {fmtScattoDate(takenAt)}
            </span>
          ) : null}
          <button
            type="button"
            onClick={reset}
            aria-label="Rimuovi foto"
            className="absolute right-2 top-2 inline-flex h-9 w-9 items-center justify-center rounded-full bg-black/60 text-white"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {/* Bottone principale: camera diretta — full-width, tap target grande */}
          <label
            htmlFor={id}
            className={cn(
              'flex min-h-[200px] cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-primary/40 bg-primary/5 p-6 text-center transition-colors hover:bg-primary/10 active:bg-primary/15',
            )}
          >
            <Camera
              className="h-11 w-11 text-primary"
              aria-hidden="true"
              strokeWidth={1.5}
            />
            <span className="text-base font-semibold text-foreground">
              Scatta foto
            </span>
            <span className="text-[11px] font-mono uppercase tracking-[0.14em] text-muted-foreground">
              Tap per aprire la fotocamera
            </span>
          </label>

          {/* Bottone secondario: galleria — solo se allowGallery */}
          {allowGallery ? (
            <label
              htmlFor={`${id}-gallery`}
              className={cn(
                'flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground active:bg-muted/70',
              )}
            >
              <ImagePlus className="h-4 w-4" aria-hidden="true" />
              Allega da galleria
            </label>
          ) : null}
        </div>
      )}
    </div>
  );
}
