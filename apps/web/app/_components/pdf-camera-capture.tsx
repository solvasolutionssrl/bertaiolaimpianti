'use client';

import * as React from 'react';
import {
  Camera,
  Check,
  FileText,
  Loader2,
  Plus,
  RotateCcw,
  Trash2,
  X,
} from 'lucide-react';
import { Button } from '@kommessa/ui';

/**
 * Acquisizione PDF "tipo scanner foglio" da fotocamera, MULTIPAGINA.
 *
 * Flow:
 *  1. Apre la fotocamera (back camera in mobile) ad alta risoluzione.
 *  2. L'utente scatta una foto del foglio.
 *  3. Sposta i 4 angoli sul foglio reale → ritaglio (axis-aligned crop).
 *  4. Conferma la pagina: viene aggiunta all'elenco pagine. Da lì può
 *     "Aggiungi pagina" (rifà 1→3) oppure "Genera PDF" (N pagine).
 *  5. Output: un unico PDF A4 con una pagina per foglio, JPEG ad alta qualità.
 *
 * Qualità: la camera è richiesta ad alta risoluzione (ideal 3840×2160, il
 * browser scala al massimo del device) e i JPEG sono salvati a qualità 0.95
 * per evitare PDF sgranati / troppo compressi.
 */
interface Props {
  onCancel: () => void;
  onReady: (pdfBlob: Blob, filename: string) => void;
}

type Stage = 'camera' | 'crop' | 'pagine' | 'rendering';

interface Corner {
  x: number; // 0..1 normalizzato sull'immagine
  y: number;
}

interface Pagina {
  jpeg: string; // dataURL JPEG ritagliato (alta qualità)
  w: number;
  h: number;
}

const CORNER_DEFAULT: [Corner, Corner, Corner, Corner] = [
  { x: 0.05, y: 0.05 },
  { x: 0.95, y: 0.05 },
  { x: 0.95, y: 0.95 },
  { x: 0.05, y: 0.95 },
];

