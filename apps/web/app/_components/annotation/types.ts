/**
 * Tipi condivisi del framework annotation.
 *
 * Tutti i componenti annotation (foto + PDF) condividono:
 *  - Tool union (sottoinsieme rilevante per la modalità corrente)
 *  - SaveStatus per la status bar
 *  - PdfMode per il segmented control "Testo / Disegno" del PdfAnnotator
 */

import type { Shape } from '../../_lib/annotation-shapes';

/**
 * Tool di disegno disponibili a entrambi gli editor (foto + PDF in
 * modalità "Disegno").
 *
 * Convenzione: l'eraser è semplice "tap on shape" (cfr.
 * distanceToShape) — non è una vera gomma vettoriale.
 */
export type DrawingTool =
  | 'pencil'
  | 'arrow'
  | 'rect'
  | 'ellipse'
  | 'text'
  | 'highlight'
  | 'eraser';

/**
 * Tool della modalità "Testo" PDF — agiscono sul textLayer pdf.js.
 *  - text-highlight : evidenziatore semi-trasparente
 *  - text-underline : underline sottile
 *  - text-strike    : barrato
 *  - comment        : pin numerato + popup (ancora puntuale, non richiede selezione)
 */
export type PdfTextTool =
  | 'text-highlight'
  | 'text-underline'
  | 'text-strike'
  | 'comment';

export type PdfMode = 'text' | 'draw';

export type SaveStatus =
  | { kind: 'idle' }
  | { kind: 'dirty' }
  | { kind: 'saving' }
  | { kind: 'saved'; at: number }
  | { kind: 'error'; message: string };

export interface ShapeLayer {
  shapes: Shape[];
}
