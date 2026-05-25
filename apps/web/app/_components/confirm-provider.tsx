'use client';

import * as React from 'react';
import { AlertTriangle, Info } from 'lucide-react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@kommessa/ui';

/**
 * Provider globale per sostituire window.confirm() / window.alert() nativi
 * con Dialog Radix in-app. Da montare una volta nel root layout.
 *
 * Uso nei componenti:
 *   const confirm = useConfirm();
 *   if (!(await confirm({ title: 'Eliminare?', destructive: true }))) return;
 *
 *   const alert = useAlert();
 *   await alert({ title: 'Errore', body: e.message });
 */

interface ConfirmOptions {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}

interface AlertOptions {
  title: string;
  body?: string;
  buttonLabel?: string;
}

type ConfirmResolver = (ok: boolean) => void;
type AlertResolver = () => void;

interface DialogContextValue {
  confirm: (opts: ConfirmOptions) => Promise<boolean>;
  alert: (opts: AlertOptions) => Promise<void>;
}

const DialogContext = React.createContext<DialogContextValue | null>(null);

export function ConfirmAlertProvider({ children }: { children: React.ReactNode }) {
  const [confirmState, setConfirmState] = React.useState<{
    open: boolean;
    opts: ConfirmOptions;
    resolver: ConfirmResolver | null;
  }>({
    open: false,
    opts: { title: '' },
    resolver: null,
  });
  const [alertState, setAlertState] = React.useState<{
    open: boolean;
    opts: AlertOptions;
    resolver: AlertResolver | null;
  }>({
    open: false,
    opts: { title: '' },
    resolver: null,
  });

  const confirm = React.useCallback((opts: ConfirmOptions): Promise<boolean> => {
    return new Promise<boolean>((resolve) => {
      setConfirmState({ open: true, opts, resolver: resolve });
    });
  }, []);

  const alert = React.useCallback((opts: AlertOptions): Promise<void> => {
    return new Promise<void>((resolve) => {
      setAlertState({ open: true, opts, resolver: resolve });
    });
  }, []);

  const closeConfirm = (result: boolean) => {
    confirmState.resolver?.(result);
    setConfirmState((s) => ({ ...s, open: false, resolver: null }));
  };
  const closeAlert = () => {
    alertState.resolver?.();
    setAlertState((s) => ({ ...s, open: false, resolver: null }));
  };

  const value: DialogContextValue = { confirm, alert };

  return (
    <DialogContext.Provider value={value}>
      {children}

      {/* Confirm */}
      <Dialog
        open={confirmState.open}
        onOpenChange={(o) => {
          if (!o) closeConfirm(false);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="mb-1 flex items-center gap-2">
              {confirmState.opts.destructive && (
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-destructive/10 text-destructive">
                  <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                </span>
              )}
              <DialogTitle>{confirmState.opts.title}</DialogTitle>
            </div>
            {confirmState.opts.description && (
              <DialogDescription>{confirmState.opts.description}</DialogDescription>
            )}
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => closeConfirm(false)}
            >
              {confirmState.opts.cancelLabel ?? 'Annulla'}
            </Button>
            <Button
              type="button"
              onClick={() => closeConfirm(true)}
              className={
                confirmState.opts.destructive
                  ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
                  : ''
              }
            >
              {confirmState.opts.confirmLabel ?? 'Conferma'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Alert */}
      <Dialog
        open={alertState.open}
        onOpenChange={(o) => {
          if (!o) closeAlert();
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="mb-1 flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Info className="h-4 w-4" aria-hidden="true" />
              </span>
              <DialogTitle>{alertState.opts.title}</DialogTitle>
            </div>
            {alertState.opts.body && (
              <DialogDescription className="whitespace-pre-wrap">
                {alertState.opts.body}
              </DialogDescription>
            )}
          </DialogHeader>
          <DialogFooter>
            <Button type="button" onClick={closeAlert}>
              {alertState.opts.buttonLabel ?? 'OK'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DialogContext.Provider>
  );
}

/** Hook per chiedere conferma. Ritorna Promise<boolean>. */
export function useConfirm(): DialogContextValue['confirm'] {
  const ctx = React.useContext(DialogContext);
  if (!ctx) {
    // Fallback: in dev, se per qualche motivo non c'è provider, usa window.confirm
    // (in prod il provider è montato globalmente).
    return async (opts) => {
      if (typeof window === 'undefined') return false;
      return window.confirm(`${opts.title}${opts.description ? '\n\n' + opts.description : ''}`);
    };
  }
  return ctx.confirm;
}

/** Hook per mostrare un alert informativo. Ritorna Promise<void>. */
export function useAlert(): DialogContextValue['alert'] {
  const ctx = React.useContext(DialogContext);
  if (!ctx) {
    return async (opts) => {
      if (typeof window === 'undefined') return;
      window.alert(`${opts.title}${opts.body ? '\n\n' + opts.body : ''}`);
    };
  }
  return ctx.alert;
}