export function PdfCameraCapture({ onCancel, onReady }: Props) {
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const overlayRef = React.useRef<HTMLDivElement | null>(null);
  const streamRef = React.useRef<MediaStream | null>(null);

  const [stage, setStage] = React.useState<Stage>('camera');
  const [error, setError] = React.useState<string | null>(null);
  const [capturedDataUrl, setCapturedDataUrl] = React.useState<string | null>(null);
  const [capturedDims, setCapturedDims] = React.useState<{ w: number; h: number } | null>(null);
  const [pagine, setPagine] = React.useState<Pagina[]>([]);
  const [corners, setCorners] = React.useState<[Corner, Corner, Corner, Corner]>(CORNER_DEFAULT);
  const draggingIdx = React.useRef<number | null>(null);

  // ─── Camera lifecycle ─────────────────────────────────────────────
  React.useEffect(() => {
    let cancelled = false;
    const start = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          // Alta risoluzione: il browser fornisce il massimo supportato dal
          // device fino a questi ideali. Fondamentale per documenti leggibili.
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 3840 },
            height: { ideal: 2160 },
          },
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
          e instanceof Error ? `Camera non disponibile: ${e.message}` : 'Camera non disponibile',
        );
      }
    };
    if (stage === 'camera') void start();
    return () => {
      cancelled = true;
    };
  }, [stage]);

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
    const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
    setCapturedDataUrl(dataUrl);
    setCapturedDims({ w: v.videoWidth, h: v.videoHeight });
    stopCamera();
    setStage('crop');
  };

  const reshoot = () => {
    setCapturedDataUrl(null);
    setCapturedDims(null);
    setCorners(CORNER_DEFAULT);
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
    const clamped = { x: Math.max(0, Math.min(1, xRel)), y: Math.max(0, Math.min(1, yRel)) };
    setCorners((prev) => {
      const next = [...prev] as [Corner, Corner, Corner, Corner];
      next[idx] = clamped;
      return next;
    });
  };
  const onPointerUp = () => {
    draggingIdx.current = null;
  };

  // ─── Conferma pagina → ritaglia e aggiunge all'elenco ──────────────
  const confermaPagina = async () => {
    if (!capturedDataUrl || !capturedDims) return;
    try {
      const xs = corners.map((c) => c.x * capturedDims.w);
      const ys = corners.map((c) => c.y * capturedDims.h);
      const sx = Math.max(0, Math.floor(Math.min(...xs)));
      const sy = Math.max(0, Math.floor(Math.min(...ys)));
      const sw = Math.max(50, Math.floor(Math.max(...xs) - sx));
      const sh = Math.max(50, Math.floor(Math.max(...ys) - sy));

      const img = await loadImage(capturedDataUrl);
      const cropCanvas = document.createElement('canvas');
      cropCanvas.width = sw;
      cropCanvas.height = sh;
      const cctx = cropCanvas.getContext('2d');
      if (!cctx) throw new Error('Canvas 2D context non disponibile');
      cctx.filter = 'contrast(1.08) brightness(1.04)';
      cctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);

      // Qualità alta (0.95) per non sgranare il documento.
      const jpeg = cropCanvas.toDataURL('image/jpeg', 0.95);
      setPagine((prev) => [...prev, { jpeg, w: sw, h: sh }]);
      setCapturedDataUrl(null);
      setCapturedDims(null);
      setCorners(CORNER_DEFAULT);
      setStage('pagine');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Errore ritaglio pagina');
    }
  };

  const aggiungiPagina = () => {
    setError(null);
    setCapturedDataUrl(null);
    setCapturedDims(null);
    setCorners(CORNER_DEFAULT);
    setStage('camera');
  };

  const rimuoviPagina = (idx: number) => {
    setPagine((prev) => prev.filter((_, i) => i !== idx));
  };

  // ─── Genera PDF multipagina ────────────────────────────────────────
  const generaPdf = async () => {
    if (pagine.length === 0) return;
    setStage('rendering');
    try {
      const { jsPDF } = await import('jspdf');
      let pdf: InstanceType<typeof jsPDF> | null = null;
      const margin = 24;
      for (let i = 0; i < pagine.length; i++) {
        const p = pagine[i]!;
        const orient: 'portrait' | 'landscape' = p.w >= p.h ? 'landscape' : 'portrait';
        if (i === 0) pdf = new jsPDF({ unit: 'pt', format: 'a4', orientation: orient });
        else pdf!.addPage('a4', orient);
        const pageW = pdf!.internal.pageSize.getWidth();
        const pageH = pdf!.internal.pageSize.getHeight();
        const ratio = Math.min((pageW - margin * 2) / p.w, (pageH - margin * 2) / p.h);
        const renderW = p.w * ratio;
        const renderH = p.h * ratio;
        const offX = (pageW - renderW) / 2;
        const offY = (pageH - renderH) / 2;
        // JPEG embeddato così com'è (qualità 0.95 dalla cattura): niente
        // ri-compressione che sgranerebbe il documento.
        pdf!.addImage(p.jpeg, 'JPEG', offX, offY, renderW, renderH);
      }
      const blob = pdf!.output('blob');
      const filename = `scansione-${new Date().toISOString().slice(0, 10)}.pdf`;
      onReady(blob, filename);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Errore generazione PDF');
      setStage('pagine');
    }
  };

  const titolo =
    stage === 'camera'
      ? `Inquadra il foglio${pagine.length > 0 ? ` · pagina ${pagine.length + 1}` : ''}`
      : stage === 'crop'
        ? 'Sposta gli angoli'
        : stage === 'pagine'
          ? `${pagine.length} ${pagine.length === 1 ? 'pagina' : 'pagine'}`
          : 'Generazione PDF…';

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
        <h2 className="text-sm font-semibold uppercase tracking-wider">{titolo}</h2>
        <div className="w-12 text-right text-xs text-white/60">
          {pagine.length > 0 && stage !== 'pagine' ? `${pagine.length} pag.` : null}
        </div>
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
          <div className="pointer-events-none absolute inset-6 rounded-lg border-2 border-dashed border-white/50" />
          <p className="pointer-events-none absolute bottom-3 left-0 right-0 text-center text-[11px] text-white/70">
            Più fogli? Scattali uno alla volta: finiranno in un unico PDF.
          </p>
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
            <svg
              className="pointer-events-none absolute inset-0 h-full w-full"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
            >
              <polygon
                points={corners.map((c) => `${c.x * 100},${c.y * 100}`).join(' ')}
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

      {/* ─── stage PAGINE (review multipagina) ──────────────────── */}
      {stage === 'pagine' ? (
        <div className="flex-1 overflow-auto p-4">
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
            {pagine.map((p, idx) => (
              <div
                key={idx}
                className="relative overflow-hidden rounded-md border border-white/15 bg-white/5"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.jpeg} alt={`Pagina ${idx + 1}`} className="aspect-[3/4] w-full object-cover" />
                <span className="absolute left-1 top-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-bold">
                  {idx + 1}
                </span>
                <button
                  type="button"
                  onClick={() => rimuoviPagina(idx)}
                  className="absolute right-1 top-1 rounded-full bg-black/70 p-1 text-white/90 hover:bg-red-600"
                  aria-label={`Rimuovi pagina ${idx + 1}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={aggiungiPagina}
              className="flex aspect-[3/4] flex-col items-center justify-center gap-1.5 rounded-md border-2 border-dashed border-white/25 text-white/70 hover:border-white/50 hover:text-white"
            >
              <Plus className="h-6 w-6" />
              <span className="text-xs font-medium">Aggiungi pagina</span>
            </button>
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
            <Button onClick={confermaPagina}>
              <Check className="h-3.5 w-3.5" />
              Aggiungi pagina
            </Button>
          </div>
        ) : null}
        {stage === 'pagine' ? (
          <div className="flex items-center justify-between gap-2">
            <Button variant="outline" onClick={aggiungiPagina} className="border-white/20 text-white hover:bg-white/10">
              <Plus className="h-3.5 w-3.5" />
              Aggiungi pagina
            </Button>
            <Button onClick={generaPdf} disabled={pagine.length === 0}>
              <FileText className="h-3.5 w-3.5" />
              Genera PDF ({pagine.length})
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
