'use client';

import * as React from 'react';
import { MapPin, Clock, Upload, CheckCircle2, Loader2 } from 'lucide-react';

import { Button, Label } from '@kommessa/ui';

import {
  MediaAttachSection,
  type MediaFile,
} from '../../../../office/commesse/nuova/_components/media-attach-section';
import { preparaMedia } from '../../../../_lib/prepara-media';
import { PdfCameraCapture } from '../../../../_components/pdf-camera-capture';
import { useUploadQueue } from '../../../../_components/upload-queue-provider';

export interface VoceOption {
  id: number;
  nome: string;
}

export interface ScattoFormProps {
  commessaId: string;
  voci: VoceOption[];
  preselectedVoceId: number | null;
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

function kindToAllegato(k: MediaFile['kind']): 'foto' | 'video' | 'pdf_acquisito' {
  if (k === 'video') return 'video';
  if (k === 'pdf') return 'pdf_acquisito';
  return 'foto';
}

/**
 * Scatto/allegato media di cantiere. Uploader ricco (scatta foto, allega
 * foto/video multipli, allega file PDF, scansiona PDF da fotocamera) con
 * fase/momento/geo applicati all'intero gruppo. L'upload va in background
 * nella UploadQueue globale → il tecnico può continuare ad aggiungere.
 */
export function ScattoForm({ commessaId, voci, preselectedVoceId }: ScattoFormProps) {
  const queue = useUploadQueue();

  const [files, setFiles] = React.useState<MediaFile[]>([]);
  const [voceId, setVoceId] = React.useState<string>(
    preselectedVoceId != null ? String(preselectedVoceId) : '',
  );
  const [momento, setMomento] = React.useState<Momento>('in_corso');
  const [geo, setGeo] = React.useState<Geo | null>(null);
  const [geoError, setGeoError] = React.useState<string | null>(null);
  const [now, setNow] = React.useState<Date>(() => new Date());
  const [scannerOpen, setScannerOpen] = React.useState(false);
  const [enqueuedCount, setEnqueuedCount] = React.useState(0);
  const [justEnqueued, setJustEnqueued] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  // Orologio (timestamp mostrato all'utente).
  React.useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  // Geo-tag: acquisito una volta all'apertura, applicato a tutto il gruppo.
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
      (err) => setGeoError(`Geo non disponibile: ${err.message}`),
      { enableHighAccuracy: true, maximumAge: 60_000, timeout: 10_000 },
    );
  }, []);

  const handleCarica = async () => {
    if (files.length === 0 || busy) return;
    setBusy(true);
    const daCaricare = files;
    const voceIdNum = voceId !== '' ? Number(voceId) : null;
    for (const f of daCaricare) {
      // Piena qualità: si carica il file come arriva dal telefono (solo le foto
      // enormi vengono ridotte — vedi `preparaMedia`). La coda globale carica
      // poi in background.
      const blob = await preparaMedia(f.file, f.kind);
      queue.enqueue({
        fileBlob: blob,
        fileName: blob.name || f.file.name,
        fileMime: blob.type || f.file.type || 'application/octet-stream',
        fileSize: blob.size,
        commessaId,
        momento,
        voceId: voceIdNum,
        kind: kindToAllegato(f.kind),
        geoLat: geo?.lat ?? null,
        geoLng: geo?.lng ?? null,
        takenAtIso: f.takenAt ? f.takenAt.toISOString() : null,
      });
    }
    // Libera le preview e svuota la selezione (il progresso è nel pannello in basso).
    daCaricare.forEach((f) => {
      if (f.previewUrl) URL.revokeObjectURL(f.previewUrl);
    });
    setEnqueuedCount((n) => n + daCaricare.length);
    setFiles([]);
    setJustEnqueued(true);
    setBusy(false);
    setTimeout(() => setJustEnqueued(false), 3500);
  };

  return (
    <div className="space-y-5">
      {/* Conferma "in coda": appare dopo il primo caricamento della sessione. */}
      {enqueuedCount > 0 ? (
        <div
          className={`flex items-start gap-2.5 rounded-xl border p-3 transition-colors ${
            justEnqueued
              ? 'border-emerald-500/40 bg-emerald-50 dark:bg-emerald-950/20'
              : 'border-primary/20 bg-primary/[0.04]'
          }`}
        >
          <span
            className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
            aria-hidden="true"
          >
            <CheckCircle2 className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold">{enqueuedCount} file in caricamento</p>
            <p className="text-xs text-muted-foreground">
              Va in background: puoi continuare ad aggiungere. Lo stato è nel pannello in basso.
            </p>
          </div>
        </div>
      ) : null}

      {/* Uploader ricco: Scatta foto · Foto e video · Allega file · Scansiona PDF */}
      <MediaAttachSection
        files={files}
        onChange={setFiles}
        onScanPdf={() => setScannerOpen(true)}
        title="Foto, video e documenti"
        description="Scatta, allega dalla galleria o scansiona un documento. Puoi aggiungerne più di uno."
      />

      {/* Fase / voce */}
      <div className="space-y-2">
        <Label htmlFor="faseVoceId">Fase</Label>
        <select
          id="faseVoceId"
          value={voceId}
          onChange={(e) => setVoceId(e.target.value)}
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
            Questa commessa non ha fasi attive: gli allegati verranno caricati come "generici".
          </p>
        ) : null}
      </div>

      {/* Momento */}
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Momento</legend>
        <div className="grid grid-cols-3 gap-2" role="radiogroup">
          {MOMENTI.map((m) => (
            <label
              key={m.value}
              className="flex min-h-[48px] cursor-pointer items-center justify-center gap-1 rounded-md border border-input bg-background px-2 text-sm font-medium has-[:checked]:border-primary has-[:checked]:bg-primary/10 has-[:checked]:text-primary"
            >
              <input
                type="radio"
                name="momento"
                value={m.value}
                checked={momento === m.value}
                onChange={() => setMomento(m.value)}
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
              Geo:{' '}
              <span className="font-mono">
                {geo.lat.toFixed(5)}, {geo.lng.toFixed(5)}
              </span>{' '}
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

      {/* Carica */}
      <Button
        type="button"
        size="lg"
        onClick={handleCarica}
        disabled={files.length === 0 || busy}
        className="min-h-[52px] w-full text-base"
      >
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <Upload className="h-4 w-4" aria-hidden="true" />
        )}
        {files.length > 0 ? `Carica ${files.length} file` : 'Carica'}
      </Button>
      <p className="text-center text-[11px] text-muted-foreground">
        L&apos;upload va in background. Vedi lo stato nel pannello in basso.
      </p>

      {/* Scanner PDF a tutto schermo */}
      {scannerOpen ? (
        <PdfCameraCapture
          onCancel={() => setScannerOpen(false)}
          onReady={(blob, filename) => {
            const file = new File([blob], filename, { type: 'application/pdf' });
            setFiles((prev) => [
              ...prev,
              {
                id: crypto.randomUUID(),
                file,
                kind: 'pdf',
                previewUrl: '',
                sizeMB: file.size / (1024 * 1024),
                takenAt: null,
              },
            ]);
            setScannerOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}
