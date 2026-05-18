'use client';

/**
 * PhotoCanvas — area di disegno Konva sopra una foto (sfondo immagine).
 *
 * Estratto dal vecchio editor monolitico. È un canvas "puro": riceve
 * shapes + tool/color/stroke dal parent e emette gli eventi di
 * commit/replace tramite il state hook.
 *
 * Coordinate: tutte le shapes sono in pixel relativi al canvas di
 * riferimento (`refSize`). Lo zoom-to-fit `scale` viene applicato dallo
 * Stage Konva, così le shapes restano stabili al resize.
 */

import * as React from 'react';
import { Stage, Layer, Image as KImage } from 'react-konva';
import { Loader2 } from 'lucide-react';

import {
  HIGHLIGHT_OPACITY,
  HIGHLIGHT_STROKE_MULTIPLIER,
  newShapeId,
  serializeShape,
  distanceToShape,
  type Shape,
} from '../../_lib/annotation-shapes';

import { RenderShape } from './render-shape';
import type { DrawingTool } from './types';
import type { AnnotationState } from './hooks/use-annotation-state';

export interface PhotoCanvasProps {
  imageUrl: string;
  state: AnnotationState;
  tool: DrawingTool;
  color: string;
  strokeWidth: number;
  /** Dimensioni canvas di riferimento (default: natural size). */
  width?: number;
  height?: number;
  readOnly?: boolean;
  /** Notifica il parent della dimensione effettiva di riferimento. */
  onRefSize?: (w: number, h: number) => void;
}

function useImage(src: string) {
  const [img, setImg] = React.useState<HTMLImageElement | null>(null);
  const [natural, setNatural] = React.useState<{ w: number; h: number } | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    setImg(null);
    setNatural(null);
    setError(null);
    if (!src) return;
    const el = new window.Image();
    el.crossOrigin = 'anonymous';
    el.onload = () => {
      setImg(el);
      setNatural({ w: el.naturalWidth, h: el.naturalHeight });
    };
    el.onerror = () => setError('Impossibile caricare la foto');
    el.src = src;
    return () => {
      el.onload = null;
      el.onerror = null;
    };
  }, [src]);

  return { img, natural, error };
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

