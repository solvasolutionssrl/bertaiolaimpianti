'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Camera, Loader2, QrCode, ArrowRight } from 'lucide-react';
import { Button } from '@kommessa/ui';

/**
 * Scanner QR "a prova di cantiere".
 *
 * Riusa interamente il flusso esistente di timbratura per-token: il QR
 * affisso codifica l'URL `{origin}/t/{token}` (vedi `qrUrl`). Qui decodifichiamo
 * il QR via `BarcodeDetector` nativo, estraiamo il token e navighiamo a
 * `/t/[token]` — la pagina di timbratura reale (self + capo squadra) NON viene
 * reinventata.
 *
 * Fallback: se `BarcodeDetector` non è disponibile (es. iOS Safari) mostriamo
 * un campo per incollare/digitare il link o il codice del QR.
 */

// ─── BarcodeDetector typing minimale (non in lib.dom standard) ──────────────
type DetectedBarcode = { rawValue: string };
type BarcodeDetectorLike = {
  detect: (source: CanvasImageSource) => Promise<DetectedBarcode[]>;
};
type BarcodeDetectorCtor = new (opts?: { formats?: string[] }) => BarcodeDetectorLike;

function getBarcodeDetectorCtor(): BarcodeDetectorCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { BarcodeDetector?: BarcodeDetectorCtor };
  return w.BarcodeDetector ?? null;
}

// ─── estrazione token da un valore scansionato ──────────────────────────────
// Accetta sia l'URL completo `https://.../t/<token>` sia il solo token.
function estraiToken(raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;
  const m = v.match(/\/t\/([A-Za-z0-9_-]+)/);
  if (m && m[1]) return m[1];
  // Solo token "nudo": alfanumerico ragionevole, niente spazi/slash.
  if (/^[A-Za-z0-9_-]{8,}$/.test(v)) return v;
  return null;
}

export function ScansionaClient() {
  const router = useRouter();
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const rafRef = React.useRef<number | null>(null);
  const lockedRef = React.useRef(false);

  const [supportata] = React.useState<boolean>(() => getBarcodeDetectorCtor() !== null);
  const [stato, setStato] = React.useState<'idle' | 'attiva' | 'errore' | 'trovato'>('idle');
  const [errore, setErrore] = React.useState<string | null>(null);
  const [manuale, setManuale] = React.useState('');
  const [manualeErr, setManualeErr] = React.useState<string | null>(null);

  const vaiAToken = React.useCallback(
    (token: string) => {
      lockedRef.current = true;
      setStato('trovato');
      stopCamera();
      router.push(`/t/${token}`);
    },
    [router],
  );

  function stopCamera() {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    const s = streamRef.current;
    if (s) s.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  const avvia = React.useCallback(async () => {
    setErrore(null);
    const Ctor = getBarcodeDetectorCtor();
    if (!Ctor) {
      setErrore('Scanner non disponibile su questo dispositivo. Inserisci il codice manualmente.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      });
      streamRef.current = stream;
      const v = videoRef.current;
      if (v) {
        v.srcObject = stream;
        await v.play().catch(() => undefined);
      }
      setStato('attiva');
      lockedRef.current = false;

      const detector = new Ctor({ formats: ['qr_code'] });
      const tick = async () => {
        if (lockedRef.current) return;
        const vid = videoRef.current;
        if (vid && vid.readyState >= 2) {
          try {
            const codes = await detector.detect(vid);
            for (const c of codes) {
              const token = estraiToken(c.rawValue);
              if (token) {
                vaiAToken(token);
                return;
              }
            }
          } catch {
            // ignora frame non decodificabili
          }
        }
        rafRef.current = requestAnimationFrame(() => void tick());
      };
      rafRef.current = requestAnimationFrame(() => void tick());
    } catch (e) {
      setStato('errore');
      setErrore(
        e instanceof Error
          ? `Fotocamera non disponibile: ${e.message}`
          : 'Fotocamera non disponibile',
      );
    }
  }, [vaiAToken]);

  // cleanup all'unmount
  React.useEffect(() => () => stopCamera(), []);

  function inviaManuale(e: React.FormEvent) {
    e.preventDefault();
    setManualeErr(null);
    const token = estraiToken(manuale);
    if (!token) {
      setManualeErr('Codice o link non valido.');
      return;
    }
    vaiAToken(token);
  }

  return (
    <div className="space-y-5">
      {/* Area camera */}
      <div className="relative aspect-square w-full overflow-hidden rounded-2xl border border-border bg-black">
        <video
          ref={videoRef}
          playsInline
          muted
          className="h-full w-full object-cover"
        />
        {stato !== 'attiva' && stato !== 'trovato' ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/60 p-6 text-center text-white">
            <QrCode className="h-10 w-10 opacity-80" aria-hidden="true" />
            <p className="text-sm opacity-90">
              {supportata
                ? 'Tocca per attivare la fotocamera e inquadrare il QR.'
                : 'Lo scanner automatico non è disponibile qui. Usa il codice manuale qui sotto.'}
            </p>
          </div>
        ) : null}
        {stato === 'trovato' ? (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-white">
            <Loader2 className="h-8 w-8 animate-spin" aria-hidden="true" />
          </div>
        ) : null}
        {/* mirino */}
        {stato === 'attiva' ? (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-[18%] rounded-xl border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.25)]"
          />
        ) : null}
      </div>

      {supportata && stato !== 'attiva' ? (
        <Button className="w-full py-3 text-base" size="lg" onClick={() => void avvia()}>
          <Camera className="mr-2 h-5 w-5" aria-hidden="true" />
          Attiva fotocamera
        </Button>
      ) : null}

      {errore ? <p className="text-sm text-destructive">{errore}</p> : null}

      {/* Inserimento manuale (sempre disponibile come fallback) */}
      <form onSubmit={inviaManuale} className="space-y-2 rounded-xl border border-border bg-muted/20 p-4">
        <label htmlFor="qr-manuale" className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Inserisci il codice manualmente
        </label>
        <div className="flex gap-2">
          <input
            id="qr-manuale"
            type="text"
            inputMode="text"
            autoComplete="off"
            placeholder="Link o codice del QR"
            value={manuale}
            onChange={(e) => setManuale(e.target.value)}
            className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
          />
          <Button type="submit" size="lg" className="shrink-0 px-3" aria-label="Vai">
            <ArrowRight className="h-5 w-5" aria-hidden="true" />
          </Button>
        </div>
        {manualeErr ? <p className="text-xs text-destructive">{manualeErr}</p> : null}
      </form>
    </div>
  );
}
