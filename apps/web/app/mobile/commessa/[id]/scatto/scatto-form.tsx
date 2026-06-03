'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  Camera,
  Clock,
  MapPin,
  Upload,
  CheckCircle2,
  PencilLine,
} from 'lucide-react';

import { Button, Label } from '@kommessa/ui';

import { PhotoCaptureInput } from '../../../_components/photo-capture-input';
import { PhotoAnnotationEditor } from '../../../../_components/photo-annotation-loader';
import type { Shape } from '../../../../_lib/annotation-shapes';
import { useUploadQueue } from '../../../../_components/upload-queue-provider';
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
  const [takenAt, setTakenAt] = React.useState<Date | null>(null);
  const [geo, setGeo] = React.useState<Geo | null>(null);
  const [geoError, setGeoError] = React.useState<string | null>(null);
  // Counter foto scattate in questa sessione (multi-scatto sopralluogo).
  const [sessionCount, setSessionCount] = React.useState(0);
  // Banner "appena enqueuata" — dura ~3s o finché l'utente scatta la prossima.
  const [justEnqueued, setJustEnqueued] = React.useState(false);
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

  const queue = useUploadQueue();
  // Mappa { jobId → annotation pending } per salvare l'annotazione quando il
  // job arriva a 'done'. Il job può durare diversi secondi → il salvataggio
  // dell'annotazione viaggia in background mentre l'utente scatta la prossima.
  const pendingAnnotationsRef = React.useRef<
    Map<string, { layer: Shape[]; width: number; height: number }>
  >(new Map());
  const handledJobsRef = React.useRef<Set<string>>(new Set());

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

  // Quando un job in coda diventa 'done': salva l'annotazione pendente
  // (se c'era) + ricarica il server data (router.refresh per la lista
  // "Ultime caricate (oggi)"). Idempotente via handledJobsRef.
  React.useEffect(() => {
    let triggeredRefresh = false;
    for (const job of queue.jobs) {
      if (job.status !== 'done' || handledJobsRef.current.has(job.id)) continue;
      handledJobsRef.current.add(job.id);
      const ann = pendingAnnotationsRef.current.get(job.id);
      if (ann && ann.layer.length > 0 && job.fileRefId) {
        pendingAnnotationsRef.current.delete(job.id);
        void salvaAnnotazione({
          fileRefId: job.fileRefId,
          layer: ann.layer,
          width: ann.width,
          height: ann.height,
        }).catch((err) => {
          // Log silenzioso: la foto è caricata, l'annotazione si può rifare
          // dall'ufficio. Non spaventiamo il tecnico in cantiere.
          // eslint-disable-next-line no-console
          console.warn('[scatto] salvataggio annotazione fallito:', err);
        });
      }
      triggeredRefresh = true;
    }
    if (triggeredRefresh) router.refresh();
  }, [queue.jobs, router]);

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

  // Modalità sopralluogo: NON aspettiamo il completamento dell'upload.
  // La queue (Ondata 2) gestisce il caricamento in background → il tecnico
  // può subito scattare la prossima foto. La pagina mostra il counter delle
  // foto scattate nella sessione + un banner di conferma temporaneo.
  // L'annotazione viene salvata in background quando il job arriva a 'done'.
  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
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
    const momento = String(data.get('momento') ?? 'in_corso') as Momento;

    const jobId = queue.enqueue({
      fileBlob: file,
      fileName: file.name,
      fileMime: file.type || 'image/jpeg',
      fileSize: file.size,
      commessaId,
      momento,
      voceId,
      geoLat: geo?.lat ?? null,
      geoLng: geo?.lng ?? null,
      takenAtIso: takenAt ? takenAt.toISOString() : null,
    });

    // Memorizza l'annotazione pendente per questo job: verrà committata
    // al server quando il job arriva a 'done' (vedi useEffect sopra).
    if (annotation && annotation.layer.length > 0) {
      pendingAnnotationsRef.current.set(jobId, annotation);
    }

    setSessionCount((n) => n + 1);
    setJustEnqueued(true);
    setFile(null);
    setAnnotation(null);
    // Manteniamo fase/momento/nota per il prossimo scatto consecutivo.
    // Il banner "appena enqueuata" sparisce dopo 3 secondi.
    setTimeout(() => setJustEnqueued(false), 3000);
  };

  /** Apre subito la fotocamera per il prossimo scatto. */
  const triggerNextCapture = () => {
    setJustEnqueued(false);
    // Microtask per assicurare che il reset del file abbia finito.
    setTimeout(() => {
      document.getElementById('photo-input')?.click();
    }, 0);
  };

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-5">
      {/* Banner "modalità sopralluogo": appare dopo la prima foto della
          sessione. Conferma e CTA prominente per la prossima. */}
      {sessionCount > 0 && !file ? (
        <div
          className={`rounded-xl border p-3 transition-colors ${
            justEnqueued
              ? 'border-emerald-500/40 bg-emerald-50 dark:bg-emerald-950/20'
              : 'border-primary/30 bg-primary/[0.04]'
          }`}
        >
          <div className="flex items-start gap-2.5">
            <span
              className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                justEnqueued
                  ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                  : 'bg-primary/15 text-primary'
              }`}
              aria-hidden="true"
            >
              <CheckCircle2 className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">
                {justEnqueued ? 'Foto in coda' : 'Sessione attiva'}
                {' · '}
                <span className="font-mono tabular-nums">{sessionCount}</span>{' '}
                {sessionCount === 1 ? 'foto' : 'foto'}
              </p>
              <p className="text-xs text-muted-foreground">
                Fase/momento sono già impostati. Tap qui sotto per scattare la
                prossima.
              </p>
            </div>
          </div>
          <Button
            type="button"
            size="lg"
            onClick={triggerNextCapture}
            className="mt-3 min-h-[52px] w-full text-base"
          >
            <Camera className="h-5 w-5" aria-hidden="true" />
            Scatta un'altra foto
          </Button>
        </div>
      ) : null}

      {/* Capture */}
      <div>
        <Label htmlFor="photo-input" className="mb-2 block">
          {sessionCount > 0 ? 'Prossima foto' : 'Foto cantiere'}
        </Label>
        <PhotoCaptureInput
          name="file"
          id="photo-input"
          required
          allowGallery
          onFileChange={setFile}
          onTakenAtChange={setTakenAt}
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
                timeZone: 'Europe/Rome',
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
        />
      </div>

      {serverError ? (
        <p
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {serverError}
        </p>
      ) : null}

      <Button
        type="submit"
        size="lg"
        disabled={!file}
        className="min-h-[52px] w-full text-base"
      >
        <Upload className="h-4 w-4" aria-hidden="true" />
        {sessionCount > 0 ? 'Carica e continua →' : 'Carica foto →'}
      </Button>
      <p className="text-center text-[11px] text-muted-foreground">
        L&apos;upload va in background. Vedi lo stato nel pannello in basso.
      </p>

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
    </form>
  );
}
