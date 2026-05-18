'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Mic, Loader2, CheckCircle2 } from 'lucide-react';

import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@impiantixplus/ui';

import { VoiceRecorder } from '../../../../../_components/voice-recorder';
import { salvaNotaVocale } from '../../../../../_actions/voice-note';

interface VoiceNoteCaptureProps {
  commessaId: string;
}

/**
 * Bottone "Aggiungi nota vocale" sopra la lista note della commessa.
 *
 * Flusso:
 *  1. apri dialog
 *  2. registra
 *  3. POST /api/voice/extract?mode=transcript-only → ottieni transcript
 *  4. mostra transcript editable per review veloce
 *  5. salva tramite server action `salvaNotaVocale` → audit_events
 */
export function VoiceNoteCapture({ commessaId }: VoiceNoteCaptureProps) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState<
    'idle' | 'transcribing' | 'saving'
  >('idle');
  const [error, setError] = React.useState<string | null>(null);
  const [transcript, setTranscript] = React.useState<string>('');
  const [duration, setDuration] = React.useState<number>(0);
  const [preview, setPreview] = React.useState<boolean>(false);
  const [previewReason, setPreviewReason] = React.useState<string | null>(null);
  const [savedAt, setSavedAt] = React.useState<number | null>(null);

  const reset = () => {
    setPending('idle');
    setError(null);
    setTranscript('');
    setDuration(0);
    setPreview(false);
    setPreviewReason(null);
  };

  const close = () => {
    setOpen(false);
    setSavedAt(null);
    // delay reset così la chiusura è fluida
    setTimeout(reset, 200);
  };

  const handleRecorded = async (blob: Blob, durSec: number) => {
    setError(null);
    setDuration(durSec);
    setPending('transcribing');
    try {
      const fd = new FormData();
      fd.append('audio', blob, 'voicenote.webm');
      fd.append('mode', 'transcript-only');
      const res = await fetch('/api/voice/extract', {
        method: 'POST',
        body: fd,
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(
          (j as { error?: string }).error ??
            `Trascrizione fallita (HTTP ${res.status})`,
        );
      }
      const data = (await res.json()) as {
        transcript: string;
        _preview?: boolean;
        _previewReason?: string;
      };
      setTranscript(data.transcript);
      setPreview(Boolean(data._preview));
      setPreviewReason(data._previewReason ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Errore trascrizione');
    } finally {
      setPending('idle');
    }
  };

  const handleSave = async () => {
    if (!transcript.trim()) {
      setError('Transcript vuoto.');
      return;
    }
    setPending('saving');
    setError(null);
    try {
      const res = await salvaNotaVocale({
        commessaId,
        transcript: transcript.trim(),
        durationSec: duration,
        preview,
      });
      if (!res.ok) {
        setError(res.error);
        setPending('idle');
        return;
      }
      setSavedAt(Date.now());
      setPending('idle');
      router.refresh();
      // chiudi dopo breve feedback
      setTimeout(() => close(), 1000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Salvataggio fallito');
      setPending('idle');
    }
  };

  const hasTranscript = transcript.trim().length > 0;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-accent/30 bg-accent-soft/30 px-4 py-3">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-white">
            <Mic className="h-4 w-4" aria-hidden="true" />
          </span>
          <div>
            <p className="text-sm font-semibold">Aggiungi nota vocale</p>
            <p className="text-xs text-muted-foreground">
              Parla la nota: la trascriviamo e la salviamo nella commessa.
            </p>
          </div>
        </div>
        <Button
          type="button"
          variant="default"
          className="border-2 border-accent bg-accent text-white hover:bg-accent/90"
          onClick={() => setOpen(true)}
        >
          <Mic className="h-4 w-4" aria-hidden="true" />
          Nota vocale
        </Button>
      </div>

      <Dialog
        open={open}
        onOpenChange={(o) => {
          if (!o) close();
          else setOpen(true);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mic className="h-5 w-5 text-accent" aria-hidden="true" />
              Nuova nota vocale
            </DialogTitle>
            <DialogDescription>
              Registra una nota parlata. Trascriveremo il contenuto e lo salveremo nella sezione Note di questa commessa.
            </DialogDescription>
          </DialogHeader>

          {savedAt ? (
            <div className="flex flex-col items-center gap-3 py-6">
              <CheckCircle2
                className="h-10 w-10 text-stato-aperta"
                aria-hidden="true"
              />
              <p className="text-sm font-medium">Nota salvata.</p>
            </div>
          ) : !hasTranscript ? (
            <div className="space-y-3">
              <VoiceRecorder
                onRecorded={handleRecorded}
                disabled={pending !== 'idle'}
                maxDurationSec={180}
              />
              {pending === 'transcribing' ? (
                <div className="flex items-center justify-center gap-2 rounded-md border border-border bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  Trascrivo l&apos;audio…
                </div>
              ) : null}
              {error ? (
                <p
                  role="alert"
                  className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                >
                  {error}
                </p>
              ) : null}
            </div>
          ) : (
            <div className="space-y-3">
              {preview ? (
                <div className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning-foreground">
                  <strong>Modalità preview.</strong>{' '}
                  {previewReason ?? 'OPENAI_API_KEY non configurata.'}
                </div>
              ) : null}
              <div>
                <label
                  htmlFor="vn-transcript"
                  className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                >
                  Transcript (modificabile)
                </label>
                <textarea
                  id="vn-transcript"
                  rows={6}
                  value={transcript}
                  onChange={(e) => setTranscript(e.target.value)}
                  className="block w-full rounded-md border border-input bg-card p-3 text-sm shadow-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                />
                <p className="mt-1 text-[10px] text-muted-foreground">
                  Durata audio: {Math.round(duration)}s · L&apos;audio non viene salvato, solo il testo.
                </p>
              </div>
              {error ? (
                <p
                  role="alert"
                  className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                >
                  {error}
                </p>
              ) : null}
            </div>
          )}

          <DialogFooter className="mt-2 gap-2">
            <Button type="button" variant="ghost" onClick={close}>
              Annulla
            </Button>
            {hasTranscript && !savedAt ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  onClick={reset}
                  disabled={pending === 'saving'}
                >
                  Rifai
                </Button>
                <Button
                  type="button"
                  onClick={handleSave}
                  disabled={pending === 'saving'}
                >
                  {pending === 'saving' ? (
                    <Loader2
                      className="h-4 w-4 animate-spin"
                      aria-hidden="true"
                    />
                  ) : null}
                  Salva nota
                </Button>
              </>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
