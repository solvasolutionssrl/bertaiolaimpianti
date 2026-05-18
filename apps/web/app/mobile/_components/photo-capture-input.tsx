'use client';

import * as React from 'react';
import { Camera, ImagePlus, X } from 'lucide-react';

import { cn } from '@impiantixplus/ui';

/**
 * PhotoCaptureInput — wrapper su `<input type="file" capture>` che:
 *  - apre la camera nativa iOS/Android (capture="environment")
 *  - mostra preview compressa lato client
 *  - espone il File al parent via `name` (è un form-friendly input)
 *  - non gestisce EXIF in lettura (browser per privacy spesso lo strippano);
 *    geo + timestamp vengono presi runtime via Geolocation API + Date.now()
 *    dal parent (vedi `scatto/page.tsx`).
 *
 * Mockup_UI §4 (scatto foto cantiere).
 */
export interface PhotoCaptureInputProps {
  name: string;
  id?: string;
  required?: boolean;
  /** Se true accetta selezione anche dalla galleria. Default false (solo camera). */
  allowGallery?: boolean;
  onFileChange?: (file: File | null) => void;
  className?: string;
}

export function PhotoCaptureInput({
  name,
  id = 'photo-input',
  required,
  allowGallery = true,
  onFileChange,
  className,
}: PhotoCaptureInputProps) {
  const inputRef = React.useRef<HTMLInputElement>(null);
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
    if (inputRef.current) inputRef.current.value = '';
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    setFileName(null);
    onFileChange?.(null);
  };

  return (
    <div className={cn('space-y-2', className)}>
      <input
        ref={inputRef}
        id={id}
        name={name}
        type="file"
        accept="image/*"
        // `capture="environment"` apre direttamente la camera posteriore su iOS/Android.
        // Se vogliamo permettere anche la galleria su iOS, l'attributo va omesso
        // (Safari forza camera quando `capture` è presente).
        {...(allowGallery ? {} : { capture: 'environment' })}
        required={required}
        onChange={handleChange}
        className="sr-only"
      />

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
          <label
            htmlFor={id}
            className={cn(
              // Tap target: aspect-ratio 4/3 grande, min-h 240px
              'flex min-h-[240px] cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-primary/40 bg-primary/5 p-6 text-center transition-colors hover:bg-primary/10',
            )}
          >
            <Camera
              className="h-12 w-12 text-primary"
              aria-hidden="true"
              strokeWidth={1.5}
            />
            <span className="text-base font-medium text-foreground">
              Tap per scattare
            </span>
            {allowGallery ? (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <ImagePlus className="h-3.5 w-3.5" aria-hidden="true" />
                oppure scegli dalla galleria
              </span>
            ) : null}
          </label>
        </div>
      )}
    </div>
  );
}
