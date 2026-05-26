'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { PencilLine, Plus, Loader2, AlertCircle, X } from 'lucide-react';
import {
  Button,
  cn,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@kommessa/ui';

import { aggiornaDettagliCommessa } from '../_actions/dettagli-commessa';
import { ConfirmDialog } from './confirm-dialog';

interface Props {
  commessaId: string;
  /** Testo corrente (può essere null se non c'è ancora nessun dettaglio). */
  initial: string | null;
  /** Se false il bottone "Modifica" è nascosto. */
  canEdit: boolean;
  /** Override classi del trigger matita (es. per sfondi scuri). */
  triggerClassName?: string;
}

/**
 * Editor inline per il campo "Dettagli" della commessa.
 *
 * Comportamento:
 *  - Bottone "Modifica" (se canEdit) apre dialog con textarea pre-popolata.
 *  - Bottone "Aggiungi nota" sotto il testo apre dialog vuota con il testo
 *    esistente pre-aggiunto in cima (concatena con doppio newline).
 *  - Conferma "Esci senza salvare?" con ConfirmDialog custom (no confirm() browser).
 */
export function DettagliEdit({ commessaId, initial, canEdit, triggerClassName }: Props) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [mode, setMode] = React.useState<'replace' | 'append'>('replace');
  const [draft, setDraft] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [confirmCloseOpen, setConfirmCloseOpen] = React.useState(false);

  const startEdit = () => {
    setMode('replace');
    setDraft(initial ?? '');
    setError(null);
    setOpen(true);
  };

  const startAppend = () => {
    setMode('append');
    setDraft('');
    setError(null);
    setOpen(true);
  };

  const isDirty = React.useMemo(() => {
    if (mode === 'replace') return (draft ?? '').trim() !== (initial ?? '').trim();
    return draft.trim().length > 0;
  }, [draft, initial, mode]);

  const handleOpenChange = (next: boolean) => {
    if (next) {
      setOpen(true);
      return;
    }
    if (saving) return; // blocca chiusura durante save
    if (isDirty) {
      setConfirmCloseOpen(true);
      return;
    }
    setOpen(false);
  };

  const handleSubmit = async () => {
    setSaving(true);
    setError(null);
    const finalText =
      mode === 'append' && initial
        ? `${initial.trim()}\n\n${draft.trim()}`
        : draft;
    const res = await aggiornaDettagliCommessa({ commessaId, testo: finalText });
    setSaving(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setOpen(false);
    router.refresh();
  };

  if (!canEdit) return null;

  return (
    <>
      {/* Icona matita in alto a destra — assoluta nel card relative */}
      <button
        type="button"
        onClick={startEdit}
        className={cn(
          'absolute right-2 top-2 rounded-md p-1 text-muted-foreground/50 hover:bg-muted hover:text-foreground transition-colors',
          triggerClassName,
        )}
        title="Correggi il testo della nota iniziale"
        aria-label="Modifica dettagli lavoro"
      >
        <PencilLine className="h-3.5 w-3.5" aria-hidden="true" />
      </button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent
          className="sm:max-w-lg"
          onInteractOutside={(e) => {
            if (isDirty) e.preventDefault();
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {mode === 'replace' ? 'Modifica dettagli' : 'Aggiungi nota ai dettagli'}
            </DialogTitle>
            <DialogDescription>
              {mode === 'replace'
                ? 'Aggiorna la descrizione del lavoro. Visibile a tutti i tecnici nella PWA.'
                : "Aggiungi una nota in fondo. Il testo precedente resta intatto."}
            </DialogDescription>
          </DialogHeader>

          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={mode === 'replace' ? 10 : 6}
            autoFocus
            placeholder={
              mode === 'replace'
                ? "C'è da fare l'installazione del…"
                : 'Nuova nota da aggiungere…'
            }
            className="block w-full rounded-md border border-input bg-background px-3 py-2 text-sm leading-relaxed"
          />

          {error && (
            <p
              role="alert"
              className="flex items-start gap-1.5 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive"
            >
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {error}
            </p>
          )}

          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={saving}
            >
              <X className="h-4 w-4" aria-hidden="true" />
              Annulla
            </Button>
            <Button
              type="button"
              onClick={handleSubmit}
              disabled={saving || !isDirty}
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : null}
              Salva
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmCloseOpen}
        title="Esci senza salvare?"
        description="Le modifiche non salvate andranno perse."
        confirmLabel="Esci"
        cancelLabel="Continua a modificare"
        destructive
        onConfirm={() => {
          setConfirmCloseOpen(false);
          setOpen(false);
        }}
        onCancel={() => setConfirmCloseOpen(false)}
      />
    </>
  );
}
