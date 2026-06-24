'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import jsQR from 'jsqr';
import {
  Camera,
  Loader2,
  QrCode,
  ArrowRight,
  Smartphone,
  CheckCircle2,
} from 'lucide-react';
import { Button } from '@kommessa/ui';

/**
 * Scanner QR "a prova di cantiere".
 *
 * Il QR affisso codifica l'URL `{origin}/t/{token}`; qui estraiamo il token e
 * navighiamo a `/t/[token]` (la pagina di timbratura reale NON viene reinventata).
 *
 * Due percorsi distinti per piattaforma:
 *
 *  - **Android / Chromium** (engine `native`): `BarcodeDetector` nativo sullo
 *    stream `getUserMedia`. Scansione LIVE, fotocamera avviata da sola. Questo
 *    ramo è quello che funziona bene: NON va toccato.
 *
 *  - **iPhone / WebKit** (engine `jsqr`): su iOS lo streaming `getUserMedia`
 *    dentro una PWA installata è bloccato da WebKit (bug noto Apple) e in Safari
 *    è instabile (muore al ritorno da background). Quindi NON usiamo lo stream:
 *      1) percorso principale → inquadrare il QR con la **fotocamera nativa** del
 *         telefono (il QR contiene l'URL, si apre da solo), nessuna camera in-app;
 *      2) fallback in-app → **scatto-foto** via `<input capture>` + decodifica
 *         dell'immagine con `jsQR` (nessuno stream → nessun popup "registrazione").
 *
 *  - Nessuna fotocamera: campo manuale per incollare link/codice (sempre presente).
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

// ─── decodifica QR da un file immagine (scatto-foto iOS) ─────────────────────
async function fileToBitmap(file: File): Promise<{
  source: CanvasImageSource;
  width: number;
  height: number;
  cleanup: () => void;
}> {
  // createImageBitmap è supportato da iOS Safari 15+ ed è la via più rapida.
  if (typeof createImageBitmap === 'function') {
    const bmp = await createImageBitmap(file);
    return { source: bmp, width: bmp.width, height: bmp.height, cleanup: () => bmp.close() };
  }
  // Fallback HTMLImageElement.
  const url = URL.createObjectURL(file);
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('immagine non caricabile'));
    el.src = url;
  });
  return {
    source: img,
    width: img.naturalWidth || img.width,
    height: img.naturalHeight || img.height,
    cleanup: () => URL.revokeObjectURL(url),
  };
}

export function ScansionaClient() {
  const router = useRouter();

  const [engine, setEngine] = React.useState<Engine>(null);

  // ── stato percorso LIVE (Android/native) ──────────────────────────────────
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const rafRef = React.useRef<number | null>(null);
  const lockedRef = React.useRef(false);
  const [statoLive, setStatoLive] = React.useState<'idle' | 'attiva' | 'errore' | 'trovato'>('idle');
  const [erroreLive, setErroreLive] = React.useState<string | null>(null);

  // ── stato percorso FOTO (iOS/fallback) ────────────────────────────────────
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const [fotoStato, setFotoStato] = React.useState<'idle' | 'analisi' | 'ok' | 'errore'>('idle');
  const [fotoErr, setFotoErr] = React.useState<string | null>(null);
  const [fotoPreview, setFotoPreview] = React.useState<string | null>(null);

  // ── stato comune: codice manuale ──────────────────────────────────────────
  const [manuale, setManuale] = React.useState('');
  const [manualeErr, setManualeErr] = React.useState<string | null>(null);

  const stopCamera = React.useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    const s = streamRef.current;
    if (s) s.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const vaiAToken = React.useCallback(
    (token: string) => {
      lockedRef.current = true;
      stopCamera();
      router.push(`/t/${token}`);
    },
    [router, stopCamera],
  );

  // ── LIVE (solo Android/native, BarcodeDetector) ───────────────────────────
  const avviaLive = React.useCallback(async () => {
    setErroreLive(null);
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
      setStatoLive('attiva');
      lockedRef.current = false;

      const detector = new (getBarcodeDetectorCtor()!)({ formats: ['qr_code'] });
      const tick = async () => {
        if (lockedRef.current) return;
        const vid = videoRef.current;
        if (vid && vid.readyState >= 2) {
          try {
            const codes = await detector.detect(vid);
            for (const c of codes) {
              const token = estraiToken(c.rawValue);
              if (token) {
                setStatoLive('trovato');
                vaiAToken(token);
                return;
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
      setStatoLive('errore');
      setErroreLive(
        e instanceof Error ? `Fotocamera non disponibile: ${e.message}` : 'Fotocamera non disponibile',
      );
    }
  }, [vaiAToken]);

  // Rilevamento motore + (per Android) avvio automatico della fotocamera live.
  React.useEffect(() => {
    const hasCamera =
      typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
    const eng: Engine = getBarcodeDetectorCtor() ? 'native' : hasCamera ? 'jsqr' : null;
    setEngine(eng);
    if (eng === 'native') void avviaLive();
    return () => stopCamera();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── FOTO (iOS/fallback): scatto → decodifica jsQR ─────────────────────────
  const onFotoScelta = React.useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = ''; // consente di riscattare lo stesso file
      if (!file) return;

      setFotoErr(null);
      // anteprima della foto durante l'analisi (UI "sto leggendo il QR")
      setFotoPreview((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(file);
      });
      setFotoStato('analisi');

      let bitmap: Awaited<ReturnType<typeof fileToBitmap>> | null = null;
      try {
        bitmap = await fileToBitmap(file);
        const maxLato = 1600; // abbastanza per leggere il QR, leggero per la CPU
        const scala = Math.min(1, maxLato / Math.max(bitmap.width, bitmap.height));
        const w = Math.max(1, Math.round(bitmap.width * scala));
        const h = Math.max(1, Math.round(bitmap.height * scala));
        const canvas = canvasRef.current ?? (canvasRef.current = document.createElement('canvas'));
        canvas.width = w;
        canvas.height = h;
        const c = canvas.getContext('2d', { willReadFrequently: true });
        if (!c) throw new Error('canvas non disponibile');
        c.drawImage(bitmap.source, 0, 0, w, h);
        const img = c.getImageData(0, 0, w, h);
        const res = jsQR(img.data, w, h, { inversionAttempts: 'attemptBoth' });
        const token = res ? estraiToken(res.data) : null;
        if (token) {
          setFotoStato('ok');
          vaiAToken(token);
          return;
        }
        setFotoStato('errore');
        setFotoErr('Nessun QR riconosciuto nella foto. Avvicinati e inquadra bene il codice, poi riprova.');
      } catch {
        setFotoStato('errore');
        setFotoErr('Non sono riuscito a leggere la foto. Riprova.');
      } finally {
        bitmap?.cleanup();
      }
    },
    [vaiAToken],
  );

  // pulizia anteprima
  React.useEffect(() => {
    return () => {
      if (fotoPreview) URL.revokeObjectURL(fotoPreview);
    };
  }, [fotoPreview]);

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

  const apriFotocamera = () => fileInputRef.current?.click();

  // ─── RENDER: percorso LIVE (Android/native) ──────────────────────────────
  if (engine === 'native') {
    return (
      <div className="space-y-5">
        <div className="relative aspect-square w-full overflow-hidden rounded-2xl border border-border bg-black">
          <video ref={videoRef} playsInline muted className="h-full w-full object-cover" />
          {statoLive !== 'attiva' && statoLive !== 'trovato' ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/60 p-6 text-center text-white">
              <QrCode className="h-10 w-10 opacity-80" aria-hidden="true" />
              <p className="text-sm opacity-90">
                {statoLive === 'errore'
                  ? 'Fotocamera non disponibile. Usa il codice manuale qui sotto.'
                  : 'Avvio fotocamera… inquadra il QR del cantiere.'}
              </p>
            </div>
          ) : null}
          {statoLive === 'trovato' ? (
            <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-white">
              <Loader2 className="h-8 w-8 animate-spin" aria-hidden="true" />
            </div>
          ) : null}
          {statoLive === 'attiva' ? (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-[18%] rounded-xl border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.25)]"
            />
          ) : null}
        </div>

        {statoLive === 'errore' ? (
          <Button className="w-full py-3 text-base" size="lg" onClick={() => void avviaLive()}>
            <Camera className="mr-2 h-5 w-5" aria-hidden="true" />
            Riprova fotocamera
          </Button>
        ) : null}

        {erroreLive ? <p className="text-sm text-destructive">{erroreLive}</p> : null}

        <FormManuale
          manuale={manuale}
          setManuale={setManuale}
          manualeErr={manualeErr}
          onSubmit={inviaManuale}
        />
      </div>
    );
  }

  // ─── RENDER: percorso FOTO (iPhone) + nessuna-camera ─────────────────────
  return (
    <div className="space-y-5">
      {/* Percorso principale: fotocamera NATIVA sul poster del cantiere */}
      <div className="flex items-start gap-3 rounded-2xl border border-primary/20 bg-primary-soft p-4">
        <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <Smartphone className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">Inquadra il QR col telefono</p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Apri la <strong>Fotocamera</strong> del telefono e punta il QR del cantiere: si apre da
            solo, senza fare foto.
          </p>
        </div>
      </div>

      {/* Fallback in-app: scatto-foto al QR + analisi */}
      <div className="space-y-3">
        <div className="relative aspect-square w-full overflow-hidden rounded-2xl border border-border bg-muted/30">
          {fotoPreview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={fotoPreview} alt="" className="h-full w-full object-cover" />
          ) : null}

          {/* mirino guida */}
          {fotoStato === 'idle' ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
              <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-background shadow-soft">
                <QrCode className="h-8 w-8 text-primary" aria-hidden="true" />
              </span>
              <p className="text-sm text-muted-foreground">
                Oppure scatta una foto al QR: la leggo io.
              </p>
            </div>
          ) : null}

          {/* analisi in corso */}
          {fotoStato === 'analisi' ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/55 text-white">
              <div className="pointer-events-none absolute inset-[16%] overflow-hidden rounded-xl border-2 border-white/70">
                <span className="absolute inset-x-0 top-0 h-1/3 animate-pulse bg-gradient-to-b from-white/40 to-transparent" />
              </div>
              <Loader2 className="h-8 w-8 animate-spin" aria-hidden="true" />
              <p className="text-sm font-medium">Analizzo il QR…</p>
            </div>
          ) : null}

          {/* trovato */}
          {fotoStato === 'ok' ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-emerald-600/85 text-white">
              <CheckCircle2 className="h-9 w-9" aria-hidden="true" />
              <p className="text-sm font-semibold">QR riconosciuto</p>
            </div>
          ) : null}
        </div>

        <Button
          className="w-full py-3 text-base"
          size="lg"
          onClick={apriFotocamera}
          disabled={fotoStato === 'analisi' || fotoStato === 'ok'}
        >
          <Camera className="mr-2 h-5 w-5" aria-hidden="true" />
          {fotoStato === 'errore' ? 'Riprova: scatta foto al QR' : 'Scatta foto al QR'}
        </Button>

        {/* input nativo: apre la fotocamera per UNO scatto (niente stream) */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => void onFotoScelta(e)}
        />

        {fotoErr ? <p className="text-sm text-destructive">{fotoErr}</p> : null}
      </div>

      <FormManuale
        manuale={manuale}
        setManuale={setManuale}
        manualeErr={manualeErr}
        onSubmit={inviaManuale}
      />
    </div>
  );
}

// ─── form codice manuale (condiviso tra i due percorsi) ──────────────────────
function FormManuale({
  manuale,
  setManuale,
  manualeErr,
  onSubmit,
}: {
  manuale: string;
  setManuale: (v: string) => void;
  manualeErr: string | null;
  onSubmit: (e: React.FormEvent) => void;
}) {
  return (
    <form onSubmit={onSubmit} className="space-y-2 rounded-xl border border-border bg-muted/20 p-4">
      <label
        htmlFor="qr-manuale"
        className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground"
      >
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
  );
}
