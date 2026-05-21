'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  Clock,
  MapPin,
  Upload,
  Image as ImageIcon,
  Loader2,
  CheckCircle2,
  PencilLine,
  X as XIcon,
} from 'lucide-react';

import { Button, Label } from '@impiantixplus/ui';

import { PhotoCaptureInput } from '../../../_components/photo-capture-input';
import { PhotoAnnotationEditor } from '../../../../_components/photo-annotation-loader';
import type { Shape } from '../../../../_lib/annotation-shapes';
import { useChunkedUpload } from '../../../../_lib/use-chunked-upload';
import { salvaAnnotazione } from '../../../../_actions/annotations';

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

  const { state: uploadState, upload, cancel } = useChunkedUpload();
  const busy =
    uploadState.phase === 'init' ||
    uploadState.phase === 'uploading' ||
    uploadState.phase === 'finalizing';

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

  React.useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

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

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setServerError(null);
    if (!file) {
      setServerError('Foto mancante');
      return;
    }

    const form = formRef.current;
    if (!form) return;
    const data = new FormData(form);
    const faseVoceIdRaw = data.get('faseVoceId');
    const voceId =
      faseVoceIdRaw && faseVoceIdRaw !== '' ? Number(faseVoceIdRaw) : null;
    const momento = (String(data.get('momento') ?? 'in_corso') as Momento);

    try {
      const result = await upload({
        file,
        commessaId,
        momento,
        voceId,
        geoLat: geo?.lat ?? null,
        geoLng: geo?.lng ?? null,
      });

      // Annotazione pre-upload (best-effort, non blocca il successo)
      if (annotation && annotation.layer.length > 0) {
        const annRes = await salvaAnnotazione({
          fileRefId: result.fileRefId,
          layer: annotation.layer,
          width: annotation.width,
          height: annotation.height,
        });
        if (!annRes.ok) {
          // Log silenzioso: la foto è caricata, l'annotazione si potrà
          // ri-creare dall'ufficio.
          console.warn('[scatto] annotazione fallita:', annRes.error);
        }
      }

      setSuccess(true);
      form.reset();
      setFile(null);
      setAnnotation(null);
      router.refresh();
      setTimeout(() => setSuccess(false), 2500);
    } catch (e) {
      setServerError(e instanceof Error ? e.message : 'Upload fallito');
    }
  };

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-5">
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
              disabled={busy}
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
          disabled={busy}
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
      <fieldset className="space-y-2" disabled={busy}>
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
                defaultChecked={idx === 1}
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
          disabled={busy}
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

      <UploadButton
        disabled={!file}
        busy={busy}
        phase={uploadState.phase}
        progressPct={uploadState.progressPct}
        onCancel={cancel}
      />

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

function UploadButton({
  disabled,
  busy,
  phase,
  progressPct,
  onCancel,
}: {
  disabled: boolean;
  busy: boolean;
  phase: string;
  progressPct: number;
  onCancel: () => void;
}) {
  return (
    <div className="space-y-2">
      <Button
        type="submit"
        size="lg"
        disabled={disabled || busy}
        className="min-h-[52px] w-full text-base"
      >
        {busy ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            {phase === 'init'
              ? 'Inizializzo…'
              : phase === 'finalizing'
                ? 'Finalizzo…'
                : `Carico ${progressPct}%`}
          </>
        ) : (
          <>
            <Upload className="h-4 w-4" aria-hidden="true" />
            Carica foto →
          </>
        )}
      </Button>
      {busy ? (
        <div className="space-y-2">
          <div
            className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuenow={progressPct}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="h-full bg-primary transition-[width] duration-200"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="flex w-full items-center justify-center gap-1 text-xs text-muted-foreground hover:text-destructive"
          >
            <XIcon className="h-3 w-3" aria-hidden="true" />
            Annulla upload
          </button>
        </div>
      ) : null}
    </div>
  );
}
