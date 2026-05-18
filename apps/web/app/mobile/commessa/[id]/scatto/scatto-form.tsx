'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useFormStatus } from 'react-dom';
import {
  Clock,
  MapPin,
  Upload,
  Image as ImageIcon,
  Loader2,
  CheckCircle2,
  PencilLine,
} from 'lucide-react';

import { Button, Label } from '@impiantixplus/ui';

import { uploadFotoFromForm } from '../../../_actions/foto';
import { PhotoCaptureInput } from '../../../_components/photo-capture-input';
import { PhotoAnnotationEditor } from '../../../../_components/photo-annotation-loader';
import type { Shape } from '../../../../_lib/annotation-shapes';

export interface VoceOption {
  id: number;
  nome: string;
}

export interface ScattoFormProps {
  commessaId: string;
  voci: VoceOption[];
  preselectedVoceId: number | null;
  ultimeOggi: Array<{ id: string; filename: string; uploaded_at: string }>;
}

type Momento = 'sopralluogo' | 'in_corso' | 'finale';
const MOMENTI: Array<{ value: Momento; label: string }> = [
  { value: 'sopralluogo', label: 'Sopralluogo' },
  { value: 'in_corso', label: 'In corso' },
  { value: 'finale', label: 'Fine' },
];

interface Geo {
  lat: number;
  lng: number;
  accuracy: number;
}

