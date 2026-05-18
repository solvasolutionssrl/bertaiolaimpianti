'use client';

/**
 * ColorPalette + StrokeWidthPicker — controlli condivisi.
 *
 * Estratti dalla toolbar legacy per essere riusati in PdfAnnotator
 * (modalità Disegno) e nel viewer foto.
 */

import * as React from 'react';

import {
  PALETTE_BASE,
  STROKE_WIDTHS,
} from '../../_lib/annotation-shapes';

export interface ColorPaletteProps {
  value: string;
  onChange: (color: string) => void;
  /** Layout: row (default) o column (sidebar verticale wrap). */
  orientation?: 'row' | 'column';
}

export function ColorPalette({
  value,
  onChange,
  orientation = 'row',
}: ColorPaletteProps) {
  return (
    <div
      role="radiogroup"
      aria-label="Colore"
      className={[
        'flex shrink-0 items-center gap-1.5',
        orientation === 'column' ? 'flex-wrap' : '',
      ].join(' ')}
    >
      {PALETTE_BASE.map((c) => {
        const active = c === value;
        return (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={`Colore ${c}`}
            onClick={() => onChange(c)}
            className={[
              'relative h-8 w-8 rounded-full border-2 transition-all',
              active
                ? 'scale-110 border-white shadow-[0_0_0_2px_hsl(var(--accent))]'
                : 'border-slate-700/40 hover:scale-105 hover:border-slate-500',
            ].join(' ')}
            style={{ backgroundColor: c }}
          />
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------
// Stroke width: 3 preset visibili (S/M/L) invece di slider — più chiari
// su touch device, più rapidi.
// ---------------------------------------------------------------------

export interface StrokeWidthPickerProps {
  value: number;
  onChange: (w: number) => void;
  orientation?: 'row' | 'column';
}

/** Mostriamo solo i 3 valori più utili: 2px, 4px, 8px. Il 4° (16) era
 *  rumoroso e quasi mai scelto. */
const PRESETS = STROKE_WIDTHS.slice(0, 3);

export function StrokeWidthPicker({
  value,
  onChange,
}: StrokeWidthPickerProps) {
  return (
    <div className="flex shrink-0 items-center gap-1">
      {PRESETS.map((w, i) => {
        const labels = ['S', 'M', 'L'] as const;
        const active = value === w;
        return (
          <button
            key={w}
            type="button"
            aria-label={`Tratto ${labels[i]} (${w}px)`}
            aria-pressed={active}
            onClick={() => onChange(w)}
            className={[
              'flex h-9 w-9 items-center justify-center rounded-md text-xs font-semibold transition-colors',
              active
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'bg-slate-800/70 text-slate-200 hover:bg-slate-700',
            ].join(' ')}
          >
            <span
              className="block rounded-full bg-current"
              style={{ width: Math.min(w * 1.5, 18), height: Math.min(w * 1.5, 18) }}
            />
          </button>
        );
      })}
    </div>
  );
}
