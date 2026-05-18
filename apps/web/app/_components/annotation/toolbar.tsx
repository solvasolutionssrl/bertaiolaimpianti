'use client';

/**
 * Toolbar condivisa annotation.
 *
 * Due "set" di tool selezionabili:
 *  - drawing: pencil/arrow/rect/ellipse/text/highlight/eraser (foto + PDF disegno)
 *  - text:    highlight-text/underline-text/strike-text/comment (PDF testo)
 *
 * Layout:
 *  - >= md: sidebar verticale a sinistra del canvas (w-16/w-20)
 *  - < md:  barra orizzontale in fondo (sticky bottom, safe-area aware)
 *
 * Sotto i tools: palette colori + stroke width + undo/redo.
 *
 * Tool selezionato:
 *  - bg-primary text-primary-foreground
 *  - glow arancio via ring-2 ring-accent
 */

import * as React from 'react';
import {
  Pencil,
  ArrowRight,
  Square,
  Circle,
  Type as TypeIcon,
  Highlighter,
  Eraser,
  Undo2,
  Redo2,
  Underline,
  Strikethrough,
  MessageSquare,
} from 'lucide-react';

import { ColorPalette, StrokeWidthPicker } from './color-palette';
import type { DrawingTool, PdfTextTool } from './types';

type AnyTool = DrawingTool | PdfTextTool;

export interface AnnotationToolbarProps {
  /** Set di tool da mostrare (cambia in base alla modalità PDF text/draw). */
  mode: 'drawing' | 'pdf-text';
  tool: AnyTool;
  onTool: (t: AnyTool) => void;
  color: string;
  onColor: (c: string) => void;
  strokeWidth: number;
  onStrokeWidth: (w: number) => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  /** Orientamento layout. Default: derivato da media query. */
  orientation?: 'horizontal' | 'vertical';
}

interface ToolDef {
  id: AnyTool;
  label: string;
  Icon: typeof Pencil;
}

const DRAWING_TOOLS: ToolDef[] = [
  { id: 'pencil', label: 'Matita', Icon: Pencil },
  { id: 'arrow', label: 'Freccia', Icon: ArrowRight },
  { id: 'rect', label: 'Rettangolo', Icon: Square },
  { id: 'ellipse', label: 'Ellisse', Icon: Circle },
  { id: 'text', label: 'Testo', Icon: TypeIcon },
  { id: 'highlight', label: 'Evidenziatore', Icon: Highlighter },
  { id: 'eraser', label: 'Gomma', Icon: Eraser },
];

const PDF_TEXT_TOOLS: ToolDef[] = [
  { id: 'text-highlight', label: 'Evidenzia testo', Icon: Highlighter },
  { id: 'text-underline', label: 'Sottolinea testo', Icon: Underline },
  { id: 'text-strike', label: 'Barra testo', Icon: Strikethrough },
  { id: 'comment', label: 'Commento', Icon: MessageSquare },
];

export function AnnotationToolbar(props: AnnotationToolbarProps) {
  const {
    mode,
    tool,
    onTool,
    color,
    onColor,
    strokeWidth,
    onStrokeWidth,
    onUndo,
    onRedo,
    canUndo,
    canRedo,
  } = props;

  const tools = mode === 'drawing' ? DRAWING_TOOLS : PDF_TEXT_TOOLS;

  return (
    <aside
      role="toolbar"
      aria-label="Strumenti annotazione"
      className={[
        // mobile bottom bar
        'order-2 flex shrink-0 items-stretch gap-1 border-t border-slate-800 bg-slate-900/95 px-2 py-2 backdrop-blur',
        // desktop sidebar
        'md:order-1 md:w-64 md:flex-col md:items-stretch md:gap-3 md:border-r md:border-t-0 md:p-3',
        // safe area iOS
        'pb-[max(0.5rem,env(safe-area-inset-bottom))]',
      ].join(' ')}
    >
      {/* TOOLS */}
      <div className="flex flex-1 items-center gap-1 overflow-x-auto md:flex-col md:items-stretch md:overflow-visible">
        {tools.map(({ id, label, Icon }) => {
          const active = tool === id;
          return (
            <button
              key={id}
              type="button"
              aria-label={label}
              aria-pressed={active}
              title={label}
              onClick={() => onTool(id)}
              className={[
                'group relative flex h-11 min-w-[44px] items-center justify-center gap-2 rounded-md px-2 text-sm font-medium transition-all md:justify-start md:px-3',
                active
                  ? 'bg-primary text-primary-foreground shadow-sm ring-2 ring-accent ring-offset-2 ring-offset-slate-900'
                  : 'text-slate-200 hover:bg-slate-800/80',
              ].join(' ')}
            >
              <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
              <span className="hidden md:inline">{label}</span>
            </button>
          );
        })}
      </div>

      {/* DIVIDER mobile vertical bar */}
      <div className="hidden md:block md:h-px md:bg-slate-800" />

      {/* COLOR PALETTE */}
      <div className="hidden items-center md:flex md:flex-col md:items-start md:gap-2">
        <span className="text-[10px] font-medium uppercase tracking-wider text-slate-400">
          Colore
        </span>
        <ColorPalette value={color} onChange={onColor} orientation="column" />
      </div>

      {/* STROKE WIDTH (solo modalità drawing) */}
      {mode === 'drawing' ? (
        <div className="hidden items-center md:flex md:flex-col md:items-start md:gap-2">
          <span className="text-[10px] font-medium uppercase tracking-wider text-slate-400">
            Tratto
          </span>
          <StrokeWidthPicker value={strokeWidth} onChange={onStrokeWidth} />
        </div>
      ) : null}

      {/* Undo / Redo — su mobile in fondo alla riga, su desktop in fondo alla colonna */}
      <div className="flex shrink-0 items-center gap-1 md:mt-auto md:justify-between">
        <button
          type="button"
          aria-label="Annulla"
          title="Annulla (⌘Z)"
          onClick={onUndo}
          disabled={!canUndo}
          className="flex h-11 w-11 items-center justify-center rounded-md bg-slate-800/60 text-slate-100 transition-colors hover:bg-slate-700 disabled:opacity-30"
        >
          <Undo2 className="h-5 w-5" aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label="Ripeti"
          title="Ripeti (⌘⇧Z)"
          onClick={onRedo}
          disabled={!canRedo}
          className="flex h-11 w-11 items-center justify-center rounded-md bg-slate-800/60 text-slate-100 transition-colors hover:bg-slate-700 disabled:opacity-30"
        >
          <Redo2 className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>

      {/* Mobile-only: palette inline compact */}
      <div className="ml-1 flex shrink-0 items-center gap-1 md:hidden">
        <ColorPalette value={color} onChange={onColor} />
      </div>
    </aside>
  );
}
