'use client';

/**
 * PdfAnnotator — editor PDF a 2 modalità (Testo / Disegno).
 *
 * Architettura state per pagina:
 *  - Le annotazioni vivono in una mappa `Map<page, Shape[]>` (uno state
 *    per pagina). Quando cambi pagina, salviamo il working copy in
 *    memoria e ricarichiamo lo state della nuova pagina.
 *  - Il save server-side è per-pagina: `salvaAnnotazione({ page })`
 *    chiama l'UPSERT per la singola row (file_ref_id, page).
 *  - Su "Salva" o auto-save: salviamo TUTTE le pagine modificate
 *    (dirty), non solo quella corrente.
 *
 * Caricamento iniziale: il parent passa `initialPages` con le
 * annotazioni già caricate via `caricaAnnotazioniFile` (Server Action).
 *
 * Refs di coordinate: ogni pagina ha la sua dimensione naturale,
 * notificata dal PdfCanvas via onPageSize. La salviamo per ogni pagina
 * così il save include width/height corretti.
 */

import * as React from 'react';
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';

import {
  DEFAULT_COLOR,
  DEFAULT_STROKE,
  type Shape,
} from '../../_lib/annotation-shapes';

import { EditorShell } from './editor-shell';
import { AnnotationToolbar } from './toolbar';
import { ModeSwitch } from './mode-switch';
import { PdfCanvas } from './pdf-canvas';
import { useAnnotationState } from './hooks/use-annotation-state';
import { useAnnotationKeyboard } from './hooks/use-keyboard';
import type { DrawingTool, PdfTextTool, PdfMode, SaveStatus } from './types';

export interface PdfPageAnnotation {
  page: number;
  layer: Shape[];
  width: number;
  height: number;
}

export interface PdfAnnotatorProps {
  fileRefId: string;
  fileUrl: string;
  title?: string;
  /** Annotazioni preesistenti per pagina (caricate via caricaAnnotazioniFile). */
  initialPages?: PdfPageAnnotation[];
  /**
   * onSavePage: persistenza per-pagina.
   * Il parent chiamerà salvaAnnotazione({ kind: 'pdf', page, layer, width, height }).
   */
  onSavePage: (
    page: number,
    layer: Shape[],
    width: number,
    height: number,
  ) => Promise<void>;
  onClose: () => void;
  readOnly?: boolean;
}

const IDLE_AUTOSAVE_MS = 5000;

interface PageState {
  layer: Shape[];
  width: number;
  height: number;
  dirty: boolean;
}

