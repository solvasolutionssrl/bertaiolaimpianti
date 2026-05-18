/**
 * Modello dati delle annotazioni foto.
 *
 * Tutte le coordinate sono in PIXEL relativi al canvas di riferimento
 * `width_px` × `height_px` salvato nella riga `file_annotations`. Il viewer
 * riscala proporzionalmente in fase di rendering.
 *
 * Discriminator: `type`.
 *  - `line`      → tratto a mano libera (freehand pencil). `points: [x1,y1,x2,y2,...]`.
 *  - `arrow`     → freccia con punta. `from: {x,y}`, `to: {x,y}`.
 *  - `rect`      → rettangolo. `x, y, width, height` (può avere width/height negativi durante il drag, normalizzato a save).
 *  - `ellipse`   → ellisse. `cx, cy, radiusX, radiusY`.
 *  - `text`      → testo. `x, y, text, fontSize`.
 *  - `highlight` → freehand semi-trasparente (highlighter). Stesso modello di `line` ma con alpha più basso e tratto largo.
 *
 * Convenzione colore: hex `#RRGGBB`. Alpha gestito a livello di tipo
 * (highlight forza 0.4) o esplicito su shape (`opacity`).
 */

export type ShapeId = string;

export interface ShapeBase {
  /** Id locale (uuid v4 client-side) per undo/redo + selezione/eraser. */
  id: ShapeId;
  /** Hex `#RRGGBB`. */
  color: string;
  /** Larghezza tratto in px alla scala del canvas di riferimento. */
  strokeWidth: number;
  /** Opacità 0..1. Highlighter ≈ 0.4. Default 1. */
  opacity?: number;
}

export interface LineShape extends ShapeBase {
  type: 'line';
  /** Flatten array `[x1,y1,x2,y2,...]` come da Konva.Line. */
  points: number[];
  /** Pressione media (Apple Pencil), se disponibile. */
  pressure?: number;
}

export interface ArrowShape extends ShapeBase {
  type: 'arrow';
  from: { x: number; y: number };
  to: { x: number; y: number };
}

