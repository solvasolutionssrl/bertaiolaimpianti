'use client';

/**
 * RenderShape — riproduzione vettoriale di una `Shape` su Konva.
 *
 * Estratto dal vecchio `photo-annotation-editor.tsx` per essere riusato
 * sia da PhotoCanvas sia da PdfCanvas (overlay sopra pagina pdf.js).
 *
 * I tipi PDF-specifici (`highlight-text` / `underline-text` / `strike-text`
 * / `comment`) sono renderizzati come overlay grafico nel layer Konva:
 *  - highlight-text → Rect per ogni rect, fillonly, opacity 0.4
 *  - underline-text → Linea sotto al rect
 *  - strike-text    → Linea a metà altezza
 *  - comment        → cerchio pin numerato (il numero viene gestito dal
 *                      consumer in fase di render: passiamo un `commentIndex` opt)
 */

import * as React from 'react';
import {
  Line,
  Arrow,
  Rect,
  Ellipse,
  Text as KText,
  Group,
  Circle as KCircle,
} from 'react-konva';

import {
  HIGHLIGHT_OPACITY,
  type Shape,
} from '../../_lib/annotation-shapes';

export interface RenderShapeProps {
  shape: Shape;
  /** Per i comment: numero 1-based mostrato nel pin. */
  commentIndex?: number;
  /** Se true → eventi mouse abilitati (utile per hover su pin commento). */
  listening?: boolean;
  onCommentClick?: (id: string) => void;
}

export function RenderShape(props: RenderShapeProps) {
  const { shape, commentIndex, listening = false, onCommentClick } = props;
  switch (shape.type) {
    case 'line':
      return (
        <Line
          points={shape.points}
          stroke={shape.color}
          strokeWidth={shape.strokeWidth}
          opacity={shape.opacity ?? 1}
          tension={0.4}
          lineCap="round"
          lineJoin="round"
          listening={false}
        />
      );
    case 'highlight':
      return (
        <Line
          points={shape.points}
          stroke={shape.color}
          strokeWidth={shape.strokeWidth}
          opacity={shape.opacity ?? HIGHLIGHT_OPACITY}
          tension={0.2}
          lineCap="round"
          lineJoin="round"
          listening={false}
        />
      );
    case 'arrow':
      return (
        <Arrow
          points={[shape.from.x, shape.from.y, shape.to.x, shape.to.y]}
          stroke={shape.color}
          fill={shape.color}
          strokeWidth={shape.strokeWidth}
          pointerLength={Math.max(10, shape.strokeWidth * 3)}
          pointerWidth={Math.max(10, shape.strokeWidth * 3)}
          opacity={shape.opacity ?? 1}
          lineCap="round"
          lineJoin="round"
          listening={false}
        />
      );
    case 'rect':
      return (
        <Rect
          x={shape.x}
          y={shape.y}
          width={shape.width}
          height={shape.height}
          stroke={shape.color}
          strokeWidth={shape.strokeWidth}
          opacity={shape.opacity ?? 1}
          listening={false}
        />
      );
    case 'ellipse':
      return (
        <Ellipse
          x={shape.cx}
          y={shape.cy}
          radiusX={shape.radiusX}
          radiusY={shape.radiusY}
          stroke={shape.color}
          strokeWidth={shape.strokeWidth}
          opacity={shape.opacity ?? 1}
          listening={false}
        />
      );
    case 'text':
      return (
        <Group>
          <KText
            x={shape.x}
            y={shape.y}
            text={shape.text}
            fontSize={shape.fontSize}
            fontStyle="bold"
            fill={shape.color}
            stroke={shape.color === '#FFFFFF' ? '#0F172A' : '#FFFFFF'}
            strokeWidth={Math.max(1, shape.fontSize * 0.04)}
            fillAfterStrokeEnabled
            opacity={shape.opacity ?? 1}
            listening={false}
          />
        </Group>
      );
    case 'highlight-text':
      return (
        <Group listening={false}>
          {shape.rects.map((r, i) => (
            <Rect
              key={i}
              x={r.x}
              y={r.y}
              width={r.width}
              height={r.height}
              fill={shape.color}
              opacity={shape.opacity ?? HIGHLIGHT_OPACITY}
              listening={false}
            />
          ))}
        </Group>
      );
    case 'underline-text':
      return (
        <Group listening={false}>
          {shape.rects.map((r, i) => (
            <Line
              key={i}
              points={[r.x, r.y + r.height, r.x + r.width, r.y + r.height]}
              stroke={shape.color}
              strokeWidth={Math.max(1, shape.strokeWidth ?? 2)}
              listening={false}
            />
          ))}
        </Group>
      );
    case 'strike-text':
      return (
        <Group listening={false}>
          {shape.rects.map((r, i) => (
            <Line
              key={i}
              points={[r.x, r.y + r.height / 2, r.x + r.width, r.y + r.height / 2]}
              stroke={shape.color}
              strokeWidth={Math.max(1, shape.strokeWidth ?? 2)}
              listening={false}
            />
          ))}
        </Group>
      );
    case 'comment':
      return (
        <Group
          x={shape.anchor.x}
          y={shape.anchor.y}
          listening={listening}
          onClick={() => onCommentClick?.(shape.id)}
          onTap={() => onCommentClick?.(shape.id)}
        >
          {/* Drop shadow leggera per stacco dal PDF bianco */}
          <KCircle
            radius={13}
            fill="#000"
            opacity={0.2}
            offsetX={-1}
            offsetY={1}
            listening={false}
          />
          <KCircle radius={12} fill={shape.color} listening={false} />
          <KCircle radius={12} stroke="#FFF" strokeWidth={1.5} listening={false} />
          {commentIndex !== undefined ? (
            <KText
              text={String(commentIndex)}
              fontSize={12}
              fontStyle="bold"
              fill="#FFFFFF"
              listening={false}
              align="center"
              verticalAlign="middle"
              width={24}
              height={24}
              offsetX={12}
              offsetY={12}
            />
          ) : null}
        </Group>
      );
  }
}
