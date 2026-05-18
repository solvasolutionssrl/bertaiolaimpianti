'use client';

/**
 * PhotoAnnotationViewer — read-only stage Konva con foto + shapes.
 *
 * Da usare nelle thumbnail della galleria o nei preview "overlay" senza
 * dover montare l'editor completo. Niente toolbar, niente interaction,
 * solo render.
 *
 * Deve essere caricato via `dynamic(..., { ssr: false })` (Konva =
 * client-only).
 */

import * as React from 'react';
import { Stage, Layer, Image as KImage } from 'react-konva';

import { RenderShape } from './photo-annotation-editor';
import type { Shape } from '../_lib/annotation-shapes';

export interface PhotoAnnotationViewerProps {
  imageUrl: string;
  layer: Shape[];
  /** Canvas di riferimento (coord delle shapes). */
  width: number;
  height: number;
  /** Larghezza in pixel a cui renderizzare (l'altezza è auto, proporzione preservata). */
  displayWidth?: number;
  className?: string;
}

function useImage(src: string): HTMLImageElement | null {
  const [img, setImg] = React.useState<HTMLImageElement | null>(null);
  React.useEffect(() => {
    if (!src) return;
    const el = new window.Image();
    el.crossOrigin = 'anonymous';
    el.onload = () => setImg(el);
    el.src = src;
    return () => {
      el.onload = null;
    };
  }, [src]);
  return img;
}

export function PhotoAnnotationViewer({
  imageUrl,
  layer,
  width,
  height,
  displayWidth,
  className,
}: PhotoAnnotationViewerProps) {
  const img = useImage(imageUrl);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [measured, setMeasured] = React.useState(displayWidth ?? 0);

  React.useEffect(() => {
    if (displayWidth) {
      setMeasured(displayWidth);
      return;
    }
    if (!containerRef.current) return;
    const ro = new ResizeObserver(() => {
      if (!containerRef.current) return;
      setMeasured(containerRef.current.getBoundingClientRect().width);
    });
    ro.observe(containerRef.current);
    setMeasured(containerRef.current.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, [displayWidth]);

  const scale = measured && width ? measured / width : 1;
  const stageW = Math.round(width * scale);
  const stageH = Math.round(height * scale);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ aspectRatio: `${width} / ${height}` }}
    >
      {img && measured > 0 ? (
        <Stage
          width={stageW}
          height={stageH}
          scaleX={scale}
          scaleY={scale}
          listening={false}
          style={{ display: 'block' }}
        >
          <Layer listening={false}>
            <KImage image={img} width={width} height={height} />
          </Layer>
          <Layer listening={false}>
            {layer.map((s) => (
              <RenderShape key={s.id} shape={s} />
            ))}
          </Layer>
        </Stage>
      ) : null}
    </div>
  );
}
