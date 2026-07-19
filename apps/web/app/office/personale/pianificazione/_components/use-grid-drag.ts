'use client';

import * as React from 'react';

/**
 * Drag della griglia pianificazione a **pointer events puri** (nessuna libreria).
 * Due gesti, entrambi sull'INTERO blocco (squadra), coerenti col modello dati:
 *  - long-press (~0,7s) sul chip → arma la modalità "sposta" → trascini su un
 *    altro giorno → il blocco si sposta lì (cambia solo la data).
 *  - trascinamento della maniglia sul bordo destro → "resize": estende (clona)
 *    il blocco sui giorni successivi.
 * Un click semplice (senza long-press) resta "apri modifica".
 *
 * Il long-press evita spostamenti accidentali; un micro-movimento prima dello
 * scadere annulla l'arming (era uno scroll/tap). Le celle bersaglio (tutte le
 * righe dei membri, così è chiaro che riguarda più persone) sono evidenziate.
 */

const LONG_PRESS_MS = 700;
const MOVE_CANCEL_PX = 8;

export interface DragBlocco {
  id: string;
  data: string; // giorno di origine (YYYY-MM-DD)
  membri: string[];
  hue: number; // tinta del chip → l'anteprima "striscia" usa lo stesso colore
}

export type DragState =
  | { kind: 'idle' }
  | { kind: 'pending'; b: DragBlocco; startX: number; startY: number }
  | { kind: 'moving'; b: DragBlocco; x: number; y: number; overDate: string | null; label: string }
  | { kind: 'resizing'; b: DragBlocco; overDate: string | null; label: string };

export interface GridDrag {
  drag: DragState;
  busy: boolean;
  chipPointerDown: (e: React.PointerEvent, b: DragBlocco, label: string) => void;
  resizePointerDown: (e: React.PointerEvent, b: DragBlocco, label: string) => void;
  suppressNextClick: () => boolean;
  isCellTarget: (emp: string, date: string) => boolean;
  /** Anteprima "striscia" (stessa tinta/label del chip) per le celle bersaglio. */
  cellGhost: (emp: string, date: string) => { hue: number; label: string } | null;
}

