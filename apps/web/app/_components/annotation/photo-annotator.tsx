'use client';

/**
 * PhotoAnnotator — wrapper sottile su EditorShell + PhotoCanvas.
 *
 * API compatibile col vecchio PhotoAnnotationEditor (drop-in replacement).
 *
 * Extra rispetto al monolite legacy:
 *  - StatusBar (zoom info, salvato/dirty)
 *  - Auto-save dopo 5s di idle (toggable da utente via status bar)
 *  - Shortcut Cmd/Ctrl+S → salva
 *  - Header brand bar
 *  - Conferma "Annulla modifiche?" se dirty al close
 */

import * as React from 'react';

import {
  DEFAULT_COLOR,
  DEFAULT_STROKE,
  type Shape,
} from '../../_lib/annotation-shapes';

import { EditorShell } from './editor-shell';
import { AnnotationToolbar } from './toolbar';
import { PhotoCanvas } from './photo-canvas';
import { useAnnotationState } from './hooks/use-annotation-state';
import { useAnnotationKeyboard } from './hooks/use-keyboard';
import type { DrawingTool, SaveStatus } from './types';

export interface PhotoAnnotatorProps {
  fileRefId: string;
  imageUrl: string;
  title?: string;
  initialLayer?: Shape[];
  width?: number;
  height?: number;
  onSave: (layer: Shape[], width: number, height: number) => Promise<void>;
  onClose: () => void;
  readOnly?: boolean;
}

const IDLE_AUTOSAVE_MS = 5000;

export function PhotoAnnotator(props: PhotoAnnotatorProps) {
  const {
    fileRefId: _fileRefId,
    imageUrl,
    title,
    initialLayer,
    width,
    height,
    onSave,
    onClose,
    readOnly = false,
  } = props;

  const state = useAnnotationState({ initialShapes: initialLayer ?? [] });

  const [tool, setTool] = React.useState<DrawingTool>('pencil');
  const [color, setColor] = React.useState(DEFAULT_COLOR);
  const [strokeWidth, setStrokeWidth] = React.useState(DEFAULT_STROKE);
  const [refSize, setRefSize] = React.useState<{ w: number; h: number }>({
    w: width ?? 0,
    h: height ?? 0,
  });
  const [status, setStatus] = React.useState<SaveStatus>({ kind: 'idle' });
  const [autoSave, setAutoSave] = React.useState(true);

  // Stato "dirty → saved" → riflesso su SaveStatus
  React.useEffect(() => {
    if (state.dirty) setStatus({ kind: 'dirty' });
  }, [state.dirty]);

  const doSave = React.useCallback(async () => {
    if (readOnly) return;
    if (!refSize.w || !refSize.h) return;
    setStatus({ kind: 'saving' });
    try {
      await onSave(state.shapes, refSize.w, refSize.h);
      setStatus({ kind: 'saved', at: Date.now() });
    } catch (e) {
      setStatus({
        kind: 'error',
        message: e instanceof Error ? e.message : 'Salvataggio fallito',
      });
    }
  }, [readOnly, refSize, state.shapes, onSave]);

  // Auto-save: dopo IDLE_AUTOSAVE_MS senza modifiche, salviamo silenziosamente.
  React.useEffect(() => {
    if (!autoSave || readOnly) return;
    if (status.kind !== 'dirty') return;
    const t = setTimeout(() => {
      void doSave();
    }, IDLE_AUTOSAVE_MS);
    return () => clearTimeout(t);
  }, [autoSave, readOnly, status, doSave]);

  const handleClose = () => {
    if (state.dirty && status.kind !== 'saved') {
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
    await doSave();
    if (status.kind !== 'error') onClose();
  };

  useAnnotationKeyboard({
    onUndo: state.undo,
    onRedo: state.redo,
    onSave: () => void doSave(),
    onClose: handleClose,
  });

  return (
    <EditorShell
      title={title ?? 'Annota foto'}
      subtitle={
        refSize.w && refSize.h
          ? `${refSize.w}×${refSize.h}px · ${state.shapes.length} elementi`
          : undefined
      }
      toolbar={
        <AnnotationToolbar
          mode="drawing"
          tool={tool}
          onTool={(t) => setTool(t as DrawingTool)}
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
      pageInfo={
        refSize.w && refSize.h ? `${refSize.w}×${refSize.h}px` : undefined
      }
      autoSave={autoSave}
      onToggleAutoSave={() => setAutoSave((v) => !v)}
      saving={status.kind === 'saving'}
      readOnly={readOnly}
      onSave={handleSaveClick}
      onClose={handleClose}
    >
      <PhotoCanvas
        imageUrl={imageUrl}
        state={state}
        tool={tool}
        color={color}
        strokeWidth={strokeWidth}
        width={width}
        height={height}
        readOnly={readOnly}
        onRefSize={(w, h) => setRefSize({ w, h })}
      />
    </EditorShell>
  );
}
