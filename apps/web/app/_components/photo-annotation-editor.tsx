'use client';

/**
 * Thin re-export verso il nuovo framework annotation.
 *
 * Mantiene retro-compatibilità con i consumer storici (foto-grid.tsx,
 * scatto-form.tsx) che fanno:
 *   import { PhotoAnnotationEditor } from '../../_components/photo-annotation-loader';
 *
 * La logica reale è in `apps/web/app/_components/annotation/photo-annotator.tsx`
 * (state hook + editor-shell + photo-canvas + toolbar condivisa).
 */

export { PhotoAnnotator as PhotoAnnotationEditor } from './annotation/photo-annotator';
export type { PhotoAnnotatorProps as PhotoAnnotationEditorProps } from './annotation/photo-annotator';

// Re-export RenderShape (usato dal viewer) verso il nuovo path
export { RenderShape } from './annotation/render-shape';