export function useGridDrag(opts: {
  giorni: string[];
  onMove: (id: string, nuovaData: string) => Promise<void>;
  onResize: (id: string, date: string[]) => Promise<void>;
}): GridDrag {
  const [drag, setDragState] = React.useState<DragState>({ kind: 'idle' });
  const [busy, setBusy] = React.useState(false);

  const dragRef = React.useRef<DragState>({ kind: 'idle' });
  const timerRef = React.useRef<number | null>(null);
  const suppressRef = React.useRef(false);
  const detachRef = React.useRef<null | (() => void)>(null);
  const busyRef = React.useRef(false);

  const onMoveRef = React.useRef(opts.onMove);
  const onResizeRef = React.useRef(opts.onResize);
  const giorniRef = React.useRef(opts.giorni);
  onMoveRef.current = opts.onMove;
  onResizeRef.current = opts.onResize;
  giorniRef.current = opts.giorni;

  const set = React.useCallback((s: DragState) => {
    dragRef.current = s;
    setDragState(s);
  }, []);

  const clearTimer = () => {
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const cellUnder = (x: number, y: number): { emp: string; date: string } | null => {
    const el = document.elementFromPoint(x, y);
    const cell = el?.closest('[data-cell="1"]') as HTMLElement | null;
    if (!cell) return null;
    const emp = cell.getAttribute('data-emp');
    const date = cell.getAttribute('data-date');
    if (!emp || !date) return null;
    return { emp, date };
  };

  const detach = React.useCallback(() => {
    detachRef.current?.();
    detachRef.current = null;
    document.body.style.userSelect = '';
  }, []);

  const finish = React.useCallback(() => {
    clearTimer();
    detach();
    set({ kind: 'idle' });
  }, [detach, set]);

  const runMove = async (id: string, nuovaData: string) => {
    setBusy(true);
    busyRef.current = true;
    try {
      await onMoveRef.current(id, nuovaData);
    } finally {
      setBusy(false);
      busyRef.current = false;
    }
  };
  const runResize = async (id: string, dates: string[]) => {
    setBusy(true);
    busyRef.current = true;
    try {
      await onResizeRef.current(id, dates);
    } finally {
      setBusy(false);
      busyRef.current = false;
    }
  };

  const attach = React.useCallback(() => {
    if (detachRef.current) return;
    document.body.style.userSelect = 'none';

    const onMovePtr = (e: PointerEvent) => {
      const cur = dragRef.current;
      if (cur.kind === 'pending') {
        if (
          Math.abs(e.clientX - cur.startX) > MOVE_CANCEL_PX ||
          Math.abs(e.clientY - cur.startY) > MOVE_CANCEL_PX
        ) {
          finish(); // movimento prima del long-press → era scroll/tap
        }
        return;
      }
      if (cur.kind === 'moving') {
        e.preventDefault();
        const c = cellUnder(e.clientX, e.clientY);
        set({ ...cur, x: e.clientX, y: e.clientY, overDate: c?.date ?? null });
      } else if (cur.kind === 'resizing') {
        e.preventDefault();
        const c = cellUnder(e.clientX, e.clientY);
        if ((c?.date ?? null) !== cur.overDate) set({ ...cur, overDate: c?.date ?? null });
      }
    };

    const onUpPtr = () => {
      const cur = dragRef.current;
      if (cur.kind === 'moving') {
        const target = cur.overDate;
        // Il chip ha ricevuto il pointerdown → un click potrebbe seguire il
        // rilascio: sopprimilo (era un drag, non un tap). Auto-reset al task
        // successivo così non "mangia" il click legittimo dopo (rilascio altrove).
        suppressRef.current = true;
        window.setTimeout(() => {
          suppressRef.current = false;
        }, 0);
        finish();
        if (target && target !== cur.b.data) void runMove(cur.b.id, target);
        return;
      }
      if (cur.kind === 'resizing') {
        const target = cur.overDate;
        finish();
        if (target) {
          const gi = giorniRef.current;
          const from = gi.indexOf(cur.b.data);
          const to = gi.indexOf(target);
          if (from >= 0 && to > from) {
            const dates = gi.slice(from + 1, to + 1);
            if (dates.length) void runResize(cur.b.id, dates);
          }
        }
        return;
      }
      finish();
    };

    const onCancel = () => finish();

    window.addEventListener('pointermove', onMovePtr, { passive: false });
    window.addEventListener('pointerup', onUpPtr);
    window.addEventListener('pointercancel', onCancel);
    detachRef.current = () => {
      window.removeEventListener('pointermove', onMovePtr);
      window.removeEventListener('pointerup', onUpPtr);
      window.removeEventListener('pointercancel', onCancel);
    };
  }, [finish, set]);

  // cleanup su unmount: togli i listener globali e il timer (niente setState).
  React.useEffect(
    () => () => {
      if (timerRef.current != null) window.clearTimeout(timerRef.current);
      detachRef.current?.();
      document.body.style.userSelect = '';
    },
    [],
  );

  const chipPointerDown = (e: React.PointerEvent, b: DragBlocco, label: string) => {
    if (e.button !== 0 || busyRef.current) return;
    const startX = e.clientX;
    const startY = e.clientY;
    set({ kind: 'pending', b, startX, startY });
    attach();
    clearTimer();
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      if (dragRef.current.kind === 'pending') {
        set({ kind: 'moving', b, x: startX, y: startY, overDate: b.data, label });
      }
    }, LONG_PRESS_MS);
  };

  const resizePointerDown = (e: React.PointerEvent, b: DragBlocco, label: string) => {
    // Il pointerdown è sulla MANIGLIA (non sul bottone) → nessun click del chip
    // da sopprimere. stopPropagation/preventDefault: niente selezione testo.
    if (e.button !== 0 || busyRef.current) return;
    e.stopPropagation();
    e.preventDefault();
    set({ kind: 'resizing', b, overDate: b.data, label });
    attach();
  };

  const suppressNextClick = () => {
    if (suppressRef.current) {
      suppressRef.current = false;
      return true;
    }
    return false;
  };

  const isCellTarget = (emp: string, date: string): boolean => {
    if (drag.kind === 'moving') {
      return drag.overDate === date && drag.b.membri.includes(emp);
    }
    if (drag.kind === 'resizing') {
      if (!drag.overDate) return false;
      const gi = opts.giorni;
      const from = gi.indexOf(drag.b.data);
      const to = gi.indexOf(drag.overDate);
      if (from < 0 || to <= from) return false;
      const idx = gi.indexOf(date);
      // estende l'intero blocco → evidenzia tutte le righe dei membri
      return idx > from && idx <= to && drag.b.membri.includes(emp);
    }
    return false;
  };

  const cellGhost = (emp: string, date: string): { hue: number; label: string } | null => {
    if ((drag.kind === 'moving' || drag.kind === 'resizing') && isCellTarget(emp, date)) {
      return { hue: drag.b.hue, label: drag.label };
    }
    return null;
  };

  return { drag, busy, chipPointerDown, resizePointerDown, suppressNextClick, isCellTarget, cellGhost };
}
