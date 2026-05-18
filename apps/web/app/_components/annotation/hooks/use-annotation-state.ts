'use client';

/**
 * useAnnotationState — stato condiviso shapes + undo/redo + dirty flag.
 *
 * Estratto dall'editor foto monolitico. Riusato sia da PhotoCanvas sia
 * da PdfCanvas. Lo shape "in costruzione" è tenuto separato dal layer
 * committed per non sporcare l'history su ogni pointer-move (la commit
 * avviene su pointerUp).
 *
 * History: stack di snapshot `Shape[]`, max 50, FIFO (più vecchi
 * scartati). Niente diff: per le scene del nostro dominio (decine di
 * shapes) la memoria è trascurabile e il codice è banale.
 */

import * as React from 'react';

import type { Shape } from '../../../_lib/annotation-shapes';

const HISTORY_MAX = 50;

export interface UseAnnotationStateOptions {
  initialShapes?: Shape[];
  /** Notificato ad ogni cambiamento del set di shapes (dirty-tracking). */
  onChange?: (shapes: Shape[]) => void;
}

export interface AnnotationState {
  shapes: Shape[];
  /** Shape attualmente in disegno (pointer-down → pointer-move). */
  drawing: Shape | null;
  setDrawing: (s: Shape | null) => void;
  /** Commit di una nuova shape al layer + push history. */
  commit: (s: Shape) => void;
  /** Sostituisce/aggiorna una shape esistente per id (es. dopo edit testo). */
  replace: (id: string, next: Shape) => void;
  /** Rimuove shapes per id list. */
  remove: (ids: string[]) => void;
  /** Sovrascrive l'intero layer (caricamento iniziale o cambio pagina). */
  reset: (next: Shape[]) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  /** True se il layer è cambiato rispetto al baseline `initialShapes`. */
  dirty: boolean;
}

export function useAnnotationState(
  options: UseAnnotationStateOptions = {},
): AnnotationState {
  const { initialShapes = [], onChange } = options;

  const [shapes, setShapes] = React.useState<Shape[]>(() => [...initialShapes]);
  const [drawing, setDrawing] = React.useState<Shape | null>(null);
  const baseline = React.useRef<Shape[]>([...initialShapes]);
  const undoStack = React.useRef<Shape[][]>([]);
  const redoStack = React.useRef<Shape[][]>([]);
  const [, forceRender] = React.useReducer((n: number) => n + 1, 0);

  // Quando `initialShapes` cambia (es. cambio pagina PDF), resettiamo
  // baseline + history e ricarichiamo il layer. Confronto per reference:
  // il chiamante è responsabile di passare lo stesso array se non cambia.
  const initialRef = React.useRef(initialShapes);
  React.useEffect(() => {
    if (initialRef.current === initialShapes) return;
    initialRef.current = initialShapes;
    baseline.current = [...initialShapes];
    undoStack.current = [];
    redoStack.current = [];
    setShapes([...initialShapes]);
    setDrawing(null);
  }, [initialShapes]);

  const pushHistory = React.useCallback((prev: Shape[]) => {
    undoStack.current.push(prev);
    if (undoStack.current.length > HISTORY_MAX) undoStack.current.shift();
    redoStack.current = [];
  }, []);

  const apply = React.useCallback(
    (next: Shape[]) => {
      setShapes(next);
      onChange?.(next);
    },
    [onChange],
  );

  const commit = React.useCallback(
    (s: Shape) => {
      pushHistory(shapes);
      const next = [...shapes, s];
      apply(next);
      forceRender();
    },
    [shapes, pushHistory, apply],
  );

  const replace = React.useCallback(
    (id: string, nextShape: Shape) => {
      pushHistory(shapes);
      const next = shapes.map((s) => (s.id === id ? nextShape : s));
      apply(next);
      forceRender();
    },
    [shapes, pushHistory, apply],
  );

  const remove = React.useCallback(
    (ids: string[]) => {
      if (ids.length === 0) return;
      pushHistory(shapes);
      const next = shapes.filter((s) => !ids.includes(s.id));
      apply(next);
      forceRender();
    },
    [shapes, pushHistory, apply],
  );

  const reset = React.useCallback(
    (next: Shape[]) => {
      baseline.current = [...next];
      undoStack.current = [];
      redoStack.current = [];
      apply(next);
      setDrawing(null);
      forceRender();
    },
    [apply],
  );

  const undo = React.useCallback(() => {
    const prev = undoStack.current.pop();
    if (!prev) return;
    redoStack.current.push(shapes);
    apply(prev);
    forceRender();
  }, [shapes, apply]);

  const redo = React.useCallback(() => {
    const next = redoStack.current.pop();
    if (!next) return;
    undoStack.current.push(shapes);
    apply(next);
    forceRender();
  }, [shapes, apply]);

  const dirty = !shallowEqualLayer(shapes, baseline.current);

  return {
    shapes,
    drawing,
    setDrawing,
    commit,
    replace,
    remove,
    reset,
    undo,
    redo,
    canUndo: undoStack.current.length > 0,
    canRedo: redoStack.current.length > 0,
    dirty,
  };
}

/**
 * Confronto "shape-by-id". Per il dirty tracking ci basta sapere se
 * il set di id+contenuto è cambiato; non serve diff profondo.
 */
function shallowEqualLayer(a: Shape[], b: Shape[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i]!;
    const y = b[i]!;
    if (x === y) continue;
    if (x.id !== y.id || x.type !== y.type) return false;
    // Best-effort: JSON.stringify (~scenes piccole). Per scenes con
    // migliaia di punti freehand potrebbe diventare caro; rimandiamo
    // l'ottimizzazione a quando avremo numeri reali.
    if (JSON.stringify(x) !== JSON.stringify(y)) return false;
  }
  return true;
}