export interface RectShape extends ShapeBase {
  type: 'rect';
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface EllipseShape extends ShapeBase {
  type: 'ellipse';
  cx: number;
  cy: number;
  radiusX: number;
  radiusY: number;
}

export interface TextShape extends ShapeBase {
  type: 'text';
  x: number;
  y: number;
  text: string;
  fontSize: number;
}

export interface HighlightShape extends ShapeBase {
  type: 'highlight';
  points: number[];
}

// ---------------------------------------------------------------------
// Shape PDF-specifiche: highlight/underline/strike di testo + comment.
//
// Note di coordinate: tutte le rects/anchor sono in pixel relativi al
// canvas di riferimento della **pagina corrente** (width_px × height_px
// salvati in `file_annotations`). La pagina vive sulla colonna `page` a
// livello di row, NON sullo shape, per evitare ambiguità: ogni row di
// file_annotations è (file_ref_id, page, version) → layer_json contiene
// solo shapes di QUELLA pagina.
//
// Mantengo `page` opzionale anche nello shape come ridondanza
// difensiva (utile in caso di future API che ritornano shapes di pagine
// diverse mescolate, es. ricerche full-text di commenti).
// ---------------------------------------------------------------------

export interface Rect2D {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PdfTextRangeShape extends ShapeBase {
  type: 'highlight-text' | 'underline-text' | 'strike-text';
  /** Pagina 1-based — ridondante con la row, ma utile per API miste. */
  page?: number;
  /** Lista di bounding box dei caratteri selezionati (uno per riga di testo). */
  rects: Rect2D[];
}

export interface CommentShape extends ShapeBase {
  type: 'comment';
  page?: number;
  anchor: { x: number; y: number };
  text: string;
}

export type Shape =
  | LineShape
  | ArrowShape
  | RectShape
  | EllipseShape
  | TextShape
  | HighlightShape
  | PdfTextRangeShape
  | CommentShape;

/**
 * Palette base — 6 colori brand-friendly.
 *  - rosso/giallo: difetti / attenzione
 *  - verde:        OK
 *  - blu:          neutro tecnico
 *  - nero/bianco:  testo overlay (sfondo chiaro/scuro)
 */
export const PALETTE_BASE: readonly string[] = Object.freeze([
  '#EF4444', // red-500
  '#F59E0B', // amber-500
  '#10B981', // emerald-500
  '#3B82F6', // blue-500
  '#0F172A', // slate-900
  '#FFFFFF', // white
]);

/** Larghezze tratto preset (px @ canvas di riferimento). */
export const STROKE_WIDTHS: readonly number[] = Object.freeze([2, 4, 8, 16]);

/** Default sensati per nuovo editor. */
export const DEFAULT_COLOR: string = '#EF4444';
export const DEFAULT_STROKE: number = 4;
export const HIGHLIGHT_OPACITY: number = 0.4;
export const HIGHLIGHT_STROKE_MULTIPLIER: number = 4;

// ---------------------------------------------------------------------
// Type guards
// ---------------------------------------------------------------------

export function isLine(s: Shape): s is LineShape {
  return s.type === 'line';
}
export function isArrow(s: Shape): s is ArrowShape {
  return s.type === 'arrow';
}
export function isRect(s: Shape): s is RectShape {
  return s.type === 'rect';
}
export function isEllipse(s: Shape): s is EllipseShape {
  return s.type === 'ellipse';
}
export function isText(s: Shape): s is TextShape {
  return s.type === 'text';
}
export function isHighlight(s: Shape): s is HighlightShape {
  return s.type === 'highlight';
}
export function isPdfTextRange(s: Shape): s is PdfTextRangeShape {
  return (
    s.type === 'highlight-text' ||
    s.type === 'underline-text' ||
    s.type === 'strike-text'
  );
}
export function isComment(s: Shape): s is CommentShape {
  return s.type === 'comment';
}

// ---------------------------------------------------------------------
// Serializzazione (round-trip JSON)
// ---------------------------------------------------------------------

/**
 * Le shapes sono già JSON-friendly: serializeShape è essenzialmente
 * un clone difensivo + normalizzazione (es. width/height negativi
 * per i rect ridisegnati "al contrario").
 */
export function serializeShape(shape: Shape): Shape {
  switch (shape.type) {
    case 'rect': {
      const x = shape.width < 0 ? shape.x + shape.width : shape.x;
      const y = shape.height < 0 ? shape.y + shape.height : shape.y;
      return {
        ...shape,
        x,
        y,
        width: Math.abs(shape.width),
        height: Math.abs(shape.height),
      };
    }
    case 'ellipse':
      return {
        ...shape,
        radiusX: Math.abs(shape.radiusX),
        radiusY: Math.abs(shape.radiusY),
      };
    default:
      return { ...shape };
  }
}

/**
 * Deserializza una shape generica dal DB. Best-effort: scarta shape
 * con `type` sconosciuto (forward-compatibility — uno schema futuro
 * potrebbe aggiungere tipi non noti al viewer corrente).
 */
export function deserializeShape(raw: unknown): Shape | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  const type = obj.type;
  if (
    type !== 'line' &&
    type !== 'arrow' &&
    type !== 'rect' &&
    type !== 'ellipse' &&
    type !== 'text' &&
    type !== 'highlight' &&
    type !== 'highlight-text' &&
    type !== 'underline-text' &&
    type !== 'strike-text' &&
    type !== 'comment'
  ) {
    return null;
  }
  return raw as Shape;
}

export function deserializeLayer(raw: unknown): Shape[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map(deserializeShape)
    .filter((s): s is Shape => s !== null);
}

// ---------------------------------------------------------------------
// Utility geometriche
// ---------------------------------------------------------------------

/**
 * Distanza minima fra un punto `(px, py)` e una shape. Usato dall'eraser
 * per decidere se "cancellare" toccando vicino al tratto.
 */
export function distanceToShape(shape: Shape, px: number, py: number): number {
  switch (shape.type) {
    case 'line':
    case 'highlight':
      return distanceToPolyline(shape.points, px, py);
    case 'arrow':
      return distanceToSegment(shape.from.x, shape.from.y, shape.to.x, shape.to.y, px, py);
    case 'rect': {
      const x1 = shape.x;
      const y1 = shape.y;
      const x2 = shape.x + shape.width;
      const y2 = shape.y + shape.height;
      if (px >= x1 && px <= x2 && py >= y1 && py <= y2) return 0;
      return Math.min(
        distanceToSegment(x1, y1, x2, y1, px, py),
        distanceToSegment(x2, y1, x2, y2, px, py),
        distanceToSegment(x2, y2, x1, y2, px, py),
        distanceToSegment(x1, y2, x1, y1, px, py),
      );
    }
    case 'ellipse': {
      // Approssimazione: distanza dal centro normalizzata sui due raggi.
      const dx = (px - shape.cx) / Math.max(shape.radiusX, 1);
      const dy = (py - shape.cy) / Math.max(shape.radiusY, 1);
      const d = Math.sqrt(dx * dx + dy * dy);
      return Math.abs(d - 1) * Math.min(shape.radiusX, shape.radiusY);
    }
    case 'text': {
      // Bounding box approssimato del testo (larghezza ~ char×fontSize×0.6)
      const w = shape.text.length * shape.fontSize * 0.6;
      const h = shape.fontSize * 1.2;
      const x1 = shape.x;
      const y1 = shape.y;
      const x2 = x1 + w;
      const y2 = y1 + h;
      if (px >= x1 && px <= x2 && py >= y1 && py <= y2) return 0;
      return Math.hypot(
        Math.max(x1 - px, 0, px - x2),
        Math.max(y1 - py, 0, py - y2),
      );
    }
    case 'highlight-text':
    case 'underline-text':
    case 'strike-text': {
      let best = Number.POSITIVE_INFINITY;
      for (const r of shape.rects) {
        const x1 = r.x;
        const y1 = r.y;
        const x2 = r.x + r.width;
        const y2 = r.y + r.height;
        const d =
          px >= x1 && px <= x2 && py >= y1 && py <= y2
            ? 0
            : Math.hypot(
                Math.max(x1 - px, 0, px - x2),
                Math.max(y1 - py, 0, py - y2),
              );
        if (d < best) best = d;
      }
      return best;
    }
    case 'comment': {
      return Math.hypot(px - shape.anchor.x, py - shape.anchor.y);
    }
  }
}

function distanceToSegment(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  px: number,
  py: number,
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

function distanceToPolyline(points: number[], px: number, py: number): number {
  let best = Number.POSITIVE_INFINITY;
  for (let i = 0; i + 3 < points.length; i += 2) {
    const d = distanceToSegment(
      points[i]!,
      points[i + 1]!,
      points[i + 2]!,
      points[i + 3]!,
      px,
      py,
    );
    if (d < best) best = d;
  }
  return best;
}

/**
 * Generatore di id locali (no dipendenza da crypto.randomUUID per
 * compatibilità con browser più vecchi del catalogo PWA).
 */
export function newShapeId(): ShapeId {
  return (
    Math.random().toString(36).slice(2, 10) +
    Date.now().toString(36)
  );
}
