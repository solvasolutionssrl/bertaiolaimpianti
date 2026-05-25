'use client';

import * as React from 'react';
import {
  Camera,
  Check,
  Loader2,
  RotateCcw,
  X,
} from 'lucide-react';
import { Button } from '@kommessa/ui';

/**
 * Acquisizione PDF "tipo scanner foglio" da fotocamera.
 *
 * Flow:
 *  1. Apre la fotocamera (back camera in mobile) in un overlay fullscreen.
 *  2. L'utente scatta una foto del foglio.
 *  3. Sulla foto compaiono 4 maniglie agli angoli (default = bordi inset
 *     del 5%). L'utente li sposta sopra gli angoli reali del foglio.
 *  4. Conferma → ritaglio rettangolo dei 4 punti + warp prospettico
 *     (axis-aligned crop in questa v1, perspective transform in v2) →
 *     output PDF single-page A4 con JPEG embedded.
 *
 * Limitazione nota (v1): non c'è auto-detect dei bordi e non c'è
 * perspective warp reale (la v1 fa un crop al bounding rect dei 4
 * angoli). Aggiungere jscanify/opencv.js per v2.
 *
 * Props:
 *  - onCancel: chiude senza output
 *  - onReady(blob, filename): chiamato quando il PDF è pronto
 */
interface Props {
  onCancel: () => void;
  onReady: (pdfBlob: Blob, filename: string) => void;
}

type Stage = 'camera' | 'crop' | 'rendering';

interface Corner {
  x: number; // 0..1 in coord normalizzate sull'immagine
  y: number;
}

