'use client';

/**
 * PdfCanvas — pagina PDF (react-pdf/pdf.js) + Konva overlay.
 *
 * Comportamento:
 *  - <Document/> e <Page/> di react-pdf renderizzano la pagina sotto.
 *    `renderTextLayer` è abilitato così l'utente può selezionare testo
 *    in modalità Testo.
 *  - Stage Konva absolute sopra la pagina (medesime dimensioni). In
 *    modalità Disegno cattura i pointer event; in modalità Testo è
 *    `pointer-events: none` per lasciar passare la selezione al textLayer.
 *
 * Coordinate: la pagina pdf.js è renderizzata a `pageWidth × pageHeight`
 * (px in CSS, dopo scale). Per garantire stabilità delle annotazioni al
 * resize / cambio zoom, salviamo le shapes nel sistema di coordinate
 * "base" della pagina (pageWidth a scale = 1, dimensione "naturale"
 * della pagina PDF) e applichiamo `scale` sullo Stage. La conversione
 * client ↔ ref è una semplice divisione.
 *
 * Worker pdf.js: configurato globalmente in `./pdf-worker.ts` (singleton).
 */

import * as React from 'react';
import { Document, Page } from 'react-pdf';
import { Stage, Layer } from 'react-konva';
import { Loader2 } from 'lucide-react';

import {
  HIGHLIGHT_OPACITY,
  HIGHLIGHT_STROKE_MULTIPLIER,
  isComment,
  newShapeId,
  serializeShape,
  distanceToShape,
  type Rect2D,
  type Shape,
} from '../../_lib/annotation-shapes';

import { RenderShape } from './render-shape';
import type { DrawingTool, PdfTextTool, PdfMode } from './types';
import type { AnnotationState } from './hooks/use-annotation-state';

// Side-effect: configura il worker pdf.js (singleton globale).
import './pdf-worker';

// Caricamento CSS richiesti da react-pdf per textLayer/annotationLayer
import 'react-pdf/dist/Page/TextLayer.css';
import 'react-pdf/dist/Page/AnnotationLayer.css';

export interface PdfCanvasProps {
  /** URL del PDF (signed). */
  fileUrl: string;
  /** Stato corrente della pagina visibile (ogni pagina ha il suo state). */
  state: AnnotationState;
  mode: PdfMode;
  /** Tool drawing (mode=draw). */
  drawingTool: DrawingTool;
  /** Tool text (mode=text). */
  textTool: PdfTextTool;
  color: string;
  strokeWidth: number;
  page: number; // 1-based
  zoom: number; // moltiplicatore su scale; 1 = fit width
  readOnly?: boolean;
  /** Callback caricamento PDF: ritorna num pagine totali. */
  onDocumentLoaded?: (numPages: number) => void;
  /** Notifica il parent della dimensione reference della pagina corrente. */
  onPageSize?: (page: number, w: number, h: number) => void;
}

function useContainerSize(ref: React.RefObject<HTMLElement>) {
  const [size, setSize] = React.useState({ w: 0, h: 0 });
  React.useEffect(() => {
    if (!ref.current) return;
    const el = ref.current;
    const ro = new ResizeObserver(() => {
      const rect = el.getBoundingClientRect();
      setSize({ w: rect.width, h: rect.height });
    });
    ro.observe(el);
    const rect = el.getBoundingClientRect();
    setSize({ w: rect.width, h: rect.height });
    return () => ro.disconnect();
  }, [ref]);
  return size;
}

