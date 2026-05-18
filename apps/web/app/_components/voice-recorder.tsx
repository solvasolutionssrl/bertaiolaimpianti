'use client';

import * as React from 'react';
import { Mic, Square, AlertTriangle, X } from 'lucide-react';

import { Button } from '@impiantixplus/ui';

/**
 * Voice recorder condiviso (office desktop + mobile PWA voice-intake).
 *
 * UX (decision log):
 *  - Toggle "Inizia / Ferma" anziché click-and-hold: su iOS Safari il
 *    `pointercancel` durante una vibrazione o uno scroll involontario
 *    interrompe la registrazione → frustrante con mani sporche.
 *    Toggle è esplicito, tap singolo, niente race.
 *  - Bottone mic GIGANTE (h-32 w-32 in modalità `size="xl"`) con gradient
 *    cobalto→arancio + glow durante registrazione: feedback fortissimo a
 *    distanza, comodo con guanti.
 *  - Cronometro `font-mono` `text-5xl`: leggibile sotto il sole.
 *  - Waveform live opzionale (AudioContext + AnalyserNode): NIENTE
 *    persistenza, solo visualizzazione. Si disattiva automaticamente se
 *    `AudioContext` non è disponibile o se l'utente passa `showWaveform={false}`.
 *  - Auto-stop a `maxDurationSec` con messaggio inline.
 *  - Permessi negati / browser senza `MediaRecorder` → hint italiano.
 *  - **L'audio NON viene persistito**: il Blob viene passato al parent via
 *    `onRecorded`, viene trascritto, e il blob locale è dropped (vedi
 *    privacy choice in /api/voice/extract).
 *
 * Props:
 *  - onRecorded(blob, durationSec)
 *  - maxDurationSec (default 180)
 *  - disabled (durante upload/transcrizione del parent)
 *  - size: 'md' (default, office desktop) | 'xl' (mobile voice-intake)
 *  - showWaveform: bool — disegna 32 barre stile equalizer durante recording
 *  - onCancel?: callback per "Annulla" (mostra bottone se passato)
 */
export interface VoiceRecorderProps {
  onRecorded: (blob: Blob, durationSec: number) => void;
  maxDurationSec?: number;
  disabled?: boolean;
  size?: 'md' | 'xl';
  showWaveform?: boolean;
  onCancel?: () => void;
}

type State =
  | { kind: 'idle' }
  | { kind: 'requesting' }
  | { kind: 'recording'; startedAt: number; elapsedSec: number }
  | { kind: 'finalizing' }
  | { kind: 'error'; message: string };

const PICK_MIME_TYPES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
  'audio/ogg;codecs=opus',
  'audio/ogg',
];

function pickSupportedMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  for (const t of PICK_MIME_TYPES) {
    if (MediaRecorder.isTypeSupported(t)) return t;
  }
  return undefined;
}

function fmtClock(sec: number): string {
  const mm = Math.floor(sec / 60)
    .toString()
    .padStart(2, '0');
  const ss = Math.floor(sec % 60)
    .toString()
    .padStart(2, '0');
  return `${mm}:${ss}`;
}

