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
import { Stage, Layer, Image as KImage, Text as KText } from 'react-konva';
import { Loader2, Check, X as XIcon, Type as TypeIcon } from 'lucide-react';

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

export interface PhotoCanvasHandle {
  /**
   * Esporta lo stage Konva come immagine "flattenata" alla risoluzione
   * piena del canvas di riferimento. Ritorna un Blob (JPEG) o null se
   * lo stage non è ancora montato/l'immagine non è caricata.
   */
  exportFlattenedBlob(options?: {
    mimeType?: string;
    quality?: number;
  }): Promise<Blob | null>;
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

export const PhotoCanvas = React.forwardRef<PhotoCanvasHandle, PhotoCanvasProps>(
  function PhotoCanvas(props, forwardedRef) {
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

  // Ref allo Stage Konva per export
  const stageRef = React.useRef<any>(null);

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

  /**
   * Editor testo: gestisce sia nuovo testo (editingId undef) che modifica
   * di un testo esistente (editingId = shape.id). Mantiene anche fontSize
   * e color locali — slegati dalla toolbar, così l'utente può variare la
   * dimensione del singolo testo senza cambiare gli altri tool.
   */
  const [textInput, setTextInput] = React.useState<{
    x: number;
    y: number;
    value: string;
    fontSize: number;
    color: string;
    editingId?: string;
  } | null>(null);

  const FONT_PRESETS = [
    { label: 'S', value: 20 },
    { label: 'M', value: 32 },
    { label: 'L', value: 48 },
    { label: 'XL', value: 72 },
  ] as const;
  const TEXT_COLORS = ['#EF4444', '#F59E0B', '#FACC15', '#10B981', '#3B82F6', '#0F172A', '#FFFFFF'];

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
        // Apre editor "nuovo testo" alla posizione del tap. Default font M.
        setTextInput({
          x,
          y,
          value: '',
          fontSize: 32,
          color,
        });
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
    if (!value) {
      setTextInput(null);
      return;
    }
    const next = {
      id: textInput.editingId ?? newShapeId(),
      type: 'text' as const,
      color: textInput.color,
      strokeWidth: 1,
      x: textInput.x,
      y: textInput.y,
      text: value,
      fontSize: textInput.fontSize,
    };
    if (textInput.editingId) {
      state.replace(textInput.editingId, next);
    } else {
      state.commit(next);
    }
    setTextInput(null);
  };

  const openTextEditorForShape = (shapeId: string) => {
    const s = state.shapes.find((s) => s.id === shapeId);
    if (!s || s.type !== 'text') return;
    setTextInput({
      x: s.x,
      y: s.y,
      value: s.text,
      fontSize: s.fontSize,
      color: s.color,
      editingId: s.id,
    });
  };

  const deleteTextShape = () => {
    if (!textInput?.editingId) return;
    state.remove([textInput.editingId]);
    setTextInput(null);
  };

  /** Drag end di un text shape: salva la nuova posizione. */
  const onTextDragEnd = (shapeId: string, newX: number, newY: number) => {
    const s = state.shapes.find((s) => s.id === shapeId);
    if (!s || s.type !== 'text') return;
    state.replace(shapeId, { ...s, x: newX, y: newY });
  };

  // Imperative handle: il parent (PhotoAnnotator) lo usa per ottenere il
  // render "flatten" (immagine + annotazioni) da uploadare come nuova versione.
  React.useImperativeHandle(forwardedRef, () => ({
    exportFlattenedBlob: async ({ mimeType = 'image/jpeg', quality = 0.92 } = {}) => {
      const stage = stageRef.current;
      if (!stage || !img) return null;
      // pixelRatio=1 perché lo Stage è già rasterizzato alla risoluzione di
      // riferimento (scale gestisce il fit). Per export piena risoluzione
      // useremmo refSize.w / stage.width, ma stage interno alla scala 1:1
      // del refSize → pixelRatio = 1/scale per export full res.
      const fullResRatio = scale > 0 ? 1 / scale : 1;
      const dataUrl: string = stage.toDataURL({
        mimeType,
        quality,
        pixelRatio: fullResRatio,
      });
      const res = await fetch(dataUrl);
      return res.blob();
    },
  }));

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
            ref={stageRef}
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
            {/* Layer interattivo per i testi: drag + tap per editare.
                Attivo solo quando il tool corrente è 'text'. */}
            {tool === 'text' && !readOnly && (
              <Layer>
                {state.shapes
                  .filter((s) => s.type === 'text')
                  .map((s) =>
                    s.type === 'text' ? (
                      <KText
                        key={`int-${s.id}`}
                        x={s.x}
                        y={s.y}
                        text={s.text}
                        fontSize={s.fontSize}
                        fontStyle="bold"
                        fill="transparent"
                        draggable
                        onClick={() => openTextEditorForShape(s.id)}
                        onTap={() => openTextEditorForShape(s.id)}
                        onDragEnd={(e) =>
                          onTextDragEnd(s.id, e.target.x(), e.target.y())
                        }
                        // Hit area generosa: il testo è "trasparente" ma
                        // l'area cliccabile copre la bounding box reale.
                      />
                    ) : null,
                  )}
              </Layer>
            )}
          </Stage>

          {textInput ? (
            <TextEditorPopover
              value={textInput.value}
              fontSize={textInput.fontSize}
              color={textInput.color}
              fontPresets={FONT_PRESETS}
              colors={TEXT_COLORS}
              isEditing={Boolean(textInput.editingId)}
              previewLeft={Math.min(
                textInput.x * scale,
                Math.max(0, stageW - 280),
              )}
              previewTop={Math.max(0, textInput.y * scale - 12)}
              onChange={(patch) =>
                setTextInput((prev) => (prev ? { ...prev, ...patch } : prev))
              }
              onConfirm={commitText}
              onCancel={() => setTextInput(null)}
              onDelete={textInput.editingId ? deleteTextShape : undefined}
            />
          ) : null}
        </div>
      )}
    </div>
  );
});

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