export function ScattoForm({
  commessaId,
  voci,
  preselectedVoceId,
  ultimeOggi,
}: ScattoFormProps) {
  const router = useRouter();
  const formRef = React.useRef<HTMLFormElement>(null);
  const [file, setFile] = React.useState<File | null>(null);
  const [geo, setGeo] = React.useState<Geo | null>(null);
  const [geoError, setGeoError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState(false);
  const [serverError, setServerError] = React.useState<string | null>(null);
  const [now, setNow] = React.useState<Date>(() => new Date());

  // Annotazione pre-upload
  const [annotating, setAnnotating] = React.useState(false);
  const [annotation, setAnnotation] = React.useState<{
    layer: Shape[];
    width: number;
    height: number;
  } | null>(null);
  const [photoBlobUrl, setPhotoBlobUrl] = React.useState<string | null>(null);

  // Costruisce/revoca blob URL ogni volta che cambia il file. Tenuto in
  // state separato perché `PhotoCaptureInput` ne crea uno proprio per la
  // preview, ma a noi serve passarlo all'editor.
  React.useEffect(() => {
    if (!file) {
      if (photoBlobUrl) URL.revokeObjectURL(photoBlobUrl);
      setPhotoBlobUrl(null);
      setAnnotation(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPhotoBlobUrl(url);
    return () => URL.revokeObjectURL(url);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file]);

  // Aggiorna timestamp ogni 30s
  React.useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  // Geolocation API: prova al mount, non bloccante
  React.useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setGeoError('Geolocalizzazione non disponibile sul dispositivo.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeo({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        });
        setGeoError(null);
      },
      (err) => {
        setGeoError(`Geo non disponibile: ${err.message}`);
      },
      { enableHighAccuracy: true, maximumAge: 60_000, timeout: 10_000 },
    );
  }, []);

  const action = async (formData: FormData) => {
    setServerError(null);
    try {
      // Forziamo geo da state (più affidabile dei valori in hidden input
      // quando l'utente nega + poi concede mid-form)
      if (geo) {
        formData.set('geo_lat', String(geo.lat));
        formData.set('geo_lng', String(geo.lng));
      }
      // Annotazione pre-upload (opzionale)
      if (annotation && annotation.layer.length > 0) {
        formData.set('annotation_layer', JSON.stringify(annotation.layer));
        formData.set('annotation_width', String(annotation.width));
        formData.set('annotation_height', String(annotation.height));
      }
      await uploadFotoFromForm(formData);
      setSuccess(true);
      // Reset graceful + ricarica dati server
      formRef.current?.reset();
      setFile(null);
      router.refresh();
      // Nascondi banner dopo 2.5s
      setTimeout(() => setSuccess(false), 2500);
    } catch (e) {
      setServerError(e instanceof Error ? e.message : 'Upload fallito');
    }
  };

  return (
    <form ref={formRef} action={action} className="space-y-5">
      <input type="hidden" name="commessaId" value={commessaId} />

      {/* Capture */}
      <div>
        <Label htmlFor="photo-input" className="mb-2 block">
          Foto cantiere
        </Label>
        <PhotoCaptureInput
          name="file"
          id="photo-input"
          required
          allowGallery
          onFileChange={setFile}
        />
        {file && photoBlobUrl ? (
          <div className="mt-2">
            <Button
              type="button"
              variant="outline"
              size="lg"
              onClick={() => setAnnotating(true)}
              className="min-h-[48px] w-full"
            >
              <PencilLine className="h-4 w-4" aria-hidden="true" />
              {annotation && annotation.layer.length > 0
                ? `Annotazioni: ${annotation.layer.length} elementi · modifica`
                : 'Annota prima di caricare'}
            </Button>
          </div>
        ) : null}
      </div>

      {/* Fase / voce */}
      <div className="space-y-2">
        <Label htmlFor="faseVoceId">Fase</Label>
        <select
          id="faseVoceId"
          name="faseVoceId"
          defaultValue={preselectedVoceId ?? ''}
          className="block h-12 w-full rounded-md border border-input bg-background px-3 text-base"
        >
          <option value="">— Seleziona fase —</option>
          {voci.map((v) => (
            <option key={v.id} value={v.id}>
              {v.nome}
            </option>
          ))}
        </select>
        {voci.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Questa commessa non ha fasi attive: la foto verrà caricata come
            "generica".
          </p>
        ) : null}
      </div>

      {/* Momento */}
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Momento</legend>
        <div className="grid grid-cols-3 gap-2" role="radiogroup">
          {MOMENTI.map((m, idx) => (
            <label
              key={m.value}
              className="flex min-h-[48px] cursor-pointer items-center justify-center gap-1 rounded-md border border-input bg-background px-2 text-sm font-medium has-[:checked]:border-primary has-[:checked]:bg-primary/10 has-[:checked]:text-primary"
            >
              <input
                type="radio"
                name="momento"
                value={m.value}
                defaultChecked={idx === 1} // "In corso" default
                className="sr-only"
              />
              {m.label}
            </label>
          ))}
        </div>
      </fieldset>

      {/* Geo + timestamp */}
      <div className="space-y-2 rounded-md border border-border bg-muted/30 p-3 text-xs">
        <div className="flex items-center gap-2">
          <MapPin className="h-4 w-4 text-primary" aria-hidden="true" />
          {geo ? (
            <span>
              Geo: <span className="font-mono">{geo.lat.toFixed(5)}, {geo.lng.toFixed(5)}</span>{' '}
              <span className="text-muted-foreground">(±{Math.round(geo.accuracy)} m)</span>
            </span>
          ) : geoError ? (
            <span className="text-muted-foreground">{geoError}</span>
          ) : (
            <span className="text-muted-foreground">Acquisizione GPS…</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-primary" aria-hidden="true" />
          <span>
            Allegato:{' '}
            <span className="font-mono">
              {now.toLocaleString('it-IT', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          </span>
        </div>
        {geo ? (
          <>
            <input type="hidden" name="geo_lat" value={geo.lat} />
            <input type="hidden" name="geo_lng" value={geo.lng} />
          </>
        ) : null}
      </div>

      {/* Nota */}
      <div className="space-y-2">
        <Label htmlFor="nota">Nota (opzionale)</Label>
        <textarea
          id="nota"
          name="nota"
          rows={3}
          placeholder="Es. tubazioni passaggio…"
          className="block w-full rounded-md border border-input bg-background px-3 py-2 text-base"
        />
      </div>

      {success ? (
        <p
          role="status"
          className="flex items-center gap-2 rounded-md border border-stato-aperta/40 bg-stato-aperta/10 px-3 py-2 text-sm text-stato-aperta"
        >
          <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
          Foto caricata.
        </p>
      ) : null}

      {serverError ? (
        <p
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {serverError}
        </p>
      ) : null}

      <SubmitButton disabled={!file} />

      {/* Editor annotazione pre-upload */}
      {annotating && photoBlobUrl ? (
        <PhotoAnnotationEditor
          fileRefId="local-pre-upload"
          imageUrl={photoBlobUrl}
          title={file?.name ?? 'Foto'}
          initialLayer={annotation?.layer ?? []}
          width={annotation?.width}
          height={annotation?.height}
          onSave={async (layer, width, height) => {
            setAnnotation({ layer, width, height });
            setAnnotating(false);
          }}
          onClose={() => setAnnotating(false)}
        />
      ) : null}

      {/* Ultime foto di oggi */}
      <section className="pt-4">
        <h2 className="text-sm font-semibold text-muted-foreground">
          Ultime caricate (oggi)
        </h2>
        {ultimeOggi.length === 0 ? (
          <p className="mt-2 text-xs text-muted-foreground">
            Ancora nessuna foto caricata oggi su questa commessa.
          </p>
        ) : (
          <div className="mt-2 grid grid-cols-4 gap-2">
            {ultimeOggi.map((f) => (
              <div
                key={f.id}
                className="flex aspect-square items-center justify-center overflow-hidden rounded border bg-muted"
                title={f.filename}
              >
                <ImageIcon className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
              </div>
            ))}
          </div>
        )}
      </section>
    </form>
  );
}

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <div className="space-y-2">
      <Button
        type="submit"
        size="lg"
        disabled={disabled || pending}
        className="min-h-[52px] w-full text-base"
      >
        {pending ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Caricamento foto…
          </>
        ) : (
          <>
            <Upload className="h-4 w-4" aria-hidden="true" />
            Carica foto →
          </>
        )}
      </Button>
      {pending ? (
        <p className="text-center text-xs text-muted-foreground">
          Anche se chiudi l'app, l'upload continua.
        </p>
      ) : null}
    </div>
  );
}