export function VoiceRecorder({
  onRecorded,
  maxDurationSec = 180,
  disabled = false,
  size = 'md',
  showWaveform = false,
  onCancel,
}: VoiceRecorderProps) {
  const [state, setState] = React.useState<State>({ kind: 'idle' });
  const recorderRef = React.useRef<MediaRecorder | null>(null);
  const chunksRef = React.useRef<Blob[]>([]);
  const streamRef = React.useRef<MediaStream | null>(null);
  const tickRef = React.useRef<ReturnType<typeof setInterval> | null>(null);

  // Waveform
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const audioCtxRef = React.useRef<AudioContext | null>(null);
  const analyserRef = React.useRef<AnalyserNode | null>(null);
  const rafRef = React.useRef<number | null>(null);

  const supportsMediaRecorder =
    typeof window !== 'undefined' &&
    typeof window.MediaRecorder !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia;

  const isXl = size === 'xl';

  const cleanup = React.useCallback(() => {
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (audioCtxRef.current) {
      try {
        void audioCtxRef.current.close();
      } catch {
        /* noop */
      }
      audioCtxRef.current = null;
      analyserRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    recorderRef.current = null;
    chunksRef.current = [];
  }, []);

  React.useEffect(() => () => cleanup(), [cleanup]);

  const drawWaveform = React.useCallback(() => {
    const canvas = canvasRef.current;
    const analyser = analyserRef.current;
    if (!canvas || !analyser) return;
    const ctx2d = canvas.getContext('2d');
    if (!ctx2d) return;

    const bufLen = analyser.frequencyBinCount;
    const data = new Uint8Array(bufLen);

    const tick = () => {
      analyser.getByteFrequencyData(data);
      const w = canvas.width;
      const h = canvas.height;
      ctx2d.clearRect(0, 0, w, h);
      const bars = 32;
      const step = Math.floor(bufLen / bars);
      const barW = (w / bars) * 0.7;
      const gap = (w / bars) * 0.3;
      for (let i = 0; i < bars; i++) {
        let sum = 0;
        for (let j = 0; j < step; j++) sum += data[i * step + j] ?? 0;
        const avg = sum / step / 255; // 0..1
        const barH = Math.max(2, avg * h * 0.95);
        const x = i * (barW + gap);
        const y = (h - barH) / 2;
        // Gradient cobalto → arancio
        const grad = ctx2d.createLinearGradient(x, y, x, y + barH);
        grad.addColorStop(0, 'hsl(220, 80%, 55%)');
        grad.addColorStop(1, 'hsl(22, 92%, 54%)');
        ctx2d.fillStyle = grad;
        // Bordi arrotondati simulati con rect
        ctx2d.fillRect(x, y, barW, barH);
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  const startWaveform = React.useCallback(
    (stream: MediaStream) => {
      if (!showWaveform) return;
      if (typeof window === 'undefined') return;
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!AudioCtx) return;
      try {
        const ctx = new AudioCtx();
        const src = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        src.connect(analyser);
        audioCtxRef.current = ctx;
        analyserRef.current = analyser;
        drawWaveform();
      } catch {
        // Su iOS Safari < 14.5 può fallire: ignoriamo e proseguiamo senza wave.
      }
    },
    [drawWaveform, showWaveform],
  );

  const start = async () => {
    if (disabled) return;
    if (!supportsMediaRecorder) {
      setState({
        kind: 'error',
        message:
          'Il tuo browser non supporta la registrazione audio. Aggiorna o prova da Chrome / Safari recenti.',
      });
      return;
    }
    setState({ kind: 'requesting' });
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mime = pickSupportedMimeType();
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      recorderRef.current = rec;
      chunksRef.current = [];

      const startedAt = Date.now();

      rec.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) chunksRef.current.push(ev.data);
      };

      rec.onstop = () => {
        const duration = Math.max(
          0,
          Math.round((Date.now() - startedAt) / 1000),
        );
        const blobMime = rec.mimeType || mime || 'audio/webm';
        const blob = new Blob(chunksRef.current, { type: blobMime });
        cleanup();
        if (blob.size > 0) {
          onRecorded(blob, duration);
        }
        setState({ kind: 'idle' });
      };

      rec.start(250);
      setState({ kind: 'recording', startedAt, elapsedSec: 0 });
      startWaveform(stream);

      tickRef.current = setInterval(() => {
        setState((prev) => {
          if (prev.kind !== 'recording') return prev;
          const elapsed = Math.floor((Date.now() - prev.startedAt) / 1000);
          if (elapsed >= maxDurationSec) {
            try {
              recorderRef.current?.stop();
            } catch {
              /* noop */
            }
            return { ...prev, elapsedSec: maxDurationSec };
          }
          return { ...prev, elapsedSec: elapsed };
        });
      }, 250);
    } catch (err) {
      cleanup();
      const msg =
        err instanceof DOMException && err.name === 'NotAllowedError'
          ? 'Permesso microfono negato. Abilita il microfono dalle impostazioni del browser e riprova.'
          : err instanceof DOMException && err.name === 'NotFoundError'
            ? 'Nessun microfono trovato sul dispositivo.'
            : err instanceof Error
              ? err.message
              : 'Errore avvio registrazione.';
      setState({ kind: 'error', message: msg });
    }
  };

  const stop = () => {
    if (state.kind !== 'recording') return;
    setState({ kind: 'finalizing' });
    try {
      recorderRef.current?.stop();
    } catch {
      cleanup();
      setState({ kind: 'idle' });
    }
  };

  const cancel = () => {
    // Abort silenzioso: ferma tutto, NON chiama onRecorded.
    if (state.kind === 'recording') {
      try {
        // Sostituisci handler onstop per evitare la chiamata onRecorded
        if (recorderRef.current) {
          recorderRef.current.onstop = () => {
            cleanup();
            setState({ kind: 'idle' });
          };
          recorderRef.current.stop();
        } else {
          cleanup();
          setState({ kind: 'idle' });
        }
      } catch {
        cleanup();
        setState({ kind: 'idle' });
      }
    } else {
      cleanup();
      setState({ kind: 'idle' });
    }
    onCancel?.();
  };

  const reset = () => {
    cleanup();
    setState({ kind: 'idle' });
  };

  // ---------- Render ----------
  if (state.kind === 'error') {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-center">
        <AlertTriangle
          className="h-7 w-7 text-destructive"
          aria-hidden="true"
        />
        <p className="text-sm text-destructive">{state.message}</p>
        <Button type="button" variant="outline" size="sm" onClick={reset}>
          Riprova
        </Button>
      </div>
    );
  }

  const isRecording = state.kind === 'recording';
  const elapsed = isRecording ? state.elapsedSec : 0;
  const atLimit = elapsed >= maxDurationSec - 5;

  // Dimensione bottone e icone in base a `size`
  const btnSize = isXl ? 'h-32 w-32' : 'h-24 w-24';
  const micSize = isXl ? 'h-14 w-14' : 'h-10 w-10';
  const stopSize = isXl ? 'h-12 w-12' : 'h-9 w-9';
  const clockSize = isXl ? 'text-5xl' : 'text-2xl';

  return (
    <div className="flex flex-col items-center gap-5 py-4">
      {/* Bottone record principale con glow e gradient */}
      <div className="relative flex items-center justify-center">
        {isRecording ? (
          <>
            {/* Pulse rings arancio */}
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 -m-4 animate-ping rounded-full bg-accent/30"
            />
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 -m-2 animate-pulse rounded-full bg-accent/20"
            />
          </>
        ) : null}
        <button
          type="button"
          onClick={isRecording ? stop : start}
          disabled={
            disabled || state.kind === 'requesting' || state.kind === 'finalizing'
          }
          aria-pressed={isRecording}
          aria-label={isRecording ? 'Ferma registrazione' : 'Avvia registrazione'}
          className={[
            'group relative inline-flex items-center justify-center rounded-full',
            btnSize,
            'text-white shadow-glow-brand transition focus:outline-none focus:ring-4 focus:ring-accent/40 disabled:opacity-60',
            isRecording
              ? 'bg-[radial-gradient(circle_at_30%_30%,hsl(22_95%_60%),hsl(22_92%_45%))]'
              : 'bg-[radial-gradient(circle_at_30%_30%,hsl(220_80%_45%),hsl(220_80%_30%))] hover:scale-[1.04] active:scale-95',
          ].join(' ')}
          style={{ touchAction: 'manipulation' }}
        >
          {isRecording ? (
            <Square className={`${stopSize} fill-white`} aria-hidden="true" />
          ) : (
            <Mic className={micSize} aria-hidden="true" />
          )}
        </button>
      </div>

      {/* Waveform canvas (solo in registrazione + showWaveform) */}
      {showWaveform && isXl ? (
        <canvas
          ref={canvasRef}
          width={320}
          height={56}
          aria-hidden="true"
          className={[
            'h-14 w-full max-w-xs rounded-md transition-opacity',
            isRecording ? 'opacity-100' : 'opacity-0',
          ].join(' ')}
        />
      ) : null}

      {/* Cronometro + status */}
      <div className="flex flex-col items-center gap-1.5">
        {isRecording ? (
          <>
            <div className="flex items-center gap-3">
              <span
                className="inline-block h-3 w-3 animate-pulse rounded-full bg-accent"
                aria-hidden="true"
              />
              <span
                className={`font-mono ${clockSize} font-semibold tabular-nums text-foreground`}
              >
                {fmtClock(elapsed)}
              </span>
              <span className="text-xs text-muted-foreground">
                / {fmtClock(maxDurationSec)}
              </span>
            </div>
            <p
              className={
                atLimit
                  ? 'text-sm font-medium text-accent'
                  : 'text-sm text-muted-foreground'
              }
            >
              {atLimit
                ? 'Limite quasi raggiunto: ferma o si interromperà da solo.'
                : 'Parla con calma · tocca per fermare.'}
            </p>
          </>
        ) : state.kind === 'requesting' ? (
          <p className="text-sm text-muted-foreground">
            Attendo permesso microfono…
          </p>
        ) : state.kind === 'finalizing' ? (
          <p className="text-sm text-muted-foreground">Finalizzo l&apos;audio…</p>
        ) : (
          <>
            <p
              className={`${
                isXl ? 'text-base' : 'text-sm'
              } font-medium text-foreground`}
            >
              Tocca per iniziare
            </p>
            <p className="text-xs text-muted-foreground">
              Max {Math.round(maxDurationSec / 60)} min · l&apos;audio non viene
              salvato.
            </p>
          </>
        )}
      </div>

      {/* Bottone Annulla (solo se onCancel definito) */}
      {onCancel && isRecording ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={cancel}
          className="text-muted-foreground"
        >
          <X className="h-4 w-4" aria-hidden="true" />
          Annulla
        </Button>
      ) : null}
    </div>
  );
}
