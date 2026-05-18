'use client';

/**
 * EditorShell — guscio condiviso degli editor (foto + PDF).
 *
 * Responsabilità:
 *  - Header 60px (titolo + Salva/Annulla)
 *  - Brand bar 2px gradient blu→arancio sopra l'header (identità prodotto)
 *  - Slot per ModeSwitch (solo PDF)
 *  - Slot per Toolbar (sx desktop / bottom mobile)
 *  - Slot per il canvas (centro)
 *  - StatusBar 40px in fondo
 *  - Focus restore al close (a11y)
 *
 * Tutta la logica di disegno/state vive nei singoli canvas. Lo shell è
 * presentational + focus-trap minimo.
 */

import * as React from 'react';
import { X, Save, Loader2, ArrowLeft } from 'lucide-react';

import { Button } from '@impiantixplus/ui';

import { AnnotationStatusBar } from './status-bar';
import type { SaveStatus } from './types';

export interface EditorShellProps {
  title: string;
  /** Sottotitolo opzionale (es. "Pag 3 di 12"). */
  subtitle?: string;
  /** Render slot per il ModeSwitch (centro header) — solo PDF. */
  modeSwitchSlot?: React.ReactNode;
  /** Render slot per la toolbar. */
  toolbar: React.ReactNode;
  /** Render slot per il canvas (cresce per occupare lo spazio rimanente). */
  children: React.ReactNode;
  /** Stato salvataggio mostrato in status bar. */
  status: SaveStatus;
  /** Info pagina/dimensione + zoom mostrati nella status bar. */
  pageInfo?: string;
  zoomInfo?: string;
  autoSave?: boolean;
  onToggleAutoSave?: () => void;
  lockedByOther?: { displayName: string; remainingSec: number } | null;
  /** Disabilita pulsante Salva (modalità readonly o salvataggio in corso). */
  saving?: boolean;
  readOnly?: boolean;
  onSave: () => void;
  onClose: () => void;
}

export function EditorShell(props: EditorShellProps) {
  const {
    title,
    subtitle,
    modeSwitchSlot,
    toolbar,
    children,
    status,
    pageInfo,
    zoomInfo,
    autoSave,
    onToggleAutoSave,
    lockedByOther,
    saving,
    readOnly = false,
    onSave,
    onClose,
  } = props;

  // Focus restore: salviamo l'elemento attivo prima del mount e lo
  // ripristiniamo al unmount (a11y standard).
  const previousFocus = React.useRef<HTMLElement | null>(null);
  const closeBtnRef = React.useRef<HTMLButtonElement>(null);
  React.useEffect(() => {
    previousFocus.current = document.activeElement as HTMLElement | null;
    closeBtnRef.current?.focus();
    return () => {
      previousFocus.current?.focus?.();
    };
  }, []);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-[60] flex flex-col bg-slate-950 text-slate-100"
    >
      {/* Brand gradient bar */}
      <div
        aria-hidden="true"
        className="h-0.5 w-full bg-gradient-to-r from-primary via-primary to-accent"
      />

      {/* Header */}
      <header className="flex h-[60px] shrink-0 items-center justify-between gap-3 border-b border-slate-800 bg-slate-900/95 px-3 backdrop-blur md:px-4">
        <button
          ref={closeBtnRef}
          type="button"
          onClick={onClose}
          aria-label="Chiudi editor"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-slate-200 transition-colors hover:bg-slate-800 md:hidden"
        >
          <ArrowLeft className="h-5 w-5" aria-hidden="true" />
        </button>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-50">{title}</p>
          {subtitle ? (
            <p className="truncate text-xs text-slate-400">{subtitle}</p>
          ) : null}
        </div>

        {modeSwitchSlot ? (
          <div className="hidden shrink-0 md:block">{modeSwitchSlot}</div>
        ) : null}

        <div className="flex shrink-0 items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onClose}
            className="hidden border-slate-700 bg-slate-900 text-slate-100 hover:bg-slate-800 md:inline-flex"
            aria-label="Chiudi senza salvare"
          >
            <X className="h-4 w-4" aria-hidden="true" />
            Annulla
          </Button>
          {!readOnly ? (
            <Button
              type="button"
              size="sm"
              onClick={onSave}
              disabled={saving}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : status.kind === 'saved' ? (
                <CheckIcon />
              ) : (
                <Save className="h-4 w-4" aria-hidden="true" />
              )}
              Salva
            </Button>
          ) : null}
        </div>
      </header>

      {/* ModeSwitch (mobile, sotto l'header centrato) */}
      {modeSwitchSlot ? (
        <div className="flex items-center justify-center border-b border-slate-800 bg-slate-900/60 py-2 md:hidden">
          {modeSwitchSlot}
        </div>
      ) : null}

      {/* Body: toolbar + canvas */}
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        {!readOnly ? toolbar : null}
        <main className="flex min-h-0 flex-1 flex-col bg-slate-200/95 md:order-2 dark:bg-slate-800">
          {children}
        </main>
      </div>

      {/* StatusBar */}
      <AnnotationStatusBar
        status={status}
        pageInfo={pageInfo}
        zoomInfo={zoomInfo}
        autoSave={autoSave}
        onToggleAutoSave={onToggleAutoSave}
        lockedByOther={lockedByOther}
      />
    </div>
  );
}

// Inline check icon (animato 1s post-save). Estratto per non importare
// lucide-react aggiuntivo solo per questa transizione.
function CheckIcon() {
  return (
    <svg
      className="h-4 w-4 text-emerald-300"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