export function PhotoCanvas(props: PhotoCanvasProps) {
  const {
    imageUrl,
    state,
    tool,
    color,
    strokeWidth,
    width,
    height,
    readOnly,
    onRefSize,
  } = props;

  const { img, natural, error: imgError } = useImage(imageUrl);

  const refSize = React.useMemo(() => {
    if (width && height) return { w: width, h: height };
    if (natural) return { w: natural.w, h: natural.h };
    return { w: 1024, h: 768 };
  }, [width, height, natural]);

  React.useEffect(() => {
    if (refSize.w > 0 && refSize.h > 0) onRefSize?.(refSize.w, refSize.h);
  }, [refSize, onRefSize]);

  const containerRef = React.useRef<HTMLDivElement>(null);
  const containerSize = useContainerSize(containerRef);
  const scale = React.useMemo(() => {
    if (containerSize.w === 0 || containerSize.h === 0) return 1;
    return Math.min(containerSize.w / refSize.w, containerSize.h / refSize.h, 1);
  }, [containerSize, refSize]);

  const stageW = Math.round(refSize.w * scale);
  const stageH = Math.round(refSize.h * scale);

  const [textInput, setTextInput] = React.useState<{
    x: number;
    y: number;
    value: string;
  } | null>(null);

  const isPointerDownRef = React.useRef(false);

  const screenToRef = (sx: number, sy: number) => ({ x: sx / scale, y: sy / scale });

  const eraseAt = (x: number, y: number) => {
    const radius = 12;
    const toRemove = state.shapes.filter((s) => distanceToShape(s, x, y) <= radius);
    if (toRemove.length === 0) return;
    state.remove(toRemove.map((s) => s.id));
  };

  const handlePointerDown = (e: any) => {
    if (readOnly) return;
    const stage = e.target.getStage();
    if (!stage) return;
    const pos = stage.getPointerPosition();
    if (!pos) return;
    const { x, y } = screenToRef(pos.x, pos.y);
    isPointerDownRef.current = true;

    const evt = e.evt as PointerEvent;
    const pressure = evt?.pressure && evt.pressure > 0 ? evt.pressure : undefined;
    const baseStroke =
      tool === 'highlight' ? strokeWidth * HIGHLIGHT_STROKE_MULTIPLIER : strokeWidth;
    const effStroke = pressure ? Math.max(1, baseStroke * (0.5 + pressure)) : baseStroke;

    switch (tool) {
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
      case 'text':
        setTextInput({ x, y, value: '' });
        isPointerDownRef.current = false;
        break;
      case 'eraser':
        eraseAt(x, y);
        break;
    }
  };

  const handlePointerMove = (e: any) => {
    if (readOnly) return;
    if (!isPointerDownRef.current) return;
    const stage = e.target.getStage();
    if (!stage) return;
    const pos = stage.getPointerPosition();
    if (!pos) return;
    const { x, y } = screenToRef(pos.x, pos.y);
    if (tool === 'eraser') {
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

  const handlePointerUp = () => {
    if (readOnly) return;
    isPointerDownRef.current = false;
    if (state.drawing) {
      const finalized = serializeShape(state.drawing);
      if (!isShapeEmpty(finalized)) {
        state.commit(finalized);
      }
      state.setDrawing(null);
    }
  };

  const commitText = () => {
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

  return (
    <div
      ref={containerRef}
      className="relative flex h-full w-full items-center justify-center overflow-hidden p-2 md:p-4"
      style={{
        backgroundImage:
          'linear-gradient(45deg, hsl(220 14% 18%) 25%, transparent 25%), linear-gradient(-45deg, hsl(220 14% 18%) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, hsl(220 14% 18%) 75%), linear-gradient(-45deg, transparent 75%, hsl(220 14% 18%) 75%)',
        backgroundSize: '16px 16px',
        backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0',
        backgroundColor: 'hsl(220 14% 22%)',
      }}
    >
      {imgError ? (
        <p className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {imgError}
        </p>
      ) : !img ? (
        <div className="flex flex-col items-center gap-2 text-slate-300">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
          <p className="text-sm">Caricamento foto…</p>
        </div>
      ) : (
        <div
          className="relative rounded-md shadow-2xl ring-1 ring-black/30"
          style={{ width: stageW, height: stageH, background: '#FFF' }}
        >
          <Stage
            width={stageW}
            height={stageH}
            scaleX={scale}
            scaleY={scale}
            onMouseDown={handlePointerDown}
            onMouseMove={handlePointerMove}
            onMouseUp={handlePointerUp}
            onTouchStart={handlePointerDown}
            onTouchMove={handlePointerMove}
            onTouchEnd={handlePointerUp}
            style={{ touchAction: 'none', cursor: cursorFor(tool, !!readOnly) }}
          >
            <Layer listening={false}>
              <KImage image={img} width={refSize.w} height={refSize.h} />
            </Layer>
            <Layer>
              {state.shapes.map((s) => (
                <RenderShape key={s.id} shape={s} />
              ))}
              {state.drawing ? <RenderShape shape={state.drawing} /> : null}
            </Layer>
          </Stage>

          {textInput ? (
            <input
              type="text"
              autoFocus
              value={textInput.value}
              onChange={(e) => setTextInput({ ...textInput, value: e.target.value })}
              onBlur={commitText}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  commitText();
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  setTextInput(null);
                }
              }}
              placeholder="Testo annotazione…"
              className="absolute rounded border-2 bg-white px-1 py-0.5 text-sm font-medium text-slate-900 shadow"
              style={{
                left: textInput.x * scale,
                top: textInput.y * scale,
                borderColor: color,
                color,
                minWidth: 120,
              }}
            />
          ) : null}
        </div>
      )}
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