export function PdfAnnotator(props: PdfAnnotatorProps) {
  const {
    fileRefId: _fileRefId,
    fileUrl,
    title,
    initialPages,
    onSavePage,
    onClose,
    readOnly = false,
  } = props;

  // ---- modalità & tools ----
  const [mode, setMode] = React.useState<PdfMode>('text');
  const [drawingTool, setDrawingTool] = React.useState<DrawingTool>('pencil');
  const [textTool, setTextTool] = React.useState<PdfTextTool>('text-highlight');
  const [color, setColor] = React.useState(DEFAULT_COLOR);
  const [strokeWidth, setStrokeWidth] = React.useState(DEFAULT_STROKE);

  // ---- pagine ----
  const [numPages, setNumPages] = React.useState(0);
  const [page, setPage] = React.useState(1);
  const [zoom, setZoom] = React.useState(1);

  // Mappa stati pagina (memoria locale durante editing).
  // useState lazy init: il bootstrap parte SUBITO al primo render, così
  // useAnnotationState legge già le shapes corrette per la pagina iniziale.
  const [pageStatesRef] = React.useState<{ current: Map<number, PageState> }>(() => {
    const map = new Map<number, PageState>();
    for (const p of initialPages ?? []) {
      if (typeof p.page !== 'number') continue;
      map.set(p.page, {
        layer: p.layer,
        width: p.width,
        height: p.height,
        dirty: false,
      });
    }
    return { current: map };
  });

  // Layer della pagina corrente (memo per useAnnotationState).
  // ATTENZIONE: la reference deve cambiare quando cambia pagina così
  // useAnnotationState resetta il suo internal state (vedi sua effetto).
  const currentPageInitial = React.useMemo<Shape[]>(() => {
    const ps = pageStatesRef.current.get(page);
    return ps?.layer ?? [];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  const state = useAnnotationState({
    initialShapes: currentPageInitial,
    onChange: (shapes) => {
      const cur = pageStatesRef.current.get(page);
      pageStatesRef.current.set(page, {
        layer: shapes,
        width: cur?.width ?? 0,
        height: cur?.height ?? 0,
        dirty: true,
      });
    },
  });

  const setPageRefSize = React.useCallback(
    (p: number, w: number, h: number) => {
      const cur = pageStatesRef.current.get(p);
      pageStatesRef.current.set(p, {
        layer: cur?.layer ?? [],
        width: w,
        height: h,
        dirty: cur?.dirty ?? false,
      });
    },
    [],
  );

  // ---- status ----
  const [status, setStatus] = React.useState<SaveStatus>({ kind: 'idle' });
  const [autoSave, setAutoSave] = React.useState(true);

  // Dirty aggregato (qualche pagina ha dirty=true)
  const anyDirty = React.useCallback(() => {
    for (const v of pageStatesRef.current.values()) if (v.dirty) return true;
    return false;
  }, []);

  React.useEffect(() => {
    if (state.dirty || anyDirty()) setStatus({ kind: 'dirty' });
  }, [state.dirty, state.shapes, anyDirty]);

  const doSaveAll = React.useCallback(async () => {
    if (readOnly) return;
    setStatus({ kind: 'saving' });
    try {
      // Salviamo solo le pagine dirty (più la corrente se ha shapes).
      const tasks: Array<Promise<void>> = [];
      for (const [p, ps] of pageStatesRef.current.entries()) {
        if (!ps.dirty) continue;
        if (!ps.width || !ps.height) continue;
        tasks.push(
          onSavePage(p, ps.layer, ps.width, ps.height).then(() => {
            ps.dirty = false;
          }),
        );
      }
      await Promise.all(tasks);
      setStatus({ kind: 'saved', at: Date.now() });
    } catch (e) {
      setStatus({
        kind: 'error',
        message: e instanceof Error ? e.message : 'Salvataggio fallito',
      });
    }
  }, [readOnly, onSavePage]);

  // Auto-save dopo idle
  React.useEffect(() => {
    if (!autoSave || readOnly) return;
    if (status.kind !== 'dirty') return;
    const t = setTimeout(() => void doSaveAll(), IDLE_AUTOSAVE_MS);
    return () => clearTimeout(t);
  }, [autoSave, readOnly, status, doSaveAll]);

  const handleClose = () => {
    if (status.kind === 'dirty' || anyDirty()) {
      if (
        !window.confirm(
          'Hai modifiche non salvate. Vuoi davvero chiudere senza salvare?',
        )
      ) {
        return;
      }
    }
    onClose();
  };

  const handleSaveClick = async () => {
    await doSaveAll();
    if (status.kind !== 'error') onClose();
  };

  useAnnotationKeyboard({
    onUndo: state.undo,
    onRedo: state.redo,
    onSave: () => void doSaveAll(),
    onClose: handleClose,
  });

  // Conta totale annotazioni (per subtitle "X annotazioni · Y pagine")
  const annotationCount = React.useMemo(() => {
    let total = 0;
    let pagesWith = 0;
    for (const v of pageStatesRef.current.values()) {
      if (v.layer.length > 0) {
        total += v.layer.length;
        pagesWith += 1;
      }
    }
    return { total, pagesWith };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.shapes, page]);

  const pageInfo = numPages > 0 ? `Pag ${page} di ${numPages}` : undefined;

  return (
    <EditorShell
      title={title ?? 'Annota PDF'}
      subtitle={
        annotationCount.total > 0
          ? `${annotationCount.total} annotazioni · ${annotationCount.pagesWith} pagine`
          : 'Nessuna annotazione'
      }
      modeSwitchSlot={<ModeSwitch value={mode} onChange={setMode} />}
      toolbar={
        <AnnotationToolbar
          mode={mode === 'draw' ? 'drawing' : 'pdf-text'}
          tool={mode === 'draw' ? drawingTool : textTool}
          onTool={(t) =>
            mode === 'draw'
              ? setDrawingTool(t as DrawingTool)
              : setTextTool(t as PdfTextTool)
          }
          color={color}
          onColor={setColor}
          strokeWidth={strokeWidth}
          onStrokeWidth={setStrokeWidth}
          onUndo={state.undo}
          onRedo={state.redo}
          canUndo={state.canUndo}
          canRedo={state.canRedo}
        />
      }
      status={status}
      pageInfo={pageInfo}
      zoomInfo={`${Math.round(zoom * 100)}%`}
      autoSave={autoSave}
      onToggleAutoSave={() => setAutoSave((v) => !v)}
      saving={status.kind === 'saving'}
      readOnly={readOnly}
      onSave={handleSaveClick}
      onClose={handleClose}
    >
      {/* Toolbar pagina / zoom */}
      <div className="flex shrink-0 items-center justify-center gap-1 border-b border-slate-700/40 bg-slate-100/90 px-3 py-1.5 text-xs text-slate-700 backdrop-blur dark:bg-slate-800/90 dark:text-slate-200">
        <button
          type="button"
          aria-label="Pagina precedente"
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          disabled={page <= 1}
          className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-slate-200 disabled:opacity-40 dark:hover:bg-slate-700"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        </button>
        <span className="px-2 font-medium">
          {numPages > 0 ? `${page} / ${numPages}` : '…'}
        </span>
        <button
          type="button"
          aria-label="Pagina successiva"
          onClick={() => setPage((p) => Math.min(numPages || p + 1, p + 1))}
          disabled={page >= numPages}
          className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-slate-200 disabled:opacity-40 dark:hover:bg-slate-700"
        >
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </button>
        <div className="mx-3 h-4 w-px bg-slate-300 dark:bg-slate-600" />
        <button
          type="button"
          aria-label="Zoom out"
          onClick={() => setZoom((z) => Math.max(0.4, +(z - 0.2).toFixed(2)))}
          className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-slate-200 dark:hover:bg-slate-700"
        >
          <ZoomOut className="h-4 w-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label="Reset zoom"
          onClick={() => setZoom(1)}
          className="flex h-8 items-center justify-center rounded-md px-2 hover:bg-slate-200 dark:hover:bg-slate-700"
        >
          {Math.round(zoom * 100)}%
        </button>
        <button
          type="button"
          aria-label="Zoom in"
          onClick={() => setZoom((z) => Math.min(3, +(z + 0.2).toFixed(2)))}
          className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-slate-200 dark:hover:bg-slate-700"
        >
          <ZoomIn className="h-4 w-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label="Reset zoom"
          onClick={() => setZoom(1)}
          className="hidden h-8 w-8 items-center justify-center rounded-md hover:bg-slate-200 sm:flex dark:hover:bg-slate-700"
        >
          <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>

      <PdfCanvas
        fileUrl={fileUrl}
        state={state}
        mode={mode}
        drawingTool={drawingTool}
        textTool={textTool}
        color={color}
        strokeWidth={strokeWidth}
        page={page}
        zoom={zoom}
        readOnly={readOnly}
        onDocumentLoaded={(n) => setNumPages(n)}
        onPageSize={setPageRefSize}
      />
    </EditorShell>
  );
}