export function PdfCameraCapture({ onCancel, onReady }: Props) {
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const captureRef = React.useRef<HTMLCanvasElement | null>(null);
  const overlayRef = React.useRef<HTMLDivElement | null>(null);
  const streamRef = React.useRef<MediaStream | null>(null);

  const [stage, setStage] = React.useState<Stage>('camera');
  const [error, setError] = React.useState<string | null>(null);
  const [capturedDataUrl, setCapturedDataUrl] = React.useState<string | null>(null);
  const [capturedDims, setCapturedDims] = React.useState<{ w: number; h: number } | null>(null);

  // Maniglie agli angoli (coord normalizzate 0..1)
  const [corners, setCorners] = React.useState<[Corner, Corner, Corner, Corner]>([
    { x: 0.05, y: 0.05 },
    { x: 0.95, y: 0.05 },
    { x: 0.95, y: 0.95 },
    { x: 0.05, y: 0.95 },
  ]);
  const draggingIdx = React.useRef<number | null>(null);

  // ─── Camera lifecycle ─────────────────────────────────────────────
  React.useEffect(() => {
    let cancelled = false;
    const start = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const v = videoRef.current;
        if (v) {
          v.srcObject = stream;
          await v.play().catch(() => undefined);
        }
      } catch (e) {
        setError(
          e instanceof Error
            ? `Camera non disponibile: ${e.message}`
            : 'Camera non disponibile',
        );
      }
    };
    if (stage === 'camera') void start();
    return () => {
      cancelled = true;
    };
  }, [stage]);

  // ferma stream all'unmount
  React.useEffect(() => {
    return () => {
      const s = streamRef.current;
      if (s) s.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const stopCamera = () => {
    const s = streamRef.current;
    if (s) s.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  // ─── Capture frame ─────────────────────────────────────────────────
  const capture = () => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(v, 0, 0);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
    setCapturedDataUrl(dataUrl);
    setCapturedDims({ w: v.videoWidth, h: v.videoHeight });
    stopCamera();
    setStage('crop');
  };

  // ─── Re-shoot ──────────────────────────────────────────────────────
  const reshoot = () => {
    setCapturedDataUrl(null);
    setCapturedDims(null);
    setCorners([
      { x: 0.05, y: 0.05 },
      { x: 0.95, y: 0.05 },
      { x: 0.95, y: 0.95 },
      { x: 0.05, y: 0.95 },
    ]);
    setStage('camera');
  };

  // ─── Drag handles ──────────────────────────────────────────────────
  const onPointerDown = (idx: number) => (e: React.PointerEvent) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    draggingIdx.current = idx;
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const idx = draggingIdx.current;
    if (idx === null) return;
    const overlay = overlayRef.current;
    if (!overlay) return;
    const rect = overlay.getBoundingClientRect();
    const xRel = (e.clientX - rect.left) / rect.width;
    const yRel = (e.clientY - rect.top) / rect.height;
    const clamped = {
      x: Math.max(0, Math.min(1, xRel)),
      y: Math.max(0, Math.min(1, yRel)),
    };
    setCorners((prev) => {
      const next = [...prev] as [Corner, Corner, Corner, Corner];
      next[idx] = clamped;
      return next;
    });
  };
  const onPointerUp = () => {
    draggingIdx.current = null;
  };

  // ─── Confirm → genera PDF ──────────────────────────────────────────
  const confirm = async () => {
    if (!capturedDataUrl || !capturedDims) return;
    setStage('rendering');
    try {
      // 1. Calcola bbox dei 4 angoli (axis-aligned crop in v1)
      const xs = corners.map((c) => c.x * capturedDims.w);
      const ys = corners.map((c) => c.y * capturedDims.h);
      const sx = Math.max(0, Math.floor(Math.min(...xs)));
      const sy = Math.max(0, Math.floor(Math.min(...ys)));
      const sw = Math.max(50, Math.floor(Math.max(...xs) - sx));
      const sh = Math.max(50, Math.floor(Math.max(...ys) - sy));

      // 2. Carica l'immagine catturata in un canvas + crop
      const img = await loadImage(capturedDataUrl);
      const cropCanvas = document.createElement('canvas');
      cropCanvas.width = sw;
      cropCanvas.height = sh;
      const cctx = cropCanvas.getContext('2d');
      if (!cctx) throw new Error('Canvas 2D context non disponibile');
      // miglioria leggera: normalizza contrasto via filter (browser-side)
      cctx.filter = 'contrast(1.08) brightness(1.04)';
      cctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);

      const jpegDataUrl = cropCanvas.toDataURL('image/jpeg', 0.88);

      // 3. Crea PDF A4 con jspdf
      // jspdf è import dinamico per ridurre il bundle iniziale
      const { jsPDF } = await import('jspdf');
      const pdf = new jsPDF({
        unit: 'pt',
        format: 'a4',
        orientation: sw >= sh ? 'landscape' : 'portrait',
      });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      // Fit con padding 24pt
      const margin = 24;
      const maxW = pageW - margin * 2;
      const maxH = pageH - margin * 2;
      const ratio = Math.min(maxW / sw, maxH / sh);
      const renderW = sw * ratio;
      const renderH = sh * ratio;
      const offX = (pageW - renderW) / 2;
      const offY = (pageH - renderH) / 2;
      pdf.addImage(jpegDataUrl, 'JPEG', offX, offY, renderW, renderH);
      const blob = pdf.output('blob');
      const filename = `riunione-foglio-${new Date().toISOString().slice(0, 10)}.pdf`;
      onReady(blob, filename);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Errore generazione PDF');
      setStage('crop');
    }
  };

  // ─── render ────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-black/95 text-white">
      <header className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <button
          type="button"
          onClick={onCancel}
          className="flex items-center gap-1.5 text-sm text-white/80 hover:text-white"
        >
          <X className="h-4 w-4" />
          Chiudi
        </button>
        <h2 className="text-sm font-semibold uppercase tracking-wider">
          {stage === 'camera'
            ? 'Inquadra il foglio'
            : stage === 'crop'
              ? 'Sposta gli angoli'
              : 'Generazione PDF…'}
        </h2>
        <div className="w-12" />
      </header>

      {error ? (
        <div className="mx-4 mt-4 rounded-md border border-red-500/40 bg-red-500/10 p-3 text-xs">
          {error}
        </div>
      ) : null}

      {/* ─── stage CAMERA ──────────────────────────────────────── */}
      {stage === 'camera' ? (
        <div className="relative flex flex-1 items-center justify-center overflow-hidden">
          <video
            ref={videoRef}
            playsInline
            muted
            className="h-full max-h-full w-full max-w-full object-contain"
          />
          {/* Overlay di guida */}
          <div className="pointer-events-none absolute inset-6 rounded-lg border-2 border-dashed border-white/50" />
        </div>
      ) : null}

      {/* ─── stage CROP ─────────────────────────────────────────── */}
      {stage === 'crop' && capturedDataUrl ? (
        <div className="relative flex flex-1 items-center justify-center overflow-hidden p-2">
          <div
            ref={overlayRef}
            className="relative inline-block max-h-full max-w-full select-none"
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={capturedDataUrl}
              alt="Foglio acquisito"
              className="max-h-[75vh] max-w-full"
              draggable={false}
            />
            {/* Linee di crop */}
            <svg
              className="pointer-events-none absolute inset-0 h-full w-full"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
            >
              <polygon
                points={corners
                  .map((c) => `${c.x * 100},${c.y * 100}`)
                  .join(' ')}
                fill="rgba(59,130,246,0.15)"
                stroke="rgb(96,165,250)"
                strokeWidth={0.5}
                vectorEffect="non-scaling-stroke"
              />
            </svg>
            {corners.map((c, idx) => (
              <button
                key={idx}
                type="button"
                onPointerDown={onPointerDown(idx)}
                className="absolute h-7 w-7 -translate-x-1/2 -translate-y-1/2 cursor-grab touch-none rounded-full border-2 border-white bg-blue-500/90 shadow-lg active:cursor-grabbing"
                style={{ left: `${c.x * 100}%`, top: `${c.y * 100}%` }}
                aria-label={`Angolo ${idx + 1}`}
              />
            ))}
          </div>
        </div>
      ) : null}

      {stage === 'rendering' ? (
        <div className="flex flex-1 items-center justify-center">
          <div className="flex flex-col items-center gap-2 text-sm">
            <Loader2 className="h-7 w-7 animate-spin" />
            Genero il PDF…
          </div>
        </div>
      ) : null}

      <footer className="border-t border-white/10 p-4">
        {stage === 'camera' ? (
          <div className="flex justify-center">
            <button
              type="button"
              onClick={capture}
              className="flex h-16 w-16 items-center justify-center rounded-full border-4 border-white bg-white/10 transition-colors hover:bg-white/20 active:scale-95"
              aria-label="Scatta"
            >
              <Camera className="h-7 w-7" />
            </button>
          </div>
        ) : null}
        {stage === 'crop' ? (
          <div className="flex items-center justify-between gap-2">
            <Button variant="outline" onClick={reshoot} className="border-white/20 text-white hover:bg-white/10">
              <RotateCcw className="h-3.5 w-3.5" />
              Riscatta
            </Button>
            <p className="hidden flex-1 text-center text-[11px] text-white/60 sm:block">
              Trascina i 4 cerchi sugli angoli del foglio
            </p>
            <Button onClick={confirm}>
              <Check className="h-3.5 w-3.5" />
              Conferma PDF
            </Button>
          </div>
        ) : null}
      </footer>
    </div>
  );
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Caricamento immagine fallito'));
    img.src = src;
  });
}