/* ──────────────────────────────────────────────────────────────────────── */
/*  Text editor popover                                                     */
/* ──────────────────────────────────────────────────────────────────────── */

interface TextEditorPopoverProps {
  value: string;
  fontSize: number;
  color: string;
  fontPresets: ReadonlyArray<{ label: string; value: number }>;
  colors: readonly string[];
  isEditing: boolean;
  previewLeft: number;
  previewTop: number;
  onChange: (patch: { value?: string; fontSize?: number; color?: string }) => void;
  onConfirm: () => void;
  onCancel: () => void;
  onDelete?: () => void;
}

function TextEditorPopover({
  value,
  fontSize,
  color,
  fontPresets,
  colors,
  isEditing,
  previewLeft,
  previewTop,
  onChange,
  onConfirm,
  onCancel,
  onDelete,
}: TextEditorPopoverProps) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  return (
    <div
      role="dialog"
      aria-label={isEditing ? 'Modifica testo' : 'Nuovo testo'}
      className="absolute z-20 w-[260px] overflow-hidden rounded-lg border border-slate-300 bg-white text-slate-900 shadow-2xl"
      style={{ left: previewLeft, top: previewTop }}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="flex items-center gap-1.5 border-b border-slate-200 bg-slate-50 px-2.5 py-1.5">
        <TypeIcon className="h-3.5 w-3.5 text-slate-500" aria-hidden="true" />
        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
          {isEditing ? 'Modifica testo' : 'Nuovo testo'}
        </span>
      </div>

      {/* Input testo */}
      <div className="p-2">
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => onChange({ value: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              onConfirm();
            } else if (e.key === 'Escape') {
              e.preventDefault();
              onCancel();
            }
          }}
          placeholder="Scrivi qui…"
          className="block w-full rounded-md border border-slate-200 bg-white px-2.5 py-2 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/30"
          style={{ color }}
        />
      </div>

      {/* Font size picker */}
      <div className="border-t border-slate-100 px-2.5 py-2">
        <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-slate-500">
          Dimensione
        </p>
        <div className="flex items-center gap-1">
          {fontPresets.map((p) => {
            const active = fontSize === p.value;
            return (
              <button
                key={p.value}
                type="button"
                onClick={() => onChange({ fontSize: p.value })}
                className={
                  'flex h-8 flex-1 items-center justify-center rounded-md text-xs font-semibold transition-colors ' +
                  (active
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200')
                }
                aria-pressed={active}
                aria-label={`Dimensione ${p.label} (${p.value}px)`}
              >
                {p.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Color picker */}
      <div className="border-t border-slate-100 px-2.5 py-2">
        <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-slate-500">
          Colore
        </p>
        <div className="flex items-center gap-1.5">
          {colors.map((c) => {
            const active = c === color;
            return (
              <button
                key={c}
                type="button"
                onClick={() => onChange({ color: c })}
                className={
                  'relative h-7 w-7 rounded-full border-2 transition ' +
                  (active
                    ? 'border-slate-900 shadow ring-2 ring-primary/40'
                    : 'border-slate-200 hover:border-slate-400')
                }
                style={{ backgroundColor: c }}
                aria-pressed={active}
                aria-label={`Colore ${c}`}
              />
            );
          })}
        </div>
      </div>

      {/* Action bar */}
      <div className="flex items-center justify-between gap-1 border-t border-slate-200 bg-slate-50 px-2 py-2">
        {onDelete ? (
          <button
            type="button"
            onClick={onDelete}
            className="rounded-md px-2 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10"
          >
            Elimina
          </button>
        ) : (
          <span />
        )}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onCancel}
            className="flex h-8 items-center gap-1 rounded-md border border-slate-200 px-2.5 text-xs font-medium text-slate-700 hover:bg-white"
          >
            <XIcon className="h-3.5 w-3.5" aria-hidden="true" />
            Annulla
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={!value.trim()}
            className="flex h-8 items-center gap-1 rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground transition hover:opacity-95 disabled:opacity-40"
          >
            <Check className="h-3.5 w-3.5" aria-hidden="true" />
            Conferma
          </button>
        </div>
      </div>
    </div>
  );
}
