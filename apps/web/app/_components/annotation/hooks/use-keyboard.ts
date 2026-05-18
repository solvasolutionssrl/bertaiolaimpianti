'use client';

/**
 * useAnnotationKeyboard — shortcut consistenti per foto + PDF editor.
 *
 *  - Cmd/Ctrl+Z   → undo
 *  - Cmd/Ctrl+Y   → redo
 *  - Cmd/Ctrl+Shift+Z → redo (mac convention)
 *  - Cmd/Ctrl+S   → save (intercepta beforeunload del browser)
 *  - Esc          → close (con conferma se dirty, gestita dal caller)
 *
 * Il caller passa callback noop quando vuole disabilitare uno shortcut
 * (es. mentre l'utente sta digitando in input → niente undo/redo).
 */

import * as React from 'react';

export interface UseAnnotationKeyboardOptions {
  enabled?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
  onSave?: () => void;
  onClose?: () => void;
}

export function useAnnotationKeyboard(options: UseAnnotationKeyboardOptions) {
  const { enabled = true, onUndo, onRedo, onSave, onClose } = options;

  React.useEffect(() => {
    if (!enabled) return;
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      // Lascia passare se siamo dentro un input/textarea/contenteditable
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        if (e.key === 'Escape') {
          // Esc su input → blur, non chiude editor
          (target as HTMLElement).blur();
          return;
        }
        return;
      }
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        onUndo?.();
      } else if (
        (mod && e.key.toLowerCase() === 'y') ||
        (mod && e.shiftKey && e.key.toLowerCase() === 'z')
      ) {
        e.preventDefault();
        onRedo?.();
      } else if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault();
        onSave?.();
      } else if (e.key === 'Escape') {
        onClose?.();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [enabled, onUndo, onRedo, onSave, onClose]);
}
