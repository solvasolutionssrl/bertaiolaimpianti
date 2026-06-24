'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import jsQR from 'jsqr';
import { Camera, Loader2, QrCode, ArrowRight } from 'lucide-react';
import { Button } from '@kommessa/ui';

/**
 * Scanner QR "a prova di cantiere".
 *
 * Il QR affisso codifica l'URL `{origin}/t/{token}`; qui estraiamo il token e
 * navighiamo a `/t/[token]` (la pagina di timbratura reale NON viene reinventata).
 *
 * Motore di decodifica per piattaforma:
 *  - Android/Chromium: `BarcodeDetector` nativo (veloce). Avvio fotocamera
 *    automatico all'apertura.
 *  - iOS Safari (niente `BarcodeDetector`): fallback in JS con `jsQR` sui frame
 *    del video. La fotocamera parte su TAP esplicito ("Attiva fotocamera"), così
 *    iOS concede il permesso in modo affidabile (l'autostart senza gesto è
 *    inaffidabile su iOS).
 *  - Nessuna fotocamera disponibile: campo manuale per incollare link/codice.
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

type Engine = 'native' | 'jsqr' | null;

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
  // Canvas off-screen riusato per il fallback jsQR (snapshot dei frame video).
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

  const [engine, setEngine] = React.useState<Engine>(null);
  // App aggiunta alla Home (display-mode standalone): su iOS la fotocamera del
  // browser è limitata da WebKit → serve un avviso dedicato.
  const [isStandalone, setIsStandalone] = React.useState(false);
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

  // Decodifica un frame col fallback jsQR (downscale per performance su iPhone).
  function decodeJsQr(video: HTMLVideoElement): string | null {
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh) return null;
    const scale = Math.min(1, 720 / Math.max(vw, vh));
    const w = Math.round(vw * scale);
    const h = Math.round(vh * scale);
    const canvas = canvasRef.current ?? (canvasRef.current = document.createElement('canvas'));
    canvas.width = w;
    canvas.height = h;
    const c = canvas.getContext('2d', { willReadFrequently: true });
    if (!c) return null;
    c.drawImage(video, 0, 0, w, h);
    const img = c.getImageData(0, 0, w, h);
    const res = jsQR(img.data, w, h, { inversionAttempts: 'dontInvert' });
    return res?.data ?? null;
  }

  const avvia = React.useCallback(
    async (eng: Exclude<Engine, null>) => {
      setErrore(null);
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        });
        streamRef.current = stream;
        const v = videoRef.current;
        if (v) {
          v.srcObject = stream;
          // iOS richiede playsInline + muted (già sul tag) e play() dopo gesto.
          await v.play().catch(() => undefined);
        }
        setStato('attiva');
        lockedRef.current = false;

        const detector = eng === 'native' ? new (getBarcodeDetectorCtor()!)({ formats: ['qr_code'] }) : null;
        let lastJsqr = 0;

        const tick = async () => {
          if (lockedRef.current) return;
          const vid = videoRef.current;
          if (vid && vid.readyState >= 2) {
            try {
              if (detector) {
                const codes = await detector.detect(vid);
                for (const c of codes) {
                  const token = estraiToken(c.rawValue);
                  if (token) {
                    vaiAToken(token);
                    return;
                  }
                }
              } else {
                // jsQR: throttle ~10fps per non sovraccaricare la CPU su iPhone.
                const now = performance.now();
                if (now - lastJsqr >= 100) {
                  lastJsqr = now;
                  const raw = decodeJsQr(vid);
                  if (raw) {
                    const token = estraiToken(raw);
                    if (token) {
                      vaiAToken(token);
                      return;
                    }
                  }
                }
              }
            } catch {
              // frame non decodificabile → continua
            }
          }
          rafRef.current = requestAnimationFrame(() => void tick());
        };
        rafRef.current = requestAnimationFrame(() => void tick());
      } catch (e) {
        setStato('errore');
        // Permesso negato/bloccato: su iOS (engine jsqr) dai la guida giusta,
        // distinta tra app-in-Home (limite WebKit) e diniego in Safari.
        const permErr =
          e instanceof DOMException &&
          (e.name === 'NotAllowedError' || e.name === 'SecurityError' || e.name === 'NotFoundError');
        if (eng === 'jsqr' && permErr) {
          setErrore(
            isStandalone
              ? "Con l'app aggiunta alla Home, iOS blocca la fotocamera nel browser. Inquadra il QR del cantiere con l'app Fotocamera del telefono (si apre da sola), oppure inserisci il codice qui sotto."
              : "Permesso fotocamera negato. Vai in Impostazioni → Safari → Fotocamera (oppure tocca «aA» nella barra → Fotocamera → Consenti) e riprova. In alternativa inquadra il QR con la Fotocamera del telefono o usa il codice.",
          );
        } else {
          setErrore(
            e instanceof Error ? `Fotocamera non disponibile: ${e.message}` : 'Fotocamera non disponibile',
          );
        }
      }
    },
    [vaiAToken],
  );

  // Rilevamento motore + avvio. Su Android (BarcodeDetector) parte da sola; su
  // iOS (jsQR) serve il tap dell'utente per il permesso fotocamera.
  React.useEffect(() => {
    const hasCamera =
      typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
    const eng: Engine = getBarcodeDetectorCtor() ? 'native' : hasCamera ? 'jsqr' : null;
    setEngine(eng);
    const standalone =
      window.matchMedia?.('(display-mode: standalone)').matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
    setIsStandalone(!!standalone);
    if (eng === 'native') void avvia(eng);
    return () => stopCamera();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const cameraAvailable = engine !== null;
  const isIos = engine === 'jsqr'; // su WebKit usiamo sempre jsQR

  return (
    <div className="space-y-5">
      {/* Area camera */}
      <div className="relative aspect-square w-full overflow-hidden rounded-2xl border border-border bg-black">
        <video ref={videoRef} playsInline muted className="h-full w-full object-cover" />
        {stato !== 'attiva' && stato !== 'trovato' ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/60 p-6 text-center text-white">
            <QrCode className="h-10 w-10 opacity-80" aria-hidden="true" />
            <p className="text-sm opacity-90">
              {!cameraAvailable
                ? 'Fotocamera non disponibile qui. Usa il codice manuale qui sotto.'
                : isIos
                  ? 'Tocca «Attiva fotocamera» e inquadra il QR del cantiere.'
                  : 'Avvio fotocamera… inquadra il QR del cantiere.'}
            </p>
            {isIos && isStandalone ? (
              <p className="text-xs opacity-70">
                Se non parte: inquadra il poster con la Fotocamera del telefono (apre da sola), o
                usa il codice qui sotto.
              </p>
            ) : null}
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

      {cameraAvailable && stato !== 'attiva' && stato !== 'trovato' ? (
        <Button className="w-full py-3 text-base" size="lg" onClick={() => engine && void avvia(engine)}>
          <Camera className="mr-2 h-5 w-5" aria-hidden="true" />
          {stato === 'errore' ? 'Riprova fotocamera' : 'Attiva fotocamera'}
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