export function PdfCanvas(props: PdfCanvasProps) {
  const {
    fileUrl,
    state,
    mode,
    drawingTool,
    textTool,
    color,
    strokeWidth,
    page,
    zoom,
    readOnly,
    onDocumentLoaded,
    onPageSize,
  } = props;

  const containerRef = React.useRef<HTMLDivElement>(null);
  const pageWrapRef = React.useRef<HTMLDivElement>(null);
  const containerSize = useContainerSize(containerRef);

  // Dimensioni "naturali" della pagina (a scale=1, post-load). Le riceviamo
  // dal callback onLoadSuccess di <Page/>. La nostra coordinate-base.
  const [pageNatural, setPageNatural] = React.useState<{ w: number; h: number } | null>(
    null,
  );
  const [loadError, setLoadError] = React.useState<string | null>(null);

  // Scale finale = fit-width * zoom prop.
  const fitScale = React.useMemo(() => {
    if (!pageNatural || containerSize.w === 0) return 1;
    return Math.min(1, (containerSize.w - 32) / pageNatural.w);
  }, [pageNatural, containerSize]);

  const scale = fitScale * zoom;
  const renderW = pageNatural ? Math.round(pageNatural.w * scale) : 0;
  const renderH = pageNatural ? Math.round(pageNatural.h * scale) : 0;

  // Notifica al parent la dimensione naturale della pagina corrente (per il salvataggio).
  React.useEffect(() => {
    if (pageNatural) onPageSize?.(page, pageNatural.w, pageNatural.h);
  }, [pageNatural, page, onPageSize]);

  // ---------------- Drawing pointer events (mode=draw) ----------------
  const isDownRef = React.useRef(false);
  const screenToRef = (sx: number, sy: number) => ({ x: sx / scale, y: sy / scale });

  const eraseAt = (x: number, y: number) => {
    const radius = 12;
    const toRemove = state.shapes.filter((s) => distanceToShape(s, x, y) <= radius);
    if (toRemove.length === 0) return;
    state.remove(toRemove.map((s) => s.id));
  };

  const handleDrawDown = (e: any) => {
    if (readOnly || mode !== 'draw') return;
    const stage = e.target.getStage();
    if (!stage) return;
    const pos = stage.getPointerPosition();
    if (!pos) return;
    const { x, y } = screenToRef(pos.x, pos.y);
    isDownRef.current = true;

    const evt = e.evt as PointerEvent;
    const pressure = evt?.pressure && evt.pressure > 0 ? evt.pressure : undefined;
    const baseStroke =
      drawingTool === 'highlight'
        ? strokeWidth * HIGHLIGHT_STROKE_MULTIPLIER
        : strokeWidth;
    const effStroke = pressure ? Math.max(1, baseStroke * (0.5 + pressure)) : baseStroke;

    switch (drawingTool) {
      case 'pencil':
        state.setDrawing({
          id: newShapeId(),
          type: 'line',
          color,
          strokeWidth: effStroke,
          points: [x, y, x, y],
          pressure,
        });
        break;
      case 'highlight':
        state.setDrawing({
          id: newShapeId(),
          type: 'highlight',
          color,
          strokeWidth: effStroke,
          opacity: HIGHLIGHT_OPACITY,
          points: [x, y, x, y],
        });
        break;
      case 'arrow':
        state.setDrawing({
          id: newShapeId(),
          type: 'arrow',
          color,
          strokeWidth: effStroke,
          from: { x, y },
          to: { x, y },
        });
        break;
      case 'rect':
        state.setDrawing({
          id: newShapeId(),
          type: 'rect',
          color,
          strokeWidth: effStroke,
          x,
          y,
          width: 0,
          height: 0,
        });
        break;
      case 'ellipse':
        state.setDrawing({
          id: newShapeId(),
          type: 'ellipse',
          color,
          strokeWidth: effStroke,
          cx: x,
          cy: y,
          radiusX: 0,
          radiusY: 0,
        });
        break;
      case 'eraser':
        eraseAt(x, y);
        break;
      case 'text':
        setTextInput({ x, y, value: '' });
        isDownRef.current = false;
        break;
    }
  };

  const handleDrawMove = (e: any) => {
    if (readOnly || mode !== 'draw' || !isDownRef.current) return;
    const stage = e.target.getStage();
    if (!stage) return;
    const pos = stage.getPointerPosition();
    if (!pos) return;
    const { x, y } = screenToRef(pos.x, pos.y);
    if (drawingTool === 'eraser') {
      eraseAt(x, y);
      return;
    }
    const d = state.drawing;
    if (!d) return;
    switch (d.type) {
      case 'line':
      case 'highlight':
        state.setDrawing({ ...d, points: [...d.points, x, y] });
        break;
      case 'arrow':
        state.setDrawing({ ...d, to: { x, y } });
        break;
      case 'rect':
        state.setDrawing({ ...d, width: x - d.x, height: y - d.y });
        break;
      case 'ellipse':
        state.setDrawing({
          ...d,
          radiusX: Math.abs(x - d.cx),
          radiusY: Math.abs(y - d.cy),
        });
        break;
    }
  };

  const handleDrawUp = () => {
    if (readOnly || mode !== 'draw') return;
    isDownRef.current = false;
    if (state.drawing) {
      const finalized = serializeShape(state.drawing);
      if (!isShapeEmpty(finalized)) state.commit(finalized);
      state.setDrawing(null);
    }
  };

  // ---------------- Text input overlay (drawing-text e comment) ----------------
  const [textInput, setTextInput] = React.useState<{
    x: number;
    y: number;
    value: string;
  } | null>(null);

  const commitDrawingText = () => {
    if (!textInput) return;
    const value = textInput.value.trim();
    if (value) {
      state.commit({
        id: newShapeId(),
        type: 'text',
        color,
        strokeWidth: 1,
        x: textInput.x,
        y: textInput.y,
        text: value,
        fontSize: Math.max(16, strokeWidth * 4),
      });
    }
    setTextInput(null);
  };

  // ---------------- Text mode: selection → highlight/underline/strike ----------------

  /**
   * Quando l'utente rilascia il mouse/touch nel textLayer, leggiamo la
   * `window.getSelection()`. Per ogni Range otteniamo `getClientRects()`
   * (un Rect per "linea" visuale). Convertiamo le coordinate dal sistema
   * screen al sistema reference della pagina (origin = top-left del page
   * wrap).
   */
  const captureTextSelection = React.useCallback(() => {
    if (mode !== 'text') return;
    if (readOnly) return;
    if (textTool === 'comment') return; // comment ha logica separata
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;
    const wrap = pageWrapRef.current;
    if (!wrap) return;
    const wrapBox = wrap.getBoundingClientRect();
    const range = sel.getRangeAt(0);
    const rects: Rect2D[] = [];
    for (const r of Array.from(range.getClientRects())) {
      if (r.width < 1 || r.height < 1) continue;
      rects.push({
        x: (r.left - wrapBox.left) / scale,
        y: (r.top - wrapBox.top) / scale,
        width: r.width / scale,
        height: r.height / scale,
      });
    }
    if (rects.length === 0) return;
    sel.removeAllRanges();

    const type: Shape['type'] =
      textTool === 'text-highlight'
        ? 'highlight-text'
        : textTool === 'text-underline'
          ? 'underline-text'
          : 'strike-text';

    state.commit({
      id: newShapeId(),
      type,
      color,
      strokeWidth,
      opacity: type === 'highlight-text' ? HIGHLIGHT_OPACITY : 1,
      rects,
      page,
    } as Shape);
  }, [mode, textTool, readOnly, scale, color, strokeWidth, state, page]);

  React.useEffect(() => {
    if (mode !== 'text') return;
    const wrap = pageWrapRef.current;
    if (!wrap) return;
    const onUp = () => {
      // Aspetta che la selection si stabilizzi (Safari iOS)
      setTimeout(captureTextSelection, 50);
    };
    wrap.addEventListener('mouseup', onUp);
    wrap.addEventListener('touchend', onUp);
    return () => {
      wrap.removeEventListener('mouseup', onUp);
      wrap.removeEventListener('touchend', onUp);
    };
  }, [mode, captureTextSelection]);

  // ---------------- Comment placement (mode=text, tool=comment) ----------------
  const handleTextLayerClick = (e: React.MouseEvent) => {
    if (mode !== 'text' || textTool !== 'comment' || readOnly) return;
    const wrap = pageWrapRef.current;
    if (!wrap) return;
    const box = wrap.getBoundingClientRect();
    const x = (e.clientX - box.left) / scale;
    const y = (e.clientY - box.top) / scale;
    setTextInput({ x, y, value: '' });
  };

  const commitComment = () => {
    if (!textInput) return;
    const v = textInput.value.trim();
    if (v) {
      state.commit({
        id: newShapeId(),
        type: 'comment',
        color,
        strokeWidth: 1,
        anchor: { x: textInput.x, y: textInput.y },
        text: v,
        page,
      });
    }
    setTextInput(null);
  };

  // ---------------- Comments numbering ----------------
  // I commenti sono numerati per ordine di creazione nella pagina corrente.
  const commentIndex = React.useMemo(() => {
    let i = 0;
    const map = new Map<string, number>();
    for (const s of state.shapes) {
      if (isComment(s)) {
        i += 1;
        map.set(s.id, i);
      }
    }
    return map;
  }, [state.shapes]);

  // ---------------- Render ----------------

  return (
    <div
      ref={containerRef}
      className="relative flex h-full w-full flex-col items-center overflow-auto p-3 md:p-4"
      style={{ backgroundColor: 'hsl(220 14% 22%)' }}
    >
      <Document
        file={fileUrl}
        loading={
          <div className="flex flex-col items-center gap-2 py-12 text-slate-300">
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
            <p className="text-sm">Caricamento PDF…</p>
          </div>
        }
        error={
          <p className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">
            Impossibile caricare il PDF.
          </p>
        }
        onLoadSuccess={({ numPages }) => {
          setLoadError(null);
          onDocumentLoaded?.(numPages);
        }}
        onLoadError={(e) => setLoadError(e.message)}
      >
        <div
          ref={pageWrapRef}
          className="relative rounded shadow-2xl ring-1 ring-black/30"
          onClick={handleTextLayerClick}
          style={{ background: '#FFF' }}
        >
          <Page
            pageNumber={page}
            scale={scale}
            renderTextLayer={true}
            renderAnnotationLayer={false}
            onLoadSuccess={(p) => {
              // Salviamo la dimensione "naturale" della pagina (a scale = 1).
              // p.width e p.height sono nelle "user units" di PDF; con
              // scale = 1 react-pdf renderizza esattamente quella size in px.
              setPageNatural({ w: p.originalWidth ?? p.width, h: p.originalHeight ?? p.height });
            }}
            loading={
              <div
                className="flex items-center justify-center bg-slate-100"
                style={{ width: renderW || 400, height: renderH || 300 }}
              >
                <Loader2 className="h-5 w-5 animate-spin text-slate-500" aria-hidden="true" />
              </div>
            }
          />

          {/* TextLayer pointer-events toggle in base alla modalità */}
          <style>{`
            .annotator-pdf-wrap .react-pdf__Page__textContent {
              pointer-events: ${mode === 'text' ? 'auto' : 'none'};
              user-select: ${mode === 'text' ? 'text' : 'none'};
              cursor: ${mode === 'text' ? (textTool === 'comment' ? 'crosshair' : 'text') : 'default'};
            }
            .annotator-pdf-wrap .react-pdf__Page__textContent ::selection {
              background: ${mode === 'text' && textTool !== 'comment' ? color : 'transparent'};
              opacity: 0.4;
            }
          `}</style>

          <div className="annotator-pdf-wrap absolute inset-0">
            {/* Konva overlay — pointer-events on/off in base alla modalità */}
            {pageNatural ? (
              <div
                className="absolute inset-0"
                style={{
                  pointerEvents: mode === 'draw' ? 'auto' : 'none',
                }}
              >
                <Stage
                  width={renderW}
                  height={renderH}
                  scaleX={scale}
                  scaleY={scale}
                  onMouseDown={handleDrawDown}
                  onMouseMove={handleDrawMove}
                  onMouseUp={handleDrawUp}
                  onTouchStart={handleDrawDown}
                  onTouchMove={handleDrawMove}
                  onTouchEnd={handleDrawUp}
                  style={{
                    touchAction: mode === 'draw' ? 'none' : 'auto',
                    cursor: mode === 'draw' ? cursorFor(drawingTool, !!readOnly) : 'default',
                  }}
                >
                  <Layer>
                    {state.shapes.map((s) => (
                      <RenderShape
                        key={s.id}
                        shape={s}
                        commentIndex={isComment(s) ? commentIndex.get(s.id) : undefined}
                        listening={mode === 'text' && isComment(s)}
                      />
                    ))}
                    {state.drawing ? <RenderShape shape={state.drawing} /> : null}
                  </Layer>
                </Stage>
              </div>
            ) : null}
          </div>

          {/* Input overlay per text (drawing) o comment (testo) */}
          {textInput ? (
            <input
              type="text"
              autoFocus
              value={textInput.value}
              onChange={(e) => setTextInput({ ...textInput, value: e.target.value })}
              onBlur={() => (mode === 'text' && textTool === 'comment' ? commitComment() : commitDrawingText())}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  if (mode === 'text' && textTool === 'comment') commitComment();
                  else commitDrawingText();
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  setTextInput(null);
                }
              }}
              placeholder={
                mode === 'text' && textTool === 'comment'
                  ? 'Commento…'
                  : 'Testo annotazione…'
              }
              className="absolute z-10 rounded border-2 bg-white px-1 py-0.5 text-sm font-medium text-slate-900 shadow"
              style={{
                left: textInput.x * scale,
                top: textInput.y * scale,
                borderColor: color,
                color,
                minWidth: 160,
              }}
            />
          ) : null}
        </div>
      </Document>

      {loadError ? (
        <p className="mt-3 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
          Errore: {loadError}
        </p>
      ) : null}
    </div>
  );
}

function isShapeEmpty(s: Shape): boolean {
  switch (s.type) {
    case 'line':
    case 'highlight':
      return s.points.length < 4;
    case 'arrow':
      return Math.hypot(s.to.x - s.from.x, s.to.y - s.from.y) < 3;
    case 'rect':
      return Math.abs(s.width) < 3 || Math.abs(s.height) < 3;
    case 'ellipse':
      return s.radiusX < 3 || s.radiusY < 3;
    case 'text':
      return s.text.trim().length === 0;
    default:
      return false;
  }
}

function cursorFor(tool: DrawingTool, readOnly: boolean): string {
  if (readOnly) return 'default';
  switch (tool) {
    case 'text':
      return 'text';
    case 'eraser':
      return 'cell';
    default:
      return 'crosshair';
  }
}
