'use client';

import * as React from 'react';
import { Camera, ImagePlus, X } from 'lucide-react';

import { cn } from '@kommessa/ui';

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
  className?: string;
}

export function PhotoCaptureInput({
  name,
  id = 'photo-input',
  required,
  allowGallery = false,
  onFileChange,
  className,
}: PhotoCaptureInputProps) {
  const cameraInputRef = React.useRef<HTMLInputElement>(null);
  const galleryInputRef = React.useRef<HTMLInputElement>(null);
  const [preview, setPreview] = React.useState<string | null>(null);
  const [fileName, setFileName] = React.useState<string | null>(null);

  // Cleanup objectURL per evitare memory leak
  React.useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    if (preview) URL.revokeObjectURL(preview);
    if (file) {
      const url = URL.createObjectURL(file);
      setPreview(url);
      setFileName(file.name);
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
    setPreview(null);
    setFileName(null);
    onFileChange?.(null);
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
